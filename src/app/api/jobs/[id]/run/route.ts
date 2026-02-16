import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// POST /api/jobs/[id]/run - Manually trigger a job run (ignores schedule)
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { id } = params;

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from("scheduled_jobs")
      .select("*")
      .eq("id", id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Create session - use Slack channel if configured in delivery_context
    const deliveryContext = (job.task_context as Record<string, any>)?.delivery_context;
    const isSlackDelivery = deliveryContext?.channel_type === "slack" && deliveryContext?.channel_id;
    
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .insert({
        agent_id: job.agent_id,
        channel_type: isSlackDelivery ? "slack" : "cron",
        channel_id: isSlackDelivery ? deliveryContext.channel_id : job.id,
        display_name: `${isSlackDelivery ? 'Slack Job' : 'Manual Run'}: ${job.name}`,
        status: "active",
        // Note: No thread_ts for cron jobs - posts as new message, not in thread
        slack_meta: isSlackDelivery ? {
          channel_id: deliveryContext.channel_id,
          posted_messages: [],
        } : null,
      })
      .select()
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: `Failed to create session: ${sessionError?.message}` },
        { status: 500 }
      );
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
          _manual_run: true,
        },
      })
      .select()
      .single();

    if (taskError || !task) {
      return NextResponse.json(
        { error: `Failed to create task: ${taskError?.message}` },
        { status: 500 }
      );
    }

    // Log the manual run (initially pending)
    const { data: jobRun } = await supabase
      .from("scheduled_job_runs")
      .insert({
        job_id: job.id,
        task_id: task.id,
        status: "pending",
      })
      .select()
      .single();

    // Process task locally and update job run status
    const { processTask } = await import("@/lib/engine/process-task");
    try {
      processTask(task.id, supabaseUrl, supabaseServiceKey)
        .then(async (result) => {
          if (jobRun) {
            await supabase
              .from("scheduled_job_runs")
              .update({
                status: result.success ? "success" : "failed",
                error_message: result.success ? null : result.error,
              })
              .eq("id", jobRun.id);
          }
          if (!result.success) console.error("Job task failed:", result.error);
        })
        .catch(async (err) => {
          console.error("Job task error:", err);
          if (jobRun) {
            await supabase
              .from("scheduled_job_runs")
              .update({
                status: "failed",
                error_message: err instanceof Error ? err.message : String(err),
              })
              .eq("id", jobRun.id);
          }
        });
    } catch (invokeErr) {
      console.error("Failed to invoke process-task:", invokeErr);
      if (jobRun) {
        await supabase
          .from("scheduled_job_runs")
          .update({
            status: "failed",
            error_message: invokeErr instanceof Error ? invokeErr.message : String(invokeErr),
          })
          .eq("id", jobRun.id);
      }
    }

    return NextResponse.json({
      success: true,
      task_id: task.id,
      session_id: session.id,
      message: `Manually triggered job "${job.name}"`
    }, { status: 201 });
  } catch (error) {
    console.error("POST /api/jobs/[id]/run error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
