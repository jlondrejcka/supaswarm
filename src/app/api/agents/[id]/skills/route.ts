import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  inheritToolsForSkill,
  removeInheritedToolsForSkill,
} from "@/lib/skill-inheritance-helper";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// POST /api/agents/[id]/skills - Add skill to agent (triggers tool inheritance)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { skill_id } = body;

    if (!skill_id) {
      return NextResponse.json({ error: "Missing skill_id" }, { status: 400 });
    }

    const supabase = getSupabase();

    const { error } = await supabase
      .from("agent_skills")
      .insert({ agent_id: id, skill_id, priority: 5 });

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "Skill already assigned" }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { inherited, errors } = await inheritToolsForSkill(supabase, id, skill_id);
    if (errors.length > 0) {
      console.warn("inheritToolsForSkill partial errors:", errors);
    }

    return NextResponse.json(
      { success: true, inherited },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/agents/[id]/skills error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/agents/[id]/skills?skill_id=<uuid> - Remove skill (cleanup inherited tools)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const skillId = searchParams.get("skill_id");

    if (!skillId) {
      return NextResponse.json({ error: "Missing skill_id" }, { status: 400 });
    }

    const supabase = getSupabase();

    await removeInheritedToolsForSkill(supabase, id, skillId);

    const { error } = await supabase
      .from("agent_skills")
      .delete()
      .eq("agent_id", id)
      .eq("skill_id", skillId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/agents/[id]/skills error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
