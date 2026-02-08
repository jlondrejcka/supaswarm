import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/**
 * process-pending-tasks — Cron-invoked edge function
 * Polls for tasks in 'pending' status and invokes process-task for each.
 * Fallback mechanism for when pg_net trigger fails or is unavailable.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BATCH_LIMIT = 5;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Find pending tasks ordered by oldest first
    const { data: pendingTasks, error } = await supabase
      .from("tasks")
      .select("id, agent_id, created_at")
      .eq("status", "pending")
      .not("agent_id", "is", null)
      .order("updated_at", { ascending: true })
      .limit(BATCH_LIMIT);

    if (error) {
      console.error("[CRON] Failed to query pending tasks:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!pendingTasks || pendingTasks.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, message: "No pending tasks" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[CRON] Found ${pendingTasks.length} pending task(s)`);

    const results: Array<{ task_id: string; status: string }> = [];

    for (const task of pendingTasks) {
      try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/process-task`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ task_id: task.id }),
        });

        results.push({
          task_id: task.id,
          status: resp.ok ? "invoked" : `error_${resp.status}`,
        });
      } catch (invokeErr) {
        console.error(`[CRON] Failed to invoke task ${task.id}:`, invokeErr);
        results.push({ task_id: task.id, status: "invoke_failed" });
      }
    }

    return new Response(
      JSON.stringify({ processed: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[CRON] Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
