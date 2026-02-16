import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// ============================================================================
// Types
// ============================================================================

interface SlackReply {
  id: string;
  task_id: string;
  type: string;
  content: string | Record<string, unknown>;
  metadata: Record<string, unknown> | null;
}

interface TaskMessage extends SlackReply {
  slack_notify: boolean;
  slack_sent: boolean;
}

interface Session {
  id: string;
  agent_id: string | null;
  channel_type: string;
  slack_meta: {
    channel_id: string;
    thread_ts: string;
    original_message_ts: string;
    api_app_id?: string;
    posted_messages?: Array<{ ts: string; type: string; task_id: string; at: string }>;
  } | null;
}

interface Task {
  id: string;
  session_id: string;
  agent_id: string | null;
  input: string;
  status: string;
}

// ============================================================================
// Slack Message Formatting
// ============================================================================

function formatSlackMessage(
  messageType: string,
  content: string,
  metadata?: Record<string, unknown>
): string {
  const SLACK_MAX_TEXT_LENGTH = 39000;

  switch (messageType) {
    case "delegation_start": {
      const agentName = metadata?.target_agent_name || "another agent";
      return `:arrows_counterclockwise: _Handing off to *${agentName}*..._`;
    }
    case "delegation_complete": {
      const fromAgent = metadata?.from_agent_slug || "sub-agent";
      return `:white_check_mark: _Received response from *${fromAgent}*_`;
    }
    case "error": {
      return `:warning: An error occurred while processing your request.`;
    }
    case "assistant_message": {
      // Truncate if exceeds Slack limit
      if (content.length > SLACK_MAX_TEXT_LENGTH) {
        return (
          content.substring(0, SLACK_MAX_TEXT_LENGTH) +
          "\n\n_(message truncated)_"
        );
      }
      return content;
    }
    default:
      return content;
  }
}

// ============================================================================
// Slack Web API Helper
// ============================================================================

async function slackApi(
  botToken: string,
  method: string,
  body: Record<string, unknown>
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
      console.warn(`[SLACK-REPLY] ${method} failed:`, data.error);
    }
    return data;
  } catch (err) {
    console.error(`[SLACK-REPLY] ${method} error:`, err);
    return { ok: false, error: String(err) };
  }
}

// ============================================================================
// Vault Helper
// ============================================================================

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
    console.error(
      `[SLACK-REPLY] Failed to fetch vault secret ${secretName}:`,
      err
    );
    return null;
  }
}

// ============================================================================
// Reply Handler
// ============================================================================

