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

    // Create session
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .insert({
        agent_id: job.agent_id,
        channel_type: "cron",
        channel_id: job.id,
        display_name: `Manual Run: ${job.name}`,
        status: "active",
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

    // Log the manual run
    await supabase
      .from("scheduled_job_runs")
      .insert({
        job_id: job.id,
        task_id: task.id,
        status: "success",
      });

    // Invoke process-task
    try {
      await fetch(`${supabaseUrl}/functions/v1/process-task`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${supabaseServiceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ task_id: task.id }),
      });
    } catch (invokeErr) {
      console.error("Failed to invoke process-task:", invokeErr);
      // Don't fail the request if task invocation fails
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
