import { App, LogLevel } from "@slack/bolt";
import { createClient } from "@supabase/supabase-js";
import type { Agent } from "@/lib/engine/types";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// ============================================================================
// Types
// ============================================================================

interface BoltAppInstance {
  app: App;
  agent: Agent;
}

// Map of agent.id → BoltAppInstance
const activeApps = new Map<string, BoltAppInstance>();

// ============================================================================
// Helpers
// ============================================================================

function getVaultKeyName(slug: string, suffix: string): string {
  return `SLACK_${suffix}_${slug.toUpperCase().replace(/-/g, "_")}`;
}

async function getVaultSecret(secretName: string): Promise<string | null> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data } = await supabase.rpc("get_vault_secret", {
      secret_name: secretName,
    });
    return data || null;
  } catch (err) {
    console.error(`[BOLT] Failed to fetch vault secret ${secretName}:`, err);
    return null;
  }
}

async function verifySlackSignature(
  signingSecret: string,
  timestamp: string,
  rawBody: string,
  signature: string,
): Promise<boolean> {
  try {
    // Reject requests older than 5 minutes (replay protection)
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parseInt(timestamp)) > 300) {
      console.warn("[BOLT] Request timestamp too old:", timestamp);
      return false;
    }

    const sigBasestring = `v0:${timestamp}:${rawBody}`;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(signingSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(sigBasestring),
    );
    const hexSig =
      "v0=" +
      Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

    return hexSig === signature;
  } catch (err) {
    console.error("[BOLT] Signature verification error:", err);
    return false;
  }
}

async function deduplicateEvent(
  supabase: ReturnType<typeof createClient>,
  eventId: string,
  _eventTimestamp: string,
): Promise<boolean> {
  try {
    // Try to insert - if it succeeds, it's new; if it fails with unique constraint, it's a duplicate
    // Using @ts-ignore because slack_event_dedup is not in the generated types
    const { error } = await (supabase as any)
      .from("slack_event_dedup")
      .insert({ event_id: eventId });

    if (error) {
      // Check if it's a unique constraint violation (duplicate)
      if ((error as any).code === "23505") {
        console.log("[BOLT] Event already processed (deduped):", eventId);
        return true; // Already processed, skip
      }
      // Some other error occurred
      console.warn("[BOLT] Deduplication check error:", error);
      return false; // Proceed if dedup fails
    }

    return false; // First time seeing this event
  } catch (err) {
    console.warn("[BOLT] Deduplication check failed:", err);
    return false; // Proceed if dedup fails
  }
}

async function slackApi(
  botToken: string,
  method: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; ts?: string; error?: string }> {
  try {
    const resp = await fetch(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    if (!data.ok) {
      console.warn(`[BOLT] ${method} failed:`, data.error);
    }
    return data;
  } catch (err) {
    console.error(`[BOLT] ${method} error:`, err);
    return { ok: false, error: String(err) };
  }
}

// ============================================================================
// Bolt App Setup
// ============================================================================

async function setupBoltApp(agent: Agent): Promise<BoltAppInstance | null> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("[BOLT] Supabase credentials missing");
    return null;
  }

  if (!agent.slack_app_id) {
    console.log(`[BOLT] Agent ${agent.slug} has no Slack app configured`);
    return null;
  }

  // Get bot token
  const botTokenSecretName = agent.slack_bot_token_secret;
  if (!botTokenSecretName) {
    console.error(
      `[BOLT] Agent ${agent.slug} missing bot token secret name`
    );
    return null;
  }

  const botToken = await getVaultSecret(botTokenSecretName);
  if (!botToken) {
    console.error(
      `[BOLT] Failed to fetch bot token for agent ${agent.slug}`
    );
    return null;
  }

  // Get app token (for Socket Mode)
  const appTokenSecretName = `SLACK_APP_TOKEN_${agent.slug
    .toUpperCase()
    .replace(/-/g, "_")}`;
  const appToken = await getVaultSecret(appTokenSecretName);

  // Fallback to global app token
  const globalAppToken = await getVaultSecret("SLACK_APP_TOKEN");
  const finalAppToken = appToken || globalAppToken;

  if (!finalAppToken) {
    console.error(
      `[BOLT] No app token found for agent ${agent.slug} (checked per-agent and global)`
    );
    return null;
  }

  try {
    // Initialize Bolt app with Socket Mode
    const app = new App({
      token: botToken,
      appToken: finalAppToken,
      socketMode: true,
      logLevel: LogLevel.DEBUG,
    });

    // Register event listeners
    setupEventListeners(app, agent);

    console.log(
      `[BOLT] Initialized Bolt app for agent ${agent.slug} with app ${agent.slack_app_id}`
    );

    return { app, agent };
  } catch (err) {
    console.error(
      `[BOLT] Failed to initialize app for agent ${agent.slug}:`,
      err
    );
    return null;
  }
}

