import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/**
 * slack-reply — Posts messages to Slack for task_messages flagged with slack_notify
 *
 * Invoked by DB trigger (pg_net) when a task_message is inserted with slack_notify=true.
 * Reads the task_message, resolves the session's Slack context, posts to Slack,
 * then updates slack_sent=true + slack_message_ts on the row and appends to
 * session.slack_meta.posted_messages.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Max Slack message length (text field)
const SLACK_MAX_TEXT_LENGTH = 39000;

// ============================================================================
// Slack Web API helper
// ============================================================================

async function slackApi(
  method: string,
  botToken: string,
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
      console.warn(`[SLACK-REPLY] ${method} failed:`, data.error);
    }
    return data;
  } catch (err) {
    console.error(`[SLACK-REPLY] ${method} error:`, err);
    return { ok: false, error: String(err) };
  }
}

// ============================================================================
// Message formatting
// ============================================================================

function formatSlackMessage(
  messageType: string,
  content: string,
  metadata?: Record<string, unknown>,
): string {
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
        return content.substring(0, SLACK_MAX_TEXT_LENGTH) + "\n\n_(message truncated)_";
      }
      return content;
    }
    default:
      return content;
  }
}

// ============================================================================
// Main handler
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { task_message_id } = await req.json();

    if (!task_message_id) {
      return new Response(
        JSON.stringify({ error: "task_message_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ---- Step 1: Fetch the task_message ----
    const { data: taskMessage, error: msgError } = await supabase
      .from("task_messages")
      .select("id, task_id, type, content, metadata, slack_notify, slack_sent")
      .eq("id", task_message_id)
      .single();

    if (msgError || !taskMessage) {
      console.error("[SLACK-REPLY] Task message not found:", task_message_id, msgError?.message);
      return new Response(
        JSON.stringify({ error: "task_message_not_found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Skip if already sent or not flagged
    if (taskMessage.slack_sent) {
      return new Response(
        JSON.stringify({ ok: true, skipped: "already_sent" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!taskMessage.slack_notify) {
      return new Response(
        JSON.stringify({ ok: true, skipped: "not_flagged" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---- Step 2: Fetch task + session ----
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .select("id, session_id, agent_id, input, status")
      .eq("id", taskMessage.task_id)
      .single();

    if (taskError || !task || !task.session_id) {
      console.error("[SLACK-REPLY] Task not found or no session:", taskMessage.task_id);
      return new Response(
        JSON.stringify({ error: "task_not_found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("id, agent_id, channel_type, slack_meta")
      .eq("id", task.session_id)
      .single();

    if (sessionError || !session || session.channel_type !== "slack" || !session.slack_meta) {
      console.error("[SLACK-REPLY] Session not Slack or missing slack_meta:", task.session_id);
      return new Response(
        JSON.stringify({ ok: true, skipped: "not_slack_session" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const slackMeta = session.slack_meta as {
      channel_id: string;
      thread_ts: string;
      original_message_ts: string;
      api_app_id?: string;
      posted_messages?: Array<{ ts: string; type: string; task_id: string; at: string }>;
    };

    // ---- Step 3: Resolve bot token ----
    let botToken: string | null = null;

    // Try per-agent token first
    if (session.agent_id) {
      const { data: agentData } = await supabase
        .from("agents")
        .select("slack_bot_token_secret")
        .eq("id", session.agent_id)
        .single();

      if (agentData?.slack_bot_token_secret) {
        const { data: token } = await supabase.rpc("get_vault_secret", {
          secret_name: agentData.slack_bot_token_secret,
        });
        if (token) botToken = token;
      }
    }

    // Fallback to global token
    if (!botToken) {
      const { data: globalToken } = await supabase.rpc("get_vault_secret", {
        secret_name: "SLACK_BOT_TOKEN",
      });
      botToken = globalToken || null;
    }

    if (!botToken) {
      console.error("[SLACK-REPLY] No bot token available for session:", session.id);
      return new Response(
        JSON.stringify({ error: "no_bot_token" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---- Step 4: Format + post to Slack ----
    const contentText = typeof taskMessage.content === "object" && taskMessage.content !== null
      ? (taskMessage.content as { text?: string }).text || JSON.stringify(taskMessage.content)
      : String(taskMessage.content);

    const messageMetadata = taskMessage.metadata as Record<string, unknown> | null;
    const slackText = formatSlackMessage(taskMessage.type, contentText, messageMetadata || undefined);

    const channelId = slackMeta.channel_id;
    const threadTs = slackMeta.thread_ts;

    console.log("[SLACK-REPLY] Posting to Slack", {
      channel: channelId,
      thread_ts: threadTs,
      type: taskMessage.type,
      text_length: slackText.length,
    });

    const postResult = await slackApi("chat.postMessage", botToken, {
      channel: channelId,
      thread_ts: threadTs,
      text: slackText,
    });

    if (!postResult.ok) {
      console.error("[SLACK-REPLY] Failed to post:", postResult.error);
      return new Response(
        JSON.stringify({ error: "slack_post_failed", detail: postResult.error }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const postedTs = postResult.ts || "";

    // ---- Step 5: Update task_message with sent status ----
    await supabase
      .from("task_messages")
      .update({
        slack_sent: true,
        slack_message_ts: postedTs,
      })
      .eq("id", task_message_id);

    // ---- Step 6: Append to session.slack_meta.posted_messages ----
    const postedMessages = slackMeta.posted_messages || [];
    postedMessages.push({
      ts: postedTs,
      type: taskMessage.type,
      task_id: taskMessage.task_id,
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

    // ---- Step 7: Remove eyes reaction on final response ----
    if (taskMessage.type === "assistant_message") {
      // Remove reaction from the original user message that triggered this task
      const taskInput = task.input as { slack_message_ts?: string } | null;
      const reactionMessageTs = taskInput?.slack_message_ts || slackMeta.original_message_ts;

      if (reactionMessageTs) {
        await slackApi("reactions.remove", botToken, {
          channel: channelId,
          name: "eyes",
          timestamp: reactionMessageTs,
        });
      }
    }

    console.log("[SLACK-REPLY] Successfully posted", {
      task_message_id,
      type: taskMessage.type,
      slack_ts: postedTs,
    });

    return new Response(
      JSON.stringify({ ok: true, slack_ts: postedTs }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[SLACK-REPLY] Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
