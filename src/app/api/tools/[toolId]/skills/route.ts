import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// GET /api/tools/[toolId]/skills - Fetch skills that link to this tool
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ toolId: string }> }
) {
  try {
    const { toolId } = await params;
    const supabase = getSupabase();

    const { data: links, error } = await supabase
      .from("skill_tools")
      .select("skill_id")
      .eq("tool_id", toolId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const skillIds = (links || []).map((l) => l.skill_id);
    if (skillIds.length === 0) {
      return NextResponse.json({ skills: [], count: 0 });
    }

    const { data: skills, error: skillsError } = await supabase
      .from("skills")
      .select("*")
      .in("id", skillIds);

    if (skillsError) {
      return NextResponse.json({ error: skillsError.message }, { status: 500 });
    }

    return NextResponse.json({ skills: skills || [], count: skills?.length || 0 });
  } catch (error) {
    console.error("GET /api/tools/[toolId]/skills error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
