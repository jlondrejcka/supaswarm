import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// GET /api/jobs - List all scheduled jobs
// GET /api/jobs?active=true - List only active jobs
// GET /api/jobs?include_tasks=true - Include running tasks
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { searchParams } = new URL(request.url);
    
    const activeOnly = searchParams.get("active") === "true";
    const includeTasks = searchParams.get("include_tasks") === "true";
    const jobId = searchParams.get("id");

    // Get single job
    if (jobId) {
      const { data: job, error } = await supabase
        .from("scheduled_jobs")
        .select("*")
        .eq("id", jobId)
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }

      // Include run history if requested
      if (includeTasks) {
        const { data: runs } = await supabase
          .from("scheduled_job_runs")
          .select("*")
          .eq("job_id", jobId)
          .order("created_at", { ascending: false })
          .limit(50);

        return NextResponse.json({ job, runs: runs || [] });
      }

      return NextResponse.json({ job });
    }

    // List jobs
    let query = supabase
      .from("scheduled_jobs")
      .select("*")
      .order("created_at", { ascending: false });

    if (activeOnly) {
      query = query.eq("is_active", true);
    }

    const { data: jobs, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Include running tasks if requested
    if (includeTasks && jobs && jobs.length > 0) {
      const jobIds = jobs.map(j => j.id);
      
      // Get active sessions for these jobs
      const { data: sessions } = await supabase
        .from("sessions")
        .select("id, channel_id")
        .eq("channel_type", "cron")
        .in("channel_id", jobIds)
        .in("status", ["active", "idle"]);

      if (sessions && sessions.length > 0) {
        const sessionIds = sessions.map(s => s.id);

        // Get running tasks
        const { data: tasks } = await supabase
          .from("tasks")
          .select("id, status, created_at, session_id")
          .in("session_id", sessionIds)
          .in("status", ["pending", "running", "pending_subtask"]);

        // Group tasks by job_id
        const tasksByJob: Record<string, any[]> = {};
        if (tasks) {
          for (const task of tasks) {
            const session = sessions.find(s => s.id === task.session_id);
            if (session && session.channel_id) {
              if (!tasksByJob[session.channel_id]) {
                tasksByJob[session.channel_id] = [];
              }
              tasksByJob[session.channel_id].push(task);
            }
          }
        }

        // Attach tasks to jobs
        const jobsWithTasks = jobs.map(job => ({
          ...job,
          running_tasks: tasksByJob[job.id] || []
        }));

        return NextResponse.json({ jobs: jobsWithTasks, count: jobs.length });
      }
    }

    return NextResponse.json({ jobs, count: jobs?.length || 0 });
  } catch (error) {
    console.error("GET /api/jobs error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/jobs - Create new scheduled job
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await request.json();

    const {
      name,
      description,
      agent_id,
      interval_type,
      interval_config,
      cron_expression,
      task_message,
      task_context,
      is_active = true
    } = body;

    // Validation
    if (!name || !agent_id || !interval_type || !task_message) {
      return NextResponse.json(
        { error: "Missing required fields: name, agent_id, interval_type, task_message" },
        { status: 400 }
      );
    }

    // Verify agent exists
    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("id")
      .eq("id", agent_id)
      .single();

    if (agentError || !agent) {
      return NextResponse.json(
        { error: "Agent not found" },
        { status: 404 }
      );
    }

    // Create job using RPC
    const { data, error } = await supabase.rpc("upsert_scheduled_job", {
      p_name: name,
      p_description: description || null,
      p_agent_id: agent_id,
      p_interval_type: interval_type,
      p_interval_config: interval_config || {},
      p_cron_expression: cron_expression || null,
      p_task_message: task_message,
      p_task_context: task_context || {},
      p_is_active: is_active
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch created job
    const { data: job } = await supabase
      .from("scheduled_jobs")
      .select("*")
      .eq("id", data.job_id)
      .single();

    return NextResponse.json(
      { success: true, job },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/jobs error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/jobs?id=<job_id> - Update scheduled job
export async function PATCH(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("id");

    if (!jobId) {
      return NextResponse.json(
        { error: "Missing job id" },
        { status: 400 }
      );
    }

    const body = await request.json();

    const {
      name,
      description,
      agent_id,
      interval_type,
      interval_config,
      cron_expression,
      task_message,
      task_context,
      is_active
    } = body;

    // Update using RPC
    const { data, error } = await supabase.rpc("upsert_scheduled_job", {
      p_id: jobId,
      p_name: name,
      p_description: description,
      p_agent_id: agent_id,
      p_interval_type: interval_type,
      p_interval_config: interval_config,
      p_cron_expression: cron_expression,
      p_task_message: task_message,
      p_task_context: task_context,
      p_is_active: is_active
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch updated job
    const { data: job } = await supabase
      .from("scheduled_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    return NextResponse.json({ success: true, job });
  } catch (error) {
    console.error("PATCH /api/jobs error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/jobs?id=<job_id> - Delete scheduled job
export async function DELETE(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("id");

    if (!jobId) {
      return NextResponse.json(
        { error: "Missing job id" },
        { status: 400 }
      );
    }

    const { error } = await supabase.rpc("delete_scheduled_job", {
      p_job_id: jobId
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/jobs error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
