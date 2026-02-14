import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// GET /api/tools/[toolId]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ toolId: string }> }
) {
  try {
    const { toolId } = await params;
    const supabase = getSupabase();

    const { data: tool, error } = await supabase
      .from("tools")
      .select("*")
      .eq("id", toolId)
      .single();

    if (error || !tool) {
      return NextResponse.json({ error: error?.message || "Tool not found" }, { status: 404 });
    }

    return NextResponse.json({ tool });
  } catch (error) {
    console.error("GET /api/tools/[toolId] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/tools/[toolId]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ toolId: string }> }
) {
  try {
    const { toolId } = await params;
    const supabase = getSupabase();
    const body = await request.json();

    const {
      name,
      slug,
      description,
      type,
      config,
      execution_mode,
      requires_approval,
      rate_limit_per_min,
      is_active,
    } = body;

    const payload: Record<string, unknown> = {};
    if (name !== undefined) payload.name = name;
    if (slug !== undefined) payload.slug = slug;
    if (description !== undefined) payload.description = description;
    if (type !== undefined) payload.type = type;
    if (config !== undefined) payload.config = config;
    if (execution_mode !== undefined) payload.execution_mode = execution_mode;
    if (requires_approval !== undefined) payload.requires_approval = requires_approval;
    if (rate_limit_per_min !== undefined) {
      payload.rate_limit_per_min = rate_limit_per_min ? parseInt(String(rate_limit_per_min), 10) : null;
    }
    if (is_active !== undefined) payload.is_active = is_active;

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("tools")
      .update(payload)
      .eq("id", toolId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, tool: data });
  } catch (error) {
    console.error("PATCH /api/tools/[toolId] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/tools/[toolId]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ toolId: string }> }
) {
  try {
    const { toolId } = await params;
    const supabase = getSupabase();

    const { error } = await supabase.from("tools").delete().eq("id", toolId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/tools/[toolId] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
