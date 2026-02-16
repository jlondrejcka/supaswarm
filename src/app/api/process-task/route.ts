/**
 * POST /api/process-task
 * Local task processing endpoint - replaces remote edge function invocation
 * Called by chat-dialog and other UI components to process tasks locally
 */

import { NextRequest, NextResponse } from "next/server";
import { processTask } from "@/lib/engine/process-task";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { task_id } = body;

    if (!task_id) {
      return NextResponse.json({ error: "task_id required" }, { status: 400 });
    }

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    }

    console.log(`[API] Processing task ${task_id} locally`);

    // Fire off task processing async (don't block response)
    processTask(task_id, SUPABASE_URL, SERVICE_ROLE_KEY)
      .then((result) => {
        if (result.success) {
          console.log(`[API] Task ${task_id} completed`);
        } else {
          console.error(`[API] Task ${task_id} failed:`, result.error);
        }
      })
      .catch((error) => {
        console.error(`[API] Task ${task_id} error:`, error);
      });

    return NextResponse.json({ ok: true, task_id });
  } catch (error) {
    console.error("[API] process-task error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