function setupEventListeners(app: App, agent: Agent): void {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Listen for messages
  app.message(async ({ message, say }: any) => {
    // Add type guard for message
    const typedMessage = message as {
      type?: string;
      text?: string;
      bot_id?: string;
      subtype?: string;
      user?: string;
      channel?: string;
      ts?: string;
      thread_ts?: string;
    };

    if (typeof typedMessage.text !== "string") {
      console.log("[BOLT] Skipping non-text message");
      return;
    }

    // Ignore bot messages
    if (typedMessage.bot_id || typedMessage.subtype === "bot_message") {
      console.log("[BOLT] Ignoring bot message");
      return;
    }

    try {
      const eventId = `${typedMessage.ts}-${typedMessage.channel}`;
      const eventTs = typedMessage.ts || new Date().toISOString();

      // Check deduplication
      const isDuplicate = await deduplicateEvent(supabase as any, eventId, eventTs);
      if (isDuplicate) {
        return;
      }

      // Get or create session
      const {
        data: existingSession,
        error: sessionError,
      } = await supabase
        .from("sessions")
        .select("id, slack_meta")
        .eq("channel_type", "slack")
        .eq("channel_id", typedMessage.channel as string)
        .eq("thread_ts", (typedMessage.thread_ts || typedMessage.ts) as string)
        .eq("is_closed", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      let sessionId: string;
      let slackMeta: any;

      if (existingSession) {
        sessionId = existingSession.id;
        slackMeta = existingSession.slack_meta || {};
      } else {
        // Create new session
        const newSessionResponse = await supabase
          .from("sessions")
          .insert({
            agent_id: agent.id,
            channel_type: "slack",
            channel_id: typedMessage.channel as string,
            is_closed: false,
            slack_meta: {
              channel_id: typedMessage.channel as string,
              thread_ts: (typedMessage.thread_ts || typedMessage.ts) as string,
              original_message_ts: typedMessage.ts as string,
              api_app_id: agent.slack_app_id,
              user_id: typedMessage.user as string,
              posted_messages: [],
            },
          })
          .select("id, slack_meta")
          .single();

        if (newSessionResponse.error) {
          console.error("[BOLT] Failed to create session:", newSessionResponse.error);
          return;
        }

        sessionId = newSessionResponse.data!.id;
        slackMeta = newSessionResponse.data!.slack_meta;
      }

      // Create task
      const { data: task, error: taskError } = await supabase
        .from("tasks")
        .insert({
          session_id: sessionId,
          agent_id: agent.id,
          input: typedMessage.text,
          status: "pending",
          metadata: {
            slack_message_ts: typedMessage.ts,
            slack_channel: typedMessage.channel,
            slack_thread_ts: typedMessage.thread_ts || typedMessage.ts,
          },
        })
        .select("id")
        .single();

      if (taskError || !task) {
        console.error("[BOLT] Failed to create task:", taskError?.message);
        return;
      }

      // Add eyes reaction (ack)
      const botToken = await getVaultSecret(agent.slack_bot_token_secret!);
      if (botToken) {
        await slackApi(botToken, "reactions.add", {
          channel: typedMessage.channel as string,
          timestamp: typedMessage.ts as string,
          name: "eyes",
        });
      }

      console.log("[BOLT] Created task", {
        task_id: task.id,
        session_id: sessionId,
        agent_id: agent.id,
      });

      // Acknowledge the message
      await say(`:eyes: Processing your message...`);
    } catch (err) {
      console.error("[BOLT] Error handling message:", err);
      await say(`:warning: An error occurred while processing your message.`);
    }
  });

  // Handle errors
  app.error(async (error: Error) => {
    console.error("[BOLT] App error:", error);
  });
}

// ============================================================================
// Public API
// ============================================================================

export async function startSlackBots(): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.warn(
      "[BOLT] Supabase credentials missing, skipping Slack bot startup"
    );
    return;
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // Fetch all active agents with Slack configured
    const { data: agents, error } = await supabase
      .from("agents")
      .select("*")
      .eq("is_active", true)
      .not("slack_app_id", "is", null);

    if (error) {
      console.error("[BOLT] Failed to fetch agents:", error);
      return;
    }

    if (!agents || agents.length === 0) {
      console.log("[BOLT] No agents with Slack configured");
      return;
    }

    console.log(
      `[BOLT] Starting ${agents.length} Slack bot(s)...`
    );

    // Setup and start each agent's bot
    for (const agent of agents) {
      const instance = await setupBoltApp(agent);
      if (instance) {
        activeApps.set(agent.id, instance);

        try {
          // Start Socket Mode
          await instance.app.start();
          console.log(
            `[BOLT] Socket Mode connected for agent ${agent.slug}`
          );
        } catch (err) {
          console.error(
            `[BOLT] Failed to start Socket Mode for agent ${agent.slug}:`,
            err
          );
          activeApps.delete(agent.id);
        }
      }
    }

    console.log(
      `[BOLT] Successfully started ${activeApps.size} Slack bot(s)`
    );
  } catch (err) {
    console.error("[BOLT] Failed to start Slack bots:", err);
  }
}

export async function stopSlackBots(): Promise<void> {
  console.log("[BOLT] Stopping all Slack bots...");

  const entries = Array.from(activeApps.entries());
  for (const [agentId, instance] of entries) {
    try {
      await instance.app.stop();
      console.log(`[BOLT] Stopped bot for agent ${instance.agent.slug}`);
    } catch (err) {
      console.error(`[BOLT] Error stopping bot for agent ${agentId}:`, err);
    }
  }

  activeApps.clear();
}

export function getActiveApps(): Map<string, BoltAppInstance> {
  return activeApps;
}

export async function getAppInstance(
  agentId: string
): Promise<BoltAppInstance | null> {
  return activeApps.get(agentId) || null;
}
