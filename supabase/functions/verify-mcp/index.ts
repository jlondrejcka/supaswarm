import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MCP_PROTOCOL_VERSION = "2024-11-05";
const CLIENT_INFO = { name: "supaswarm", version: "1.0.0" };
const DEFAULT_TIMEOUT_MS = 10000;

interface McpResponse {
  jsonrpc: string;
  id?: number;
  result?: {
    tools?: Array<{
      name: string;
      description?: string;
      inputSchema?: Record<string, unknown>;
    }>;
    serverInfo?: Record<string, unknown>;
    capabilities?: Record<string, unknown>;
  };
  error?: {
    code: number;
    message: string;
  };
}

interface McpTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

interface VerifyRequest {
  mcp_url: string;
  api_key?: string;
  timeout_ms?: number;
  tool_id?: string; // If provided, update the tool record with discovered tools
}

interface VerifyResponse {
  success: boolean;
  server_info?: Record<string, unknown>;
  capabilities?: Record<string, unknown>;
  tools?: McpTool[];
  tool_count?: number;
  latency_ms?: number;
  error?: string;
  error_code?: string;
  updated_tool?: boolean;
}

interface ParsedMcpResponse {
  data: McpResponse;
  sessionId?: string;
}

/**
 * Parse MCP response - handles both JSON and SSE formats per MCP spec
 * Also extracts session ID from SSE endpoint events
 */