export async function handleSlackReply(reply: SlackReply): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("[SLACK-REPLY] Supabase credentials missing");
    return;
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    console.log("[SLACK-REPLY] Processing reply", {
      reply_id: reply.id,
      task_id: reply.task_id,
      type: reply.type,
    });

    // ---- Step 1: Fetch task + session ----
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .select("id, session_id, agent_id, input, status")
      .eq("id", reply.task_id)
      .single();

    if (taskError || !task || !task.session_id) {
      console.error(
        "[SLACK-REPLY] Task not found or no session:",
        reply.task_id
      );
      return;
    }

    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("id, agent_id, channel_type, slack_meta")
      .eq("id", task.session_id)
      .single();

    if (
      sessionError ||
      !session ||
      session.channel_type !== "slack" ||
      !session.slack_meta
    ) {
      console.error(
        "[SLACK-REPLY] Session not Slack or missing slack_meta:",
        task.session_id
      );
      return;
    }

    const slackMeta = session.slack_meta as {
      channel_id: string;
      thread_ts: string;
      original_message_ts: string;
      api_app_id?: string;
      posted_messages?: Array<{
        ts: string;
        type: string;
        task_id: string;
        at: string;
      }>;
    };

    // ---- Step 2: Resolve bot token ----
    let botToken: string | null = null;

    // Try per-agent token first
    if (session.agent_id) {
      const { data: agentData } = await supabase
        .from("agents")
        .select("slack_bot_token_secret")
        .eq("id", session.agent_id)
        .single();

      if (agentData?.slack_bot_token_secret) {
        botToken = await getVaultSecret(agentData.slack_bot_token_secret);
      }
    }

    // Fallback to global token
    if (!botToken) {
      botToken = await getVaultSecret("SLACK_BOT_TOKEN");
    }

    if (!botToken) {
      console.error(
        "[SLACK-REPLY] No bot token available for session:",
        session.id
      );
      return;
    }

    // ---- Step 3: Format + post to Slack ----
    const contentText =
      typeof reply.content === "object" && reply.content !== null
        ? ((reply.content as { text?: string }).text || JSON.stringify(reply.content))
        : String(reply.content);

    const messageMetadata = reply.metadata as
      | Record<string, unknown>
      | null;
    const slackText = formatSlackMessage(
      reply.type,
      contentText,
      messageMetadata || undefined
    );

    const channelId = slackMeta.channel_id;
    const threadTs = slackMeta.thread_ts;

    console.log("[SLACK-REPLY] Posting to Slack", {
      channel: channelId,
      thread_ts: threadTs,
      type: reply.type,
      text_length: slackText.length,
    });

    const postResult = await slackApi(botToken, "chat.postMessage", {
      channel: channelId,
      thread_ts: threadTs,
      text: slackText,
    });

    if (!postResult.ok) {
      console.error("[SLACK-REPLY] Failed to post:", postResult.error);
      return;
    }

    const postedTs = postResult.ts || "";

    // ---- Step 4: Update slack_sent flag and slack_message_ts ----
    await supabase
      .from("task_messages")
      .update({
        slack_sent: true,
        slack_message_ts: postedTs,
      })
      .eq("id", reply.id);

    // ---- Step 5: Append to session.slack_meta.posted_messages ----
    const postedMessages = slackMeta.posted_messages || [];
    postedMessages.push({
      ts: postedTs,
      type: reply.type,
      task_id: reply.task_id,
      at: new Date().toISOString(),
    });

    await supabase
      .from("sessions")
      .update({
        slack_meta: {
          ...slackMeta,
          posted_messages: postedMessages,
        },
      })
      .eq("id", session.id);

    // ---- Step 6: Remove eyes reaction on final message ----
    if (reply.type === "assistant_message") {
      // Remove reaction from the original user message that triggered this task
      const taskInput = task.input as { slack_message_ts?: string } | null;
      const reactionMessageTs =
        taskInput?.slack_message_ts || slackMeta.original_message_ts;

      if (reactionMessageTs) {
        await slackApi(botToken, "reactions.remove", {
          channel: channelId,
          name: "eyes",
          timestamp: reactionMessageTs,
        });
      }
    }

    console.log("[SLACK-REPLY] Successfully posted", {
      reply_id: reply.id,
      type: reply.type,
      slack_ts: postedTs,
    });
  } catch (err) {
    console.error("[SLACK-REPLY] Unhandled error:", err);
  }
}

// ============================================================================
// Worker Function for Processing pgmq Queue
// ============================================================================

export async function processSlackReplies(): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("[SLACK-REPLY] Supabase credentials missing");
    return;
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // Read from slack_replies pgmq queue
    const { data: messages, error: queueError } = await supabase.rpc(
      "pgmq_read",
      {
        queue_name: "slack_replies",
        vt: 30, // Visibility timeout: 30 seconds
        limit: 10, // Process up to 10 at a time
      }
    );

    if (queueError) {
      console.error("[SLACK-REPLY] Failed to read queue:", queueError);
      return;
    }

    if (!messages || messages.length === 0) {
      console.log("[SLACK-REPLY] No messages in queue");
      return;
    }

    console.log(
      `[SLACK-REPLY] Processing ${messages.length} message(s) from queue`
    );

    for (const msg of messages) {
      try {
        const reply: SlackReply = msg.message;
        await handleSlackReply(reply);

        // Delete processed message from queue
        await supabase.rpc("pgmq_delete", {
          queue_name: "slack_replies",
          msg_id: msg.msg_id,
        });
      } catch (err) {
        console.error(
          "[SLACK-REPLY] Failed to process message:",
          msg.msg_id,
          err
        );
      }
    }
  } catch (err) {
    console.error("[SLACK-REPLY] Worker error:", err);
  }
}
