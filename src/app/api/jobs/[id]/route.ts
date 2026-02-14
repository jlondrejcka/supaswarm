import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// GET /api/jobs/[id] - Get single job with details
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { id } = params;

    const { data: job, error } = await supabase
      .from("scheduled_jobs")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Get run history
    const { data: runs } = await supabase
      .from("scheduled_job_runs")
      .select("*")
      .eq("job_id", id)
      .order("created_at", { ascending: false })
      .limit(100);

    // Get running tasks
    const { data: sessions } = await supabase
      .from("sessions")
      .select("id, channel_id, status, created_at")
      .eq("channel_type", "cron")
      .eq("channel_id", id)
      .in("status", ["active", "idle"]);

    let runningTasks: Array<{ id: string; status: string; created_at: string | null; session_id: string | null; agent_slug: string | null }> = [];
    if (sessions && sessions.length > 0) {
      const sessionIds = sessions.map(s => s.id);
      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, status, created_at, session_id, agent_slug")
        .in("session_id", sessionIds)
        .in("status", ["pending", "running", "pending_subtask"])
        .order("created_at", { ascending: false });

      runningTasks = tasks || [];
    }

    return NextResponse.json({
      job,
      runs: runs || [],
      running_tasks: runningTasks,
      stats: {
        total_runs: job.total_runs || 0,
        failed_runs: job.failed_runs || 0,
        success_rate: job.total_runs > 0 
          ? ((job.total_runs - job.failed_runs) / job.total_runs * 100).toFixed(1) 
          : 0
      }
    });
  } catch (error) {
    console.error("GET /api/jobs/[id] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
