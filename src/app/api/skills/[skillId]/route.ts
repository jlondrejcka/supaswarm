import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// GET /api/skills/[skillId]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ skillId: string }> }
) {
  try {
    const { skillId } = await params;
    const supabase = getSupabase();

    const { data: skill, error } = await supabase
      .from("skills")
      .select("*")
      .eq("id", skillId)
      .single();

    if (error || !skill) {
      return NextResponse.json({ error: error?.message || "Skill not found" }, { status: 404 });
    }

    return NextResponse.json({ skill });
  } catch (error) {
    console.error("GET /api/skills/[skillId] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/skills/[skillId]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ skillId: string }> }
) {
  try {
    const { skillId } = await params;
    const supabase = getSupabase();
    const body = await request.json();

    const { name, skill_id, description, instructions, version, is_active, metadata } = body;

    const payload: Record<string, unknown> = {};
    if (name !== undefined) payload.name = name;
    if (skill_id !== undefined) payload.skill_id = skill_id;
    if (description !== undefined) payload.description = description;
    if (instructions !== undefined) payload.instructions = instructions;
    if (version !== undefined) payload.version = version;
    if (is_active !== undefined) payload.is_active = is_active;
    if (metadata !== undefined) payload.metadata = metadata;

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("skills")
      .update(payload)
      .eq("id", skillId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, skill: data });
  } catch (error) {
    console.error("PATCH /api/skills/[skillId] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/skills/[skillId]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ skillId: string }> }
) {
  try {
    const { skillId } = await params;
    const supabase = getSupabase();

    const { error } = await supabase.from("skills").delete().eq("id", skillId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/skills/[skillId] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