async function parseMcpResponse(response: Response): Promise<ParsedMcpResponse> {
  const text = await response.text();
  let sessionId: string | undefined;
  
  // Log raw response for debugging
  console.log("[MCP] Raw response (first 500 chars):", text.substring(0, 500));
  
  // Check if it's SSE format
  if (text.includes("event:") || text.startsWith("data:")) {
    const lines = text.split("\n");
    let currentEvent = "";
    
    for (const line of lines) {
      // Track event type
      if (line.startsWith("event:")) {
        currentEvent = line.substring(6).trim();
        continue;
      }
      
      // Parse data lines
      if (line.startsWith("data:")) {
        const jsonStr = line.substring(5).trim();
        if (!jsonStr || jsonStr === "[DONE]") continue;
        
        try {
          const parsed = JSON.parse(jsonStr);
          
          // Check for endpoint event (contains session info per MCP spec)
          if (currentEvent === "endpoint" && parsed.uri) {
            // Extract session from endpoint URI if present
            const url = new URL(parsed.uri);
            sessionId = url.searchParams.get("sessionId") || undefined;
            console.log("[MCP] Found endpoint event", { uri: parsed.uri, sessionId });
            continue;
          }
          
          // Check for session in the message itself
          if (parsed._meta?.sessionId) {
            sessionId = parsed._meta.sessionId;
          }
          
          // Return the JSON-RPC response
          if (parsed.jsonrpc) {
            return { data: parsed, sessionId };
          }
        } catch {
          continue;
        }
      }
    }
    throw new Error("No valid JSON-RPC response found in SSE stream");
  }
  
  // Standard JSON response
  const data = JSON.parse(text);
  return { data, sessionId: data._meta?.sessionId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { mcp_url, api_key, timeout_ms = DEFAULT_TIMEOUT_MS, tool_id }: VerifyRequest = await req.json();

    if (!mcp_url) {
      return new Response(
        JSON.stringify({ success: false, error: "mcp_url is required", error_code: "MISSING_URL" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
      );
    }

    // Validate URL format
    try {
      new URL(mcp_url);
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid URL format", error_code: "INVALID_URL" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
      );
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      ...(api_key ? { Authorization: `Bearer ${api_key}` } : {}),
    };

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout_ms);

    try {
      // Step 1: Initialize
      console.log("[VERIFY] Initializing MCP server", { url: mcp_url, tool_id });
      
      const initResponse = await fetch(mcp_url, {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: { tools: {} },
            clientInfo: CLIENT_INFO,
          },
        }),
      });

      if (!initResponse.ok) {
        const errorText = await initResponse.text();
        clearTimeout(timeoutId);
        return new Response(
          JSON.stringify({
            success: false,
            error: `Initialize failed: ${initResponse.status} - ${errorText.substring(0, 200)}`,
            error_code: "INIT_FAILED",
            latency_ms: Date.now() - startTime,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const initParsed = await parseMcpResponse(initResponse);
      const initResult = initParsed.data;
      
      // Extract session ID from: 1) HTTP headers, 2) SSE endpoint event, 3) response body
      const sessionId = initResponse.headers.get("mcp-session-id") || 
                        initResponse.headers.get("x-session-id") ||
                        initResponse.headers.get("session-id") ||
                        initParsed.sessionId;
      
      // Log all response headers for debugging
      const headerEntries: Record<string, string> = {};
      initResponse.headers.forEach((v, k) => headerEntries[k] = v);
      console.log("[VERIFY] Initialize response headers", headerEntries);
      
      console.log("[VERIFY] Initialize result", { 
        has_session: !!sessionId,
        session_id: sessionId,
        server_info: initResult.result?.serverInfo 
      });
      
      if (initResult.error) {
        clearTimeout(timeoutId);
        return new Response(
          JSON.stringify({
            success: false,
            error: `MCP error: ${initResult.error.message}`,
            error_code: "MCP_ERROR",
            latency_ms: Date.now() - startTime,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Build headers for subsequent requests (include session if present)
      const sessionHeaders: Record<string, string> = {
        ...headers,
        ...(sessionId ? { "mcp-session-id": sessionId } : {}),
      };

      // Step 2: Send initialized notification
      await fetch(mcp_url, {
        method: "POST",
        headers: sessionHeaders,
        signal: controller.signal,
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "notifications/initialized",
        }),
      });

      // Step 3: List tools
      console.log("[VERIFY] Fetching tools/list", { has_session: !!sessionId });
      
      const listResponse = await fetch(mcp_url, {
        method: "POST",
        headers: sessionHeaders,
        signal: controller.signal,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
          params: {},
        }),
      });

      clearTimeout(timeoutId);

      if (!listResponse.ok) {
        const errorText = await listResponse.text();
        return new Response(
          JSON.stringify({
            success: false,
            error: `tools/list failed: ${listResponse.status} - ${errorText.substring(0, 200)}`,
            error_code: "LIST_FAILED",
            server_info: initResult.result?.serverInfo,
            latency_ms: Date.now() - startTime,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const listParsed = await parseMcpResponse(listResponse);
      const listResult = listParsed.data;

      if (listResult.error) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `MCP error: ${listResult.error.message}`,
            error_code: "MCP_ERROR",
            server_info: initResult.result?.serverInfo,
            latency_ms: Date.now() - startTime,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Extract tools
      const tools: McpTool[] = (listResult.result?.tools || []).map((t) => ({
        name: t.name,
        description: t.description || "",
        inputSchema: t.inputSchema,
      }));

      // If tool_id provided, update the tool record
      let updatedTool = false;
      if (tool_id) {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );

        // Fetch current tool config
        const { data: tool, error: fetchError } = await supabase
          .from("tools")
          .select("config")
          .eq("id", tool_id)
          .single();

        if (fetchError) {
          console.error("[VERIFY] Failed to fetch tool:", fetchError);
        } else {
          // Update config with discovered tools
          const updatedConfig = {
            ...(tool.config || {}),
            mcp_url,
            tools,
            last_verified: new Date().toISOString(),
            server_info: initResult.result?.serverInfo,
          };

          const { error: updateError } = await supabase
            .from("tools")
            .update({ config: updatedConfig })
            .eq("id", tool_id);

          if (updateError) {
            console.error("[VERIFY] Failed to update tool:", updateError);
          } else {
            updatedTool = true;
            console.log("[VERIFY] Updated tool record", { tool_id, tool_count: tools.length });
          }
        }
      }

      // Success response
      const response: VerifyResponse = {
        success: true,
        server_info: initResult.result?.serverInfo,
        capabilities: initResult.result?.capabilities,
        tools,
        tool_count: tools.length,
        latency_ms: Date.now() - startTime,
        updated_tool: updatedTool,
      };

      console.log("[VERIFY] Success", {
        tool_count: tools.length,
        latency_ms: response.latency_ms,
        updated_tool: updatedTool,
      });

      return new Response(
        JSON.stringify(response),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );

    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === "AbortError") {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Connection timeout after ${timeout_ms}ms`,
            error_code: "TIMEOUT",
            latency_ms: Date.now() - startTime,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      throw error;
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[VERIFY] Error:", message);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: message,
        error_code: "UNKNOWN",
        latency_ms: Date.now() - startTime,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
