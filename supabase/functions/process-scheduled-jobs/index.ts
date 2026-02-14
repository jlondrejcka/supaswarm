import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/**
 * process-scheduled-jobs — Cron-invoked edge function
 * Checks for scheduled jobs due to run and creates tasks for them.
 * Should be invoked every minute via Supabase Edge Function Cron.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    console.log("[CRON] Checking scheduled jobs", { timestamp: new Date().toISOString() });

    // Find jobs due to run (next_run_at <= now, is_active = true)
    const { data: dueJobs, error } = await supabase
      .from("scheduled_jobs")
      .select("id, name, agent_id, task_message, task_context, interval_type, interval_config, total_runs, failed_runs")
      .eq("is_active", true)
      .lte("next_run_at", new Date().toISOString())
      .order("next_run_at", { ascending: true });

    if (error) {
      console.error("[CRON] Failed to query scheduled jobs:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!dueJobs || dueJobs.length === 0) {
      console.log("[CRON] No jobs due to run");
      return new Response(
        JSON.stringify({ processed: 0, message: "No jobs due" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[CRON] Found ${dueJobs.length} job(s) due to run`);

    const results: Array<{ job_id: string; job_name: string; status: string; task_id?: string; error?: string }> = [];

    for (const job of dueJobs) {
      try {
        // Create session for cron job
        const { data: session, error: sessionError } = await supabase
          .from("sessions")
          .insert({
            agent_id: job.agent_id,
            channel_type: "cron",
            channel_id: job.id,
            display_name: `Scheduled: ${job.name}`,
            status: "active",
          })
          .select()
          .single();

        if (sessionError || !session) {
          throw new Error(`Failed to create session: ${sessionError?.message}`);
        }

        // Create task
        const { data: task, error: taskError } = await supabase
          .from("tasks")
          .insert({
            session_id: session.id,
            agent_id: job.agent_id,
            status: "pending",
            input: { message: job.task_message },
            context: {
              ...(job.task_context || {}),
              _scheduled_job_id: job.id,
              _scheduled_job_name: job.name,
            },
          })
          .select()
          .single();

        if (taskError || !task) {
          throw new Error(`Failed to create task: ${taskError?.message}`);
        }

        console.log(`[CRON] Created task for job "${job.name}"`, {
          job_id: job.id,
          task_id: task.id,
          session_id: session.id,
        });

        // Calculate next run time
        const { data: nextRun } = await supabase.rpc("calculate_next_run", {
          p_interval_type: job.interval_type,
          p_interval_config: job.interval_config || {},
          p_last_run_at: new Date().toISOString(),
        });

        // Update job with last_run and next_run
        await supabase
          .from("scheduled_jobs")
          .update({
            last_run_at: new Date().toISOString(),
            next_run_at: nextRun || new Date(Date.now() + 3600000).toISOString(), // Fallback: 1 hour
            total_runs: (job.total_runs || 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);

        // Log the run
        await supabase
          .from("scheduled_job_runs")
          .insert({
            job_id: job.id,
            task_id: task.id,
            status: "success",
          });

        // Invoke process-task
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/process-task`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ task_id: task.id }),
          });
        } catch (invokeErr) {
          console.error(`[CRON] Failed to invoke task ${task.id}:`, invokeErr);
        }

        results.push({
          job_id: job.id,
          job_name: job.name,
          status: "success",
          task_id: task.id,
        });
      } catch (jobError) {
        const errorMsg = jobError instanceof Error ? jobError.message : String(jobError);
        console.error(`[CRON] Failed to process job ${job.id}:`, errorMsg);

        // Update failed run count
        await supabase
          .from("scheduled_jobs")
          .update({
            failed_runs: (job.failed_runs || 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);

        // Log the failed run
        await supabase
          .from("scheduled_job_runs")
          .insert({
            job_id: job.id,
            status: "failed",
            error_message: errorMsg,
          });

        results.push({
          job_id: job.id,
          job_name: job.name,
          status: "failed",
          error: errorMsg,
        });
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
