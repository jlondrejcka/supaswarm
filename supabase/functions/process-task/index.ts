import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Tool {
  id: string;
  name: string;
  slug: string;
  type: string;
  config: Record<string, unknown>;
  description: string | null;
  is_active: boolean;
  credential_secret_name: string | null;
}

interface Agent {
  id: string;
  name: string;
  slug: string;
  system_prompt: string | null;
  provider_id: string | null;
  model: string | null;
}

interface LLMProvider {
  id: string;
  name: string;
  display_name: string;
  default_model: string;
  base_url: string | null;
}

interface TaskMessage {
  task_id: string;
  message_type: string;
  content: string;
  metadata?: Record<string, unknown>;
  sequence_number: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { task_id } = await req.json();

    if (!task_id) {
      throw new Error("task_id is required");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the task
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", task_id)
      .single();

    if (taskError || !task) {
      throw new Error(`Task not found: ${taskError?.message}`);
    }

    // Update task status to running
    await supabase
      .from("tasks")
      .update({ status: "running" })
      .eq("id", task_id);

    let sequenceNumber = 1;

    async function addTaskMessage(
      messageType: string,
      content: string,
      metadata?: Record<string, unknown>,
    ) {
      const { error } = await supabase.from("task_messages").insert({
        task_id,
        message_type: messageType,
        content,
        metadata,
        sequence_number: sequenceNumber++,
      });
      if (error) {
        console.error("Failed to add task message:", error);
      }
    }

    // Log the user message
    const userMessage = task.input?.message || "";
    await addTaskMessage("user_message", userMessage);

    // Fetch agent details
    let agent: Agent | null = null;
    if (task.agent_id) {
      const { data: agentData } = await supabase
        .from("agents")
        .select("*")
        .eq("id", task.agent_id)
        .single();
      agent = agentData;
    }

    if (!agent) {
      // Try to find default agent
      const { data: defaultAgent } = await supabase
        .from("agents")
        .select("*")
        .eq("is_default", true)
        .single();
      agent = defaultAgent;
    }

    if (!agent) {
      await addTaskMessage("error", "No agent configured for this task");
      await supabase
        .from("tasks")
        .update({ status: "failed", output: { error: "No agent configured" } })
        .eq("id", task_id);
      return new Response(JSON.stringify({ error: "No agent configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    await addTaskMessage("status_change", `Using agent: ${agent.name}`);

    // Fetch agent's assigned tools via agent_tools junction table
    const { data: agentToolsData, error: agentToolsError } = await supabase
      .from("agent_tools")
      .select("tool_id")
      .eq("agent_id", agent.id);

    if (agentToolsError) {
      console.error("Error fetching agent_tools:", agentToolsError);
    }

    const toolIds = agentToolsData?.map((at) => at.tool_id) || [];

    let tools: Tool[] = [];
    if (toolIds.length > 0) {
      const { data: toolsData, error: toolsError } = await supabase
        .from("tools")
        .select("*")
        .in("id", toolIds)
        .eq("is_active", true);

      if (toolsError) {
        console.error("Error fetching tools:", toolsError);
      }
      tools = toolsData || [];
    }

    // Log loaded tools
    if (tools.length > 0) {
      const toolNames = tools.map((t) => t.name).join(", ");
      await addTaskMessage(
        "status_change",
        `Loaded ${tools.length} tool(s): ${toolNames}`,
        { tool_ids: toolIds, tool_slugs: tools.map((t) => t.slug) },
      );
    } else {
      await addTaskMessage("status_change", "No tools assigned to this agent");
    }

    // Fetch LLM provider
    let provider: LLMProvider | null = null;
    if (agent.provider_id) {
      const { data: providerData, error: providerError } = await supabase
        .from("llm_providers")
        .select("*")
        .eq("id", agent.provider_id)
        .single();
      if (providerError) {
        console.error("Error fetching agent's provider:", providerError);
        await addTaskMessage("error", `Failed to fetch provider: ${providerError.message}`);
      }
      provider = providerData;
    } else {
      await addTaskMessage("status_change", "Agent has no llm_provider_id set, using fallback");
    }

    if (!provider) {
      // Fallback to first active provider
      await addTaskMessage("status_change", "Looking for fallback provider...");
      const { data: defaultProvider } = await supabase
        .from("llm_providers")
        .select("*")
        .eq("is_active", true)
        .limit(1)
        .single();
      provider = defaultProvider;
    }

    if (!provider) {
      await addTaskMessage("error", "No LLM provider configured");
      await supabase
        .from("tasks")
        .update({
          status: "failed",
          output: { error: "No LLM provider configured" },
        })
        .eq("id", task_id);
      return new Response(
        JSON.stringify({ error: "No LLM provider configured" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        },
      );
    }

    // Log which provider we're using
    await addTaskMessage("status_change", `Using LLM provider: ${provider.display_name} (${provider.name})`);

    // Map provider names to their Vault secret names
    const vaultKeyMapping: Record<string, string> = {
      xai: "XAI_API_KEY",
      anthropic: "ANTHROPIC_API_KEY",
      google: "GOOGLE_AI_API_KEY",
      google_ai: "GOOGLE_AI_API_KEY",
      openai: "OPENAI_API_KEY",
    };
    const vaultKeyName = vaultKeyMapping[provider.name.toLowerCase()] || `${provider.name.toUpperCase()}_API_KEY`;
    const { data: apiKeyData, error: vaultError } = await supabase.rpc(
      "get_vault_secret",
      { secret_name: vaultKeyName },
    );

    if (vaultError || !apiKeyData) {
      await addTaskMessage(
        "error",
        `API key not found in Vault: ${vaultKeyName}`,
      );
      await supabase
        .from("tasks")
        .update({
          status: "failed",
          output: { error: `API key not found: ${vaultKeyName}` },
        })
        .eq("id", task_id);
      return new Response(
        JSON.stringify({ error: `API key not found: ${vaultKeyName}` }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        },
      );
    }

    const apiKey = apiKeyData;

    // Build tool definitions for LLM
    const toolDefinitions = tools
      .map((tool) => {
        const config = tool.config as Record<string, unknown>;

        if (tool.type === "mcp_server") {
          // MCP server tool - extract function definitions from config
          const mcpTools =
            (config.tools as Array<{
              name: string;
              description: string;
              inputSchema?: Record<string, unknown>;
            }>) || [];

          return mcpTools.map((mcpTool) => ({
            type: "function",
            function: {
              name: `${tool.slug}__${mcpTool.name}`,
              description: mcpTool.description || `Tool from ${tool.name}`,
              parameters: mcpTool.inputSchema || {
                type: "object",
                properties: {},
              },
            },
          }));
        }

        // Standard tool definition
        return [
          {
            type: "function",
            function: {
              name: tool.slug,
              description: tool.description || tool.name,
              parameters: config.parameters || {
                type: "object",
                properties: {},
              },
            },
          },
        ];
      })
      .flat();

    // Log thinking step
    await addTaskMessage(
      "thinking",
      "Processing request and preparing to call LLM...",
    );

    // Build messages for LLM
    const messages: Array<{ role: string; content: string }> = [];

    if (agent.system_prompt) {
      messages.push({ role: "system", content: agent.system_prompt });
    }

    messages.push({ role: "user", content: userMessage });

    // Call the LLM provider
    const model = agent.model || provider.default_model;
    let llmResponse: string = "";
    let toolCalls: Array<{
      id: string;
      function: { name: string; arguments: string };
    }> = [];

    try {
      if (provider.name === "openai" || provider.name === "xai") {
        const baseUrl = provider.base_url || "https://api.openai.com/v1";
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages,
            tools: toolDefinitions.length > 0 ? toolDefinitions : undefined,
            tool_choice: toolDefinitions.length > 0 ? "auto" : undefined,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`LLM API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const choice = data.choices?.[0];

        if (choice?.message?.tool_calls) {
          toolCalls = choice.message.tool_calls;
        }

        llmResponse = choice?.message?.content || "";
      } else if (provider.name === "anthropic") {
        // Convert tools to Anthropic format
        const anthropicTools = toolDefinitions.map((t) => ({
          name: t.function.name,
          description: t.function.description,
          input_schema: t.function.parameters,
        }));

        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model,
            max_tokens: 4096,
            system: agent.system_prompt || undefined,
            messages: [{ role: "user", content: userMessage }],
            tools: anthropicTools.length > 0 ? anthropicTools : undefined,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Anthropic API error: ${response.status} - ${errorText}`,
          );
        }

        const data = await response.json();

        // Extract text and tool use from response
        for (const block of data.content || []) {
          if (block.type === "text") {
            llmResponse += block.text;
          } else if (block.type === "tool_use") {
            toolCalls.push({
              id: block.id,
              function: {
                name: block.name,
                arguments: JSON.stringify(block.input),
              },
            });
          }
        }
      } else if (provider.name === "google_ai") {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: userMessage }] }],
              systemInstruction: agent.system_prompt
                ? { parts: [{ text: agent.system_prompt }] }
                : undefined,
            }),
          },
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Google AI API error: ${response.status} - ${errorText}`,
          );
        }

        const data = await response.json();
        llmResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      }
    } catch (llmError) {
      const errorMessage =
        llmError instanceof Error ? llmError.message : String(llmError);
      await addTaskMessage("error", `LLM call failed: ${errorMessage}`);
      await supabase
        .from("tasks")
        .update({ status: "failed", output: { error: errorMessage } })
        .eq("id", task_id);
      return new Response(JSON.stringify({ error: errorMessage }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    // Process tool calls if any
    if (toolCalls.length > 0) {
      for (const toolCall of toolCalls) {
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments || "{}");

        await addTaskMessage("tool_call", `Calling tool: ${toolName}`, {
          tool_name: toolName,
          arguments: toolArgs,
        });

        // Find the tool and execute it
        let toolResult = "";
        const [toolSlug, mcpFunctionName] = toolName.includes("__")
          ? toolName.split("__")
          : [toolName, null];

        const tool = tools.find((t) => t.slug === toolSlug);

        if (tool) {
          try {
            if (tool.type === "mcp_server" && mcpFunctionName) {
              // Execute MCP tool
              const mcpConfig = tool.config as {
                endpoint?: string;
                transport?: string;
              };

              // Get tool credential if needed
              let toolApiKey: string | null = null;
              if (tool.credential_secret_name) {
                const { data: credData } = await supabase.rpc(
                  "get_vault_secret",
                  {
                    secret_name: tool.credential_secret_name,
                  },
                );
                toolApiKey = credData;
              }

              if (mcpConfig.endpoint) {
                // Call MCP server endpoint
                const mcpResponse = await fetch(mcpConfig.endpoint, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    ...(toolApiKey
                      ? { Authorization: `Bearer ${toolApiKey}` }
                      : {}),
                  },
                  body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: 1,
                    method: "tools/call",
                    params: {
                      name: mcpFunctionName,
                      arguments: toolArgs,
                    },
                  }),
                });

                const mcpResult = await mcpResponse.json();
                toolResult = JSON.stringify(
                  mcpResult.result || mcpResult.error || mcpResult,
                );
              } else {
                toolResult = `MCP server endpoint not configured for tool: ${tool.name}`;
              }
            } else if (tool.type === "http_api") {
              // Execute HTTP API tool
              const httpConfig = tool.config as {
                url?: string;
                method?: string;
                headers?: Record<string, string>;
              };

              if (httpConfig.url) {
                const response = await fetch(httpConfig.url, {
                  method: httpConfig.method || "POST",
                  headers: {
                    "Content-Type": "application/json",
                    ...(httpConfig.headers || {}),
                  },
                  body: JSON.stringify(toolArgs),
                });
                toolResult = await response.text();
              } else {
                toolResult = `HTTP API URL not configured for tool: ${tool.name}`;
              }
            } else if (tool.type === "supabase_rpc") {
              // Execute Supabase RPC
              const rpcConfig = tool.config as { function_name?: string };
              if (rpcConfig.function_name) {
                const { data: rpcResult, error: rpcError } = await supabase.rpc(
                  rpcConfig.function_name,
                  toolArgs,
                );
                toolResult = rpcError
                  ? `RPC error: ${rpcError.message}`
                  : JSON.stringify(rpcResult);
              } else {
                toolResult = `RPC function name not configured for tool: ${tool.name}`;
              }
            } else {
              toolResult = `Unknown tool type: ${tool.type}`;
            }
          } catch (toolError) {
            toolResult = `Tool execution error: ${
              toolError instanceof Error ? toolError.message : String(toolError)
            }`;
          }
        } else {
          toolResult = `Tool not found: ${toolSlug}`;
        }

        await addTaskMessage("tool_result", toolResult, {
          tool_name: toolName,
          success: !toolResult.includes("error"),
        });
      }

      // After tool execution, we might need to call LLM again with results
      // For now, append tool results to the response
      llmResponse +=
        "\n\n[Tool execution completed. See task messages for details.]";
    }

    // Log assistant response
    await addTaskMessage(
      "assistant_message",
      llmResponse || "No response generated",
    );

    // Update task as completed
    await supabase
      .from("tasks")
      .update({
        status: "completed",
        output: { response: llmResponse },
      })
      .eq("id", task_id);

    await addTaskMessage("status_change", "Task completed");

    return new Response(
      JSON.stringify({ success: true, response: llmResponse }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Process task error:", message);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
