/**
 * POST /api/verify-mcp
 * Verify MCP server connection and list available tools
 * Replaces remote edge function verify-mcp
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export async function POST(req: NextRequest) {
  try {
    const { mcp_url, api_key, tool_id } = await req.json();

    if (!mcp_url) {
      return NextResponse.json({ error: "mcp_url required" }, { status: 400 });
    }

    console.log(`[VERIFY-MCP] Testing connection to ${mcp_url}`);

    // Test the MCP server connection
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (api_key) {
      headers.Authorization = `Bearer ${api_key}`;
    }

    const response = await fetch(`${mcp_url}/tools/list`, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return NextResponse.json({
        success: false,
        error: `MCP server returned ${response.status}: ${await response.text()}`,
      });
    }

    const data = await response.json();
    const tools = data.tools || [];

    console.log(`[VERIFY-MCP] Found ${tools.length} tools`);

    // Update tool config in DB if tool_id provided
    if (tool_id && SUPABASE_URL && SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      const { data: existingTool } = await supabase
        .from("tools")
        .select("config")
        .eq("id", tool_id)
        .single();

      if (existingTool) {
        const updatedConfig = {
          ...existingTool.config,
          mcp_url,
          tools,
          last_verified: new Date().toISOString(),
        };

        await supabase
          .from("tools")
          .update({ config: updatedConfig })
          .eq("id", tool_id);
      }
    }

    return NextResponse.json({
      success: true,
      tools,
      tool_count: tools.length,
    });
  } catch (error) {
    console.error("[VERIFY-MCP] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Connection failed",
      },
      { status: 500 }
    );
  }
}
