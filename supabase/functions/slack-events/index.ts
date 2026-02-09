import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/**
 * slack-events — Receives Slack Events API webhooks
 *
 * Flow:
 *   1. URL verification challenge
 *   2. Verify request signature (HMAC-SHA256)
 *   3. Deduplicate via slack_event_dedup table
 *   4. Ignore bot messages
 *   5. Add eyes reaction (ack)
 *   6. Find or create session + create task
 *   7. Invoke process-task
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-slack-signature, x-slack-request-timestamp",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ============================================================================
// Crypto helpers
// ============================================================================

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
      console.warn("[SLACK] Request timestamp too old:", timestamp);
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
    const hexSig = "v0=" + Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return hexSig === signature;
  } catch (err) {
    console.error("[SLACK] Signature verification error:", err);
    return false;
  }
}

// ============================================================================
// Slack Web API helper
// ============================================================================

async function slackApiCall(
  method: string,
  botToken: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
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
      console.warn(`[SLACK] ${method} failed:`, data.error);
    }
    return data;
  } catch (err) {
    console.error(`[SLACK] ${method} error:`, err);
    return { ok: false, error: String(err) };
  }
}

// ============================================================================
// Main handler
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const rawBody = await req.text();

  try {
    const body = JSON.parse(rawBody);

    // ---- Step 1: URL verification challenge ----
    if (body.type === "url_verification") {
      console.log("[SLACK] URL verification challenge received");
      return new Response(
        JSON.stringify({ challenge: body.challenge }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---- Step 2: Only handle event_callback ----
    if (body.type !== "event_callback") {
      return new Response(
        JSON.stringify({ ok: true, skipped: body.type }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const event = body.event;
    if (!event) {
      return new Response(
        JSON.stringify({ ok: true, skipped: "no_event" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---- Step 3: Ignore bot messages ----
    if (event.bot_id || event.subtype === "bot_message") {
      return new Response(
        JSON.stringify({ ok: true, skipped: "bot_message" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Ignore message subtypes (edits, deletes, etc.) — only process plain messages
    if (event.subtype) {
      return new Response(
        JSON.stringify({ ok: true, skipped: `subtype_${event.subtype}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---- Step 4: Supabase client ----
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ---- Step 5: Resolve agent by api_app_id ----
    const apiAppId = body.api_app_id || null;
    let agent: { id: string; slug: string; name: string; slack_bot_token_secret: string | null; slack_signing_secret_name: string | null } | null = null;
    let botToken: string | null = null;
    let signingSecret: string | null = null;

    if (apiAppId) {
      const { data: matchedAgent } = await supabase
        .from("agents")
        .select("id, slug, name, slack_bot_token_secret, slack_signing_secret_name")
        .eq("slack_app_id", apiAppId)
        .eq("is_active", true)
        .single();

      if (matchedAgent) {
        agent = matchedAgent;

        // Fetch per-agent signing secret
        if (agent.slack_signing_secret_name) {
          const { data: secret } = await supabase.rpc("get_vault_secret", {
            secret_name: agent.slack_signing_secret_name,
          });
          if (secret) signingSecret = secret;
        }

        // Fetch per-agent bot token
        if (agent.slack_bot_token_secret) {
          const { data: token } = await supabase.rpc("get_vault_secret", {
            secret_name: agent.slack_bot_token_secret,
          });
          if (token) botToken = token;
        }
      }
    }

    // Fallback to global secrets if no per-agent config
    if (!signingSecret) {
      const { data: globalSigning } = await supabase.rpc("get_vault_secret", {
        secret_name: "SLACK_SIGNING_SECRET",
      });
      signingSecret = globalSigning || null;
    }

    if (!botToken) {
      const { data: globalToken } = await supabase.rpc("get_vault_secret", {
        secret_name: "SLACK_BOT_TOKEN",
      });
      botToken = globalToken || null;
    }

    // ---- Step 6: Verify signature ----
    const slackSignature = req.headers.get("x-slack-signature") || "";
    const slackTimestamp = req.headers.get("x-slack-request-timestamp") || "";

    if (signingSecret) {
      const valid = await verifySlackSignature(
        signingSecret,
        slackTimestamp,
        rawBody,
        slackSignature,
      );
      if (!valid) {
        console.error("[SLACK] Invalid signature");
        return new Response(
          JSON.stringify({ error: "invalid_signature" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    } else {
      console.warn("[SLACK] No signing secret found — skipping verification");
    }

    // ---- Step 7: Deduplicate ----
    const eventId = body.event_id;
    if (eventId) {
      const { error: dedupError } = await supabase
        .from("slack_event_dedup")
        .insert({ event_id: eventId });

      if (dedupError) {
        // Duplicate — unique constraint violation
        if (dedupError.code === "23505") {
          console.log("[SLACK] Duplicate event, skipping:", eventId);
          return new Response(
            JSON.stringify({ ok: true, skipped: "duplicate" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        console.warn("[SLACK] Dedup insert error:", dedupError.message);
      }
    }

    // ---- Step 8: Extract + validate event data ----
    const channelId: string = event.channel;
    const messageTs: string = event.ts;
    const threadTs: string = event.thread_ts || event.ts; // Parent thread ts
    const userId: string = event.user;
    const text: string = event.text || "";
    const channelType: string = event.channel_type || "channel";
    const teamId: string = body.team_id || "";

    // Guard: skip events missing required fields (Slack retries/auth checks)
    if (!channelId || !messageTs || !userId) {
      console.warn("[SLACK] Missing required event fields, skipping", {
        channel: channelId, ts: messageTs, user: userId,
      });
      return new Response(
        JSON.stringify({ ok: true, skipped: "missing_fields" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("[SLACK] Processing message", {
      channel: channelId,
      thread_ts: threadTs,
      user: userId,
      text_length: text.length,
      api_app_id: apiAppId,
      agent_slug: agent?.slug || "default",
    });

    // ---- Step 9: Add eyes reaction ----
    if (botToken) {
      // Fire-and-forget, don't block on reaction
      slackApiCall("reactions.add", botToken, {
        channel: channelId,
        name: "eyes",
        timestamp: messageTs,
      });
    }

    // ---- Step 10: Find or create session ----
    // Look up existing active session for this channel + thread
    const { data: existingSession } = await supabase
      .from("sessions")
      .select("id, agent_id")
      .eq("channel_type", "slack")
      .eq("channel_id", channelId)
      .eq("thread_id", threadTs)
      .not("status", "in", '("closed","completed")')
      .limit(1)
      .single();

    let sessionId: string;
    let sessionAgentId: string | null = null;

    if (existingSession) {
      sessionId = existingSession.id;
      sessionAgentId = existingSession.agent_id;

      // Update last activity timestamp
      await supabase
        .from("sessions")
        .update({ last_activity_at: new Date().toISOString() })
        .eq("id", sessionId);

      console.log("[SLACK] Found existing session:", sessionId);
    } else {
      // Resolve default agent if no per-app agent matched
      if (!agent) {
        // Try channel_connections global config for default agent
        const { data: channelConn } = await supabase
          .from("channel_connections")
          .select("config")
          .eq("channel_id", "_global_slack_config")
          .single();

        const defaultAgentId = (channelConn?.config as Record<string, unknown>)?.default_agent_id as string | null || null;

        if (defaultAgentId) {
          const { data: defaultAgent } = await supabase
            .from("agents")
            .select("id, slug, name, slack_bot_token_secret, slack_signing_secret_name")
            .eq("id", defaultAgentId)
            .eq("is_active", true)
            .single();
          if (defaultAgent) agent = defaultAgent;
        }
      }

      const slackMeta = {
        team_id: teamId,
        channel_id: channelId,
        thread_ts: threadTs,
        user_id: userId,
        channel_type: channelType,
        original_message_ts: messageTs,
        api_app_id: apiAppId,
        posted_messages: [],
      };

      const { data: newSession, error: sessionError } = await supabase
        .from("sessions")
        .insert({
          agent_id: agent?.id || null,
          channel_type: "slack",
          channel_id: channelId,
          thread_id: threadTs,
          sender_id: userId,
          display_name: `Slack: ${channelType === "im" ? "DM" : channelId}`,
          status: "active",
          slack_meta: slackMeta,
          delivery_context: { source: "slack", api_app_id: apiAppId },
        })
        .select("id, agent_id")
        .single();

      if (sessionError || !newSession) {
        console.error("[SLACK] Failed to create session:", sessionError?.message);
        return new Response(
          JSON.stringify({ error: "session_creation_failed", detail: sessionError?.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      sessionId = newSession.id;
      sessionAgentId = newSession.agent_id;

      // Upsert channel_connections record
      await supabase
        .from("channel_connections")
        .upsert(
          {
            channel_type: "slack",
            channel_id: channelId,
            display_name: channelType === "im" ? `DM: ${userId}` : channelId,
            status: "active",
            last_event_at: new Date().toISOString(),
          },
          { onConflict: "channel_id" },
        )
        .then(() => {});

      console.log("[SLACK] Created new session:", sessionId);
    }

    // ---- Step 11: Create task ----
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .insert({
        agent_id: sessionAgentId || agent?.id || null,
        agent_slug: agent?.slug || null,
        session_id: sessionId,
        status: "pending",
        input: {
          message: text,
          slack_message_ts: messageTs, // For reaction removal after completion
        },
      })
      .select("id")
      .single();

    if (taskError || !task) {
      console.error("[SLACK] Failed to create task:", taskError?.message);
      return new Response(
        JSON.stringify({ error: "task_creation_failed", detail: taskError?.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("[SLACK] Created task:", task.id, "for session:", sessionId);

    // ---- Step 12: Invoke process-task (fire-and-forget) ----
    try {
      fetch(`${SUPABASE_URL}/functions/v1/process-task`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ task_id: task.id }),
      }).catch((err) => {
        console.error("[SLACK] Failed to invoke process-task:", err);
      });
    } catch (invokeErr) {
      console.error("[SLACK] Failed to invoke process-task:", invokeErr);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        session_id: sessionId,
        task_id: task.id,
        agent: agent?.slug || "default",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[SLACK] Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
