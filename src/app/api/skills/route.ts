import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

function generateSkillId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

// GET /api/skills - List skills
// GET /api/skills?id=<uuid> - Single skill
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const { searchParams } = new URL(request.url);
    const skillId = searchParams.get("id");

    if (skillId) {
      const { data: skill, error } = await supabase
        .from("skills")
        .select("*")
        .eq("id", skillId)
        .single();

      if (error || !skill) {
        return NextResponse.json({ error: error?.message || "Skill not found" }, { status: 404 });
      }
      return NextResponse.json({ skill });
    }

    const { data: skills, error } = await supabase
      .from("skills")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ skills: skills || [], count: skills?.length || 0 });
  } catch (error) {
    console.error("GET /api/skills error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/skills - Create skill
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const body = await request.json();

    const { name, skill_id, description, instructions, version } = body;

    if (!name || !description) {
      return NextResponse.json(
        { error: "Missing required fields: name, description" },
        { status: 400 }
      );
    }

    const payload = {
      name,
      skill_id: skill_id || generateSkillId(name),
      description,
      instructions: instructions || null,
      version: version || "1.0.0",
      is_active: true,
    };

    const { data, error } = await supabase.from("skills").insert(payload).select().single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, skill: data }, { status: 201 });
  } catch (error) {
    console.error("POST /api/skills error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/skills?id=<uuid> - Update skill
export async function PATCH(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const { searchParams } = new URL(request.url);
    const skillId = searchParams.get("id");

    if (!skillId) {
      return NextResponse.json({ error: "Missing skill id" }, { status: 400 });
    }

    const body = await request.json();
    const { name, skill_id, description, instructions, version, is_active } = body;

    const payload: Record<string, unknown> = {};
    if (name !== undefined) payload.name = name;
    if (skill_id !== undefined) payload.skill_id = skill_id;
    if (description !== undefined) payload.description = description;
    if (instructions !== undefined) payload.instructions = instructions;
    if (version !== undefined) payload.version = version;
    if (is_active !== undefined) payload.is_active = is_active;

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
    console.error("PATCH /api/skills error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/skills?id=<uuid> - Delete skill
export async function DELETE(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const { searchParams } = new URL(request.url);
    const skillId = searchParams.get("id");

    if (!skillId) {
      return NextResponse.json({ error: "Missing skill id" }, { status: 400 });
    }

    const { error } = await supabase.from("skills").delete().eq("id", skillId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/skills error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
