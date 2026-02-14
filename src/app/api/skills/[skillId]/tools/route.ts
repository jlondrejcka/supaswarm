import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// GET /api/skills/[skillId]/tools - Fetch linked tools
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ skillId: string }> }
) {
  try {
    const { skillId } = await params;
    const supabase = getSupabase();

    const { data: links, error } = await supabase
      .from("skill_tools")
      .select("tool_id")
      .eq("skill_id", skillId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const toolIds = (links || []).map((l) => l.tool_id);
    if (toolIds.length === 0) {
      return NextResponse.json({ tools: [], count: 0 });
    }

    const { data: tools, error: toolsError } = await supabase
      .from("tools")
      .select("*")
      .in("id", toolIds);

    if (toolsError) {
      return NextResponse.json({ error: toolsError.message }, { status: 500 });
    }

    return NextResponse.json({ tools: tools || [], count: tools?.length || 0 });
  } catch (error) {
    console.error("GET /api/skills/[skillId]/tools error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/skills/[skillId]/tools - Add tool to skill
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ skillId: string }> }
) {
  try {
    const { skillId } = await params;
    const supabase = getSupabase();
    const body = await request.json();
    const { tool_id } = body;

    if (!tool_id) {
      return NextResponse.json({ error: "Missing tool_id" }, { status: 400 });
    }

    const { error } = await supabase.from("skill_tools").insert({ skill_id: skillId, tool_id });

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "Tool already linked" }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("POST /api/skills/[skillId]/tools error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/skills/[skillId]/tools?tool_id=<uuid> - Remove tool from skill
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ skillId: string }> }
) {
  try {
    const { skillId } = await params;
    const { searchParams } = new URL(request.url);
    const toolId = searchParams.get("tool_id");

    if (!toolId) {
      return NextResponse.json({ error: "Missing tool_id" }, { status: 400 });
    }

    const supabase = getSupabase();

    const { error } = await supabase
      .from("skill_tools")
      .delete()
      .eq("skill_id", skillId)
      .eq("tool_id", toolId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/skills/[skillId]/tools error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
