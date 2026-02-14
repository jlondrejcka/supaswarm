import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// POST /api/jobs/[id]/cancel - Cancel all running tasks for a job
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { id } = params;

    // Verify job exists
    const { data: job, error: jobError } = await supabase
      .from("scheduled_jobs")
      .select("id, name")
      .eq("id", id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Get active sessions for this job
    const { data: sessions, error: sessionsError } = await supabase
      .from("sessions")
      .select("id")
      .eq("channel_type", "cron")
      .eq("channel_id", id)
      .in("status", ["active", "idle"]);

    if (sessionsError) {
      return NextResponse.json(
        { error: sessionsError.message },
        { status: 500 }
      );
    }

    if (!sessions || sessions.length === 0) {
      return NextResponse.json({
        success: true,
        cancelled_count: 0,
        message: "No active tasks to cancel"
      });
    }

    const sessionIds = sessions.map(s => s.id);

    // Get running tasks
    const { data: tasks, error: tasksError } = await supabase
      .from("tasks")
      .select("id")
      .in("session_id", sessionIds)
      .in("status", ["pending", "running", "pending_subtask"]);

    if (tasksError) {
      return NextResponse.json(
        { error: tasksError.message },
        { status: 500 }
      );
    }

    if (!tasks || tasks.length === 0) {
      return NextResponse.json({
        success: true,
        cancelled_count: 0,
        message: "No running tasks found"
      });
    }

    const taskIds = tasks.map(t => t.id);

    // Cancel all tasks
    const { error: cancelError } = await supabase
      .from("tasks")
      .update({
        status: "cancelled",
        output: { cancelled_by: "api", cancelled_at: new Date().toISOString() },
        updated_at: new Date().toISOString()
      })
      .in("id", taskIds);

    if (cancelError) {
      return NextResponse.json(
        { error: cancelError.message },
        { status: 500 }
      );
    }

    // Close sessions
    await supabase
      .from("sessions")
      .update({ status: "completed" })
      .in("id", sessionIds);

    return NextResponse.json({
      success: true,
      cancelled_count: tasks.length,
      task_ids: taskIds,
      message: `Cancelled ${tasks.length} task(s) for job "${job.name}"`
    });
  } catch (error) {
    console.error("POST /api/jobs/[id]/cancel error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
