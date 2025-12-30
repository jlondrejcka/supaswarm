import type { McpResponse, ToolConfig } from "./types.ts";

const MCP_PROTOCOL_VERSION = "2024-11-05";
const CLIENT_INFO = { name: "supaswarm", version: "1.0.0" };

/**
 * Get headers for MCP JSON-RPC requests (SSE compatible)
 */
function getMcpHeaders(apiKey?: string | null, sessionId?: string | null): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    ...(sessionId ? { "mcp-session-id": sessionId } : {}),
  };
}

/**
 * Parse MCP response - handles both JSON and SSE formats
 */
async function parseMcpResponse(response: Response): Promise<{ data: McpResponse; sessionId?: string }> {
  const text = await response.text();
  let sessionId: string | undefined;
  
  // Check if it's SSE format
  if (text.includes("event:") || text.startsWith("data:")) {
    const lines = text.split("\n");
    let currentEvent = "";
    
    for (const line of lines) {
      if (line.startsWith("event:")) {
        currentEvent = line.substring(6).trim();
        continue;
      }
      
      if (line.startsWith("data:")) {
        const jsonStr = line.substring(5).trim();
        if (!jsonStr || jsonStr === "[DONE]") continue;
        
        try {
          const parsed = JSON.parse(jsonStr);
          
          // Check for endpoint event with session
          if (currentEvent === "endpoint" && parsed.uri) {
            const url = new URL(parsed.uri);
            sessionId = url.searchParams.get("sessionId") || undefined;
            continue;
          }
          
          if (parsed._meta?.sessionId) {
            sessionId = parsed._meta.sessionId;
          }
          
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
  
  // Standard JSON
  const data = JSON.parse(text);
  return { data, sessionId: data._meta?.sessionId };
}

/**
 * Initialize MCP server connection (required before tools/call)
 * Returns session ID if provided by server
 */
async function initializeMcpServer(
  mcpUrl: string,
  apiKey?: string | null,
  toolName?: string,
): Promise<string | null> {
  const headers = getMcpHeaders(apiKey);

  console.log("[MCP] Initializing server", { tool_name: toolName });

  try {
    const response = await fetch(mcpUrl, {
      method: "POST",
      headers,
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

    if (!response.ok) {
      console.error("[MCP] Initialize failed", { tool_name: toolName, status: response.status });
      return null;
    }

    const parsed = await parseMcpResponse(response);
    
    // Extract session ID from headers or response
    const sessionId = response.headers.get("mcp-session-id") || 
                      response.headers.get("x-session-id") ||
                      parsed.sessionId;

    console.log("[MCP] Initialized", { tool_name: toolName, has_session: !!sessionId });

    // Send initialized notification
    await fetch(mcpUrl, {
      method: "POST",
      headers: getMcpHeaders(apiKey, sessionId),
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
    });

    return sessionId || null;
  } catch (error) {
    console.error("[MCP] Initialize error", {
      tool_name: toolName,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Execute a tool call on MCP server
 */
export async function executeMcpTool(
  mcpUrl: string,
  functionName: string,
  args: Record<string, unknown>,
  apiKey?: string | null,
  toolName?: string,
): Promise<string> {
  // Initialize first and get session ID
  const sessionId = await initializeMcpServer(mcpUrl, apiKey, toolName);
  const headers = getMcpHeaders(apiKey, sessionId);

  console.log("[MCP] Executing tools/call", {
    tool_name: toolName,
    function: functionName,
    has_session: !!sessionId,
    args,
  });

  try {
    const response = await fetch(mcpUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: functionName,
          arguments: args,
        },
      }),
    });

    const parsed = await parseMcpResponse(response);
    const result = parsed.data;
    
    console.log("[MCP] tools/call response", {
      tool_name: toolName,
      function: functionName,
      status: response.status,
      has_result: !!result.result,
      has_error: !!result.error,
    });

    // Return content if available, otherwise the full result
    if (result.result?.content) {
      // MCP tool results often have content array
      const content = result.result.content;
      if (Array.isArray(content)) {
        return content.map((c: { text?: string; type?: string }) => c.text || JSON.stringify(c)).join("\n");
      }
      return JSON.stringify(content);
    }

    return JSON.stringify(result.result || result.error || result);
  } catch (error) {
    console.error("[MCP] tools/call error", {
      tool_name: toolName,
      function: functionName,
      error: error instanceof Error ? error.message : String(error),
    });
    return `MCP tool execution error: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Get MCP URL from tool config
 */
export function getMcpUrl(config: ToolConfig): string | undefined {
  return config.mcp_url || config.endpoint;
}

/**
 * Check if tool config has pre-defined tools
 */
export function hasPreDefinedTools(config: ToolConfig): boolean {
  return Array.isArray(config.tools) && config.tools.length > 0;
}
