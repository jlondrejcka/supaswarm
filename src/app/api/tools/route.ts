import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// GET /api/tools - List tools
// GET /api/tools?id=<uuid> - Single tool
// GET /api/tools?type=<type> - Filter by type
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const { searchParams } = new URL(request.url);
    const toolId = searchParams.get("id");
    const typeFilter = searchParams.get("type");

    if (toolId) {
      const { data: tool, error } = await supabase
        .from("tools")
        .select("*")
        .eq("id", toolId)
        .single();

      if (error || !tool) {
        return NextResponse.json({ error: error?.message || "Tool not found" }, { status: 404 });
      }
      return NextResponse.json({ tool });
    }

    let query = supabase
      .from("tools")
      .select("*")
      .order("created_at", { ascending: false });

    if (typeFilter) {
      query = query.eq("type", typeFilter);
    }

    const { data: tools, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ tools: tools || [], count: tools?.length || 0 });
  } catch (error) {
    console.error("GET /api/tools error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/tools - Create tool
export async function POST(request: NextRequest) {
  try {
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
    } = body;

    if (!name || !type) {
      return NextResponse.json(
        { error: "Missing required fields: name, type" },
        { status: 400 }
      );
    }

    const validTypes = ["internal", "mcp_server", "http_api", "supabase_rpc", "spawn"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    const payload = {
      name,
      slug: slug || generateSlug(name),
      description: description || null,
      type,
      config: config || {},
      execution_mode: execution_mode || null,
      requires_approval: requires_approval || false,
      rate_limit_per_min: rate_limit_per_min ? parseInt(String(rate_limit_per_min), 10) : null,
      is_active: true,
    };

    const { data, error } = await supabase.from("tools").insert(payload).select().single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, tool: data }, { status: 201 });
  } catch (error) {
    console.error("POST /api/tools error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/tools?id=<uuid> - Update tool
export async function PATCH(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const { searchParams } = new URL(request.url);
    const toolId = searchParams.get("id");

    if (!toolId) {
      return NextResponse.json({ error: "Missing tool id" }, { status: 400 });
    }

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
    console.error("PATCH /api/tools error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/tools?id=<uuid> - Delete tool
export async function DELETE(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const { searchParams } = new URL(request.url);
    const toolId = searchParams.get("id");

    if (!toolId) {
      return NextResponse.json({ error: "Missing tool id" }, { status: 400 });
    }

    const { error } = await supabase.from("tools").delete().eq("id", toolId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/tools error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
