import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

import type { Tool, Agent, LLMProvider, LLMToolDefinition, ToolCall, TaskContext, Skill, ParallelTaskResult } from "./types.ts";
import { executeMcpTool, getMcpUrl, hasPreDefinedTools } from "./mcp-client.ts";
import { callLLM, synthesizeResponse, getVaultKeyName, ConversationMessage } from "./llm-providers.ts";
import { createTaskLogger } from "./task-logger.ts";
import { fetchAgentSkills, getSkillListForPrompt, getLoadSkillToolDefinition, loadSkill } from "./skill-loader.ts";
import { createErrorHandler, type ErrorHandler } from "./error-handler.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper to invoke edge functions with proper auth (from within edge function)
async function invokeProcessTask(taskId: string): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/process-task`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ task_id: taskId }),
    });
    
    if (!response.ok) {
      console.error("[MAIN] Task invoke failed", { task_id: taskId, status: response.status });
    }
  } catch (err) {
    console.error("[MAIN] Task invoke error", { task_id: taskId, error: err });
  }
}

// Built-in tool definitions for parallel coordination
function getCreateAggregatorTaskToolDefinition(): LLMToolDefinition {
  return {
    type: "function",
    function: {
      name: "create_aggregator_task",
      description: "Create a task that waits for parallel tasks to complete, then synthesizes their results. The aggregator will automatically run when all dependent tasks are done.",
      parameters: {
        type: "object",
        properties: {
          agent_id: {
            type: "string",
            description: "ID of the agent to handle aggregation",
          },
          dependent_task_ids: {
            type: "array",
            items: { type: "string" },
            description: "Array of task IDs to wait for",
          },
          instructions: {
            type: "string",
            description: "Instructions for how to aggregate/synthesize the results",
          },
        },
        required: ["agent_id", "dependent_task_ids", "instructions"],
      },
    },
  };
}

function getCreateParallelTaskToolDefinition(): LLMToolDefinition {
  return {
    type: "function",
    function: {
      name: "create_parallel_task",
      description: "Create a parallel task that runs independently. Returns the task ID for use with create_aggregator_task.",
      parameters: {
        type: "object",
        properties: {
          agent_id: {
            type: "string",
            description: "ID of the agent to handle this task",
          },
          message: {
            type: "string",
            description: "The task message/instructions",
          },
          context: {
            type: "object",
            description: "Optional context variables to pass to the task",
          },
        },
        required: ["agent_id", "message"],
      },
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("[MAIN] Process task called", { timestamp: new Date().toISOString() });

    const { task_id } = await req.json();
    if (!task_id) {
      throw new Error("task_id is required");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch task
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", task_id)
      .single();

    if (taskError || !task) {
      throw new Error(`Task not found: ${taskError?.message}`);
    }

    console.log("[MAIN] Task fetched", { task_id, status: task.status });

    // Skip if already in final state
    if (["completed", "failed", "cancelled"].includes(task.status)) {
      return new Response(
        JSON.stringify({ success: true, message: `Task already ${task.status}`, skipped: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Skip if already running
    if (task.status === "running") {
      return new Response(
        JSON.stringify({ success: true, message: "Task already being processed", skipped: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Only process pending tasks
    if (task.status !== "pending" && task.status !== "pending_subtask") {
      return new Response(
        JSON.stringify({ success: false, error: `Task status '${task.status}' not processable` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
      );
    }

    // Atomic update to running
    const { data: updatedTask, error: updateError } = await supabase
      .from("tasks")
      .update({ status: "running" })
      .eq("id", task_id)
      .eq("status", task.status)
      .select()
      .single();

    if (updateError || !updatedTask) {
      return new Response(
        JSON.stringify({ success: true, message: "Task status changed", skipped: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Initialize logger
    const taskStartTime = Date.now();
    const logger = createTaskLogger(supabase, task_id, taskStartTime);

    // Log user message
    const userMessage = task.input?.message || "";
    await logger.logUserMessage(userMessage);

    // Fetch conversation history if this task is part of a conversation
    let conversationHistory: ConversationMessage[] = [];
    
    if (task.master_task_id) {
      // Get all tasks in this conversation (including the master task itself)
      const { data: conversationTasks } = await supabase
        .from("tasks")
        .select("id")
        .or(`master_task_id.eq.${task.master_task_id},id.eq.${task.master_task_id}`)
        .neq("id", task_id) // Exclude current task
        .order("created_at", { ascending: true });

      if (conversationTasks && conversationTasks.length > 0) {
        const taskIds = conversationTasks.map(t => t.id);
        
        console.log("[MAIN] Found conversation tasks", {
          master_task_id: task.master_task_id,
          task_count: taskIds.length,
          task_ids: taskIds,
        });
        
        // Get messages from previous tasks in the conversation
        const { data: historyMessages } = await supabase
          .from("task_messages")
          .select("role, type, content, sequence_number, task_id")
          .in("task_id", taskIds)
          .in("type", ["user_message", "assistant_message"])
          .order("created_at", { ascending: true });

        if (historyMessages && historyMessages.length > 0) {
          conversationHistory = historyMessages
            .filter(msg => msg.role === "user" || msg.role === "assistant")
            .map(msg => ({
              role: msg.role as "user" | "assistant",
              content: typeof msg.content === "object" && msg.content !== null
                ? (msg.content as { text?: string }).text || JSON.stringify(msg.content)
                : String(msg.content),
            }));
        }
      }

      console.log("[MAIN] Loaded conversation history", {
        master_task_id: task.master_task_id,
        history_messages: conversationHistory.length,
      });
    }

    // Fetch agent
    let agent: Agent | null = null;
    if (task.agent_id) {
      const { data } = await supabase.from("agents").select("*").eq("id", task.agent_id).single();
      agent = data;
    }
    if (!agent) {
      const { data } = await supabase.from("agents").select("*").eq("is_default", true).single();
      agent = data;
    }
    if (!agent) {
      await logger.logError("No agent configured", {}, true);
      return new Response(
        JSON.stringify({ error: "No agent configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
      );
    }

    await logger.logStatusChange(`Using agent: ${agent.name}`, {
      step: "agent_selected",
      agent_id: agent.id,
      agent_name: agent.name,
    });

    // Fetch tools
    const { data: agentToolsData } = await supabase
      .from("agent_tools")
      .select("tool_id")
      .eq("agent_id", agent.id);

    const toolIds = agentToolsData?.map((at) => at.tool_id) || [];
    let tools: Tool[] = [];
    
    if (toolIds.length > 0) {
      const { data: toolsData } = await supabase
        .from("tools")
        .select("*")
        .in("id", toolIds)
        .eq("is_active", true);
      tools = toolsData || [];
    }

    await logger.logStatusChange(
      tools.length > 0 
        ? `Loaded ${tools.length} tool(s): ${tools.map(t => t.name).join(", ")}`
        : "No tools assigned",
      { step: "tools_loaded", tool_count: tools.length },
    );

    // Fetch skills
    const skills: Skill[] = await fetchAgentSkills(supabase, agent.id);

    await logger.logStatusChange(
      skills.length > 0
        ? `Loaded ${skills.length} skill(s): ${skills.map(s => s.name).join(", ")}`
        : "No skills assigned",
      { step: "skills_loaded", skill_count: skills.length },
    );

    // Fetch provider
    let provider: LLMProvider | null = null;
    if (agent.provider_id) {
      const { data } = await supabase.from("llm_providers").select("*").eq("id", agent.provider_id).single();
      provider = data;
    }
    if (!provider) {
      const { data } = await supabase.from("llm_providers").select("*").eq("is_active", true).limit(1).single();
      provider = data;
    }
    if (!provider) {
      await logger.logError("No LLM provider configured", {}, true);
      return new Response(
        JSON.stringify({ error: "No LLM provider configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
      );
    }

    await logger.logStatusChange(`Using provider: ${provider.display_name}`, {
      step: "provider_selected",
      provider_id: provider.id,
      provider_name: provider.name,
    });

    // Get API key
    const vaultKeyName = getVaultKeyName(provider.name);
    const { data: apiKey, error: vaultError } = await supabase.rpc("get_vault_secret", { secret_name: vaultKeyName });
    
    if (vaultError || !apiKey) {
      await logger.logError(`API key not found: ${vaultKeyName}`, {}, true);
      return new Response(
        JSON.stringify({ error: `API key not found: ${vaultKeyName}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
      );
    }

    // Build tool definitions (uses cached tools from verify-mcp)
    const toolDefinitions: LLMToolDefinition[] = [];
    
    for (const tool of tools) {
      if (tool.type === "mcp_server") {
        const config = tool.config;
        const mcpTools = hasPreDefinedTools(config) ? config.tools! : [];

        if (mcpTools.length === 0) {
          console.log("[MAIN] MCP tool has no cached tools, run verify-mcp first", { tool_name: tool.name });
          continue;
        }

        // Add MCP tools to definitions
        for (const mcpTool of mcpTools) {
          toolDefinitions.push({
            type: "function",
            function: {
              name: `${tool.slug}__${mcpTool.name}`,
              description: mcpTool.description || `Tool from ${tool.name}`,
              parameters: mcpTool.inputSchema || { type: "object", properties: {} },
            },
          });
        }
      } else if (tool.type === "handoff") {
        // Handoff tool - build parameters from context_variables
        const config = tool.config;
        const contextVars = config.context_variables || [];
        
        const properties: Record<string, unknown> = {};
        const required: string[] = [];
        
        for (const cv of contextVars) {
          properties[cv.name] = {
            type: cv.type === "object" ? "object" : cv.type,
            description: cv.description,
          };
          if (cv.required) {
            required.push(cv.name);
          }
        }
        
        toolDefinitions.push({
          type: "function",
          function: {
            name: tool.slug,
            description: tool.description || `Hand off to ${config.target_agent_slug}`,
            parameters: {
              type: "object",
              properties,
              required: required.length > 0 ? required : undefined,
            },
          },
        });
        
        console.log("[MAIN] Added handoff tool", {
          tool_slug: tool.slug,
          target_agent: config.target_agent_slug,
          context_vars: contextVars.map(cv => cv.name),
        });
      } else {
        // Standard tool
        toolDefinitions.push({
          type: "function",
          function: {
            name: tool.slug,
            description: tool.description || tool.name,
            parameters: tool.config.parameters || { type: "object", properties: {} },
          },
        });
      }
    }

    // Add load_skill tool if agent has skills (and no conflict with existing tools)
    if (skills.length > 0) {
      const hasLoadSkillTool = toolDefinitions.some(t => t.function.name === "load_skill");
      if (!hasLoadSkillTool) {
        toolDefinitions.push(getLoadSkillToolDefinition());
        console.log("[MAIN] Added load_skill tool for skills", {
          skill_count: skills.length,
          skill_ids: skills.map(s => s.skill_id),
        });
      } else {
        console.log("[MAIN] Skipped load_skill tool - already exists in definitions");
      }
    }

    // Add built-in parallel coordination tools
    toolDefinitions.push(getCreateParallelTaskToolDefinition());
    toolDefinitions.push(getCreateAggregatorTaskToolDefinition());
    console.log("[MAIN] Added parallel coordination tools");

    console.log("[MAIN] Tool definitions built", {
      count: toolDefinitions.length,
      names: toolDefinitions.map(t => t.function.name),
    });

    // Build system prompt with handoff context if present
    let systemPrompt = agent.system_prompt || "";
    const taskContext = task.context as TaskContext | null;
    
    if (taskContext && Object.keys(taskContext).length > 0) {
      const contextLines: string[] = [];
      
      // Add handoff metadata
      if (taskContext._handoff_from) {
        contextLines.push(`You received this conversation from the "${taskContext._handoff_from}" agent.`);
      }
      if (taskContext._handoff_instructions) {
        contextLines.push(`Instructions: ${taskContext._handoff_instructions}`);
      }
      
      // Add context variables (exclude internal _ prefixed ones)
      const contextVars = Object.entries(taskContext)
        .filter(([key]) => !key.startsWith("_"))
        .map(([key, value]) => `- ${key}: ${JSON.stringify(value)}`)
        .join("\n");
      
      if (contextVars) {
        contextLines.push(`\nContext variables:\n${contextVars}`);
      }
      
      if (contextLines.length > 0) {
        systemPrompt = `${systemPrompt}\n\n---\nHandoff Context:\n${contextLines.join("\n")}`;
        console.log("[MAIN] Added handoff context to system prompt", {
          from: taskContext._handoff_from,
          context_keys: Object.keys(taskContext).filter(k => !k.startsWith("_")),
        });
      }
    }

    // Add available skills to system prompt
    if (skills.length > 0) {
      systemPrompt = `${systemPrompt}\n\n## Available Skills\n${getSkillListForPrompt(skills)}`;
      console.log("[MAIN] Added skills to system prompt", {
        skill_count: skills.length,
        skill_ids: skills.map(s => s.skill_id),
      });
    }

    // Inject parallel task results for aggregator tasks
    if (task.dependent_task_ids && task.dependent_task_ids.length > 0) {
      const { data: depTasks } = await supabase
        .from("tasks")
        .select("id, agent_slug, status, output")
        .in("id", task.dependent_task_ids);
      
      if (depTasks && depTasks.length > 0) {
        const parallelResults: ParallelTaskResult[] = depTasks
          .filter(d => d.status === "completed")
          .map(d => ({
            task_id: d.id,
            agent_slug: d.agent_slug || "unknown",
            output: d.output,
            source: (d.output?.source === "human_review" ? "human_review" : "agent") as "agent" | "human_review",
          }));
        
        // Add to task context
        const updatedContext: TaskContext = {
          ...(taskContext || {}),
          _parallel_results: parallelResults,
        };
        
        // Inject into system prompt
        const resultsSection = parallelResults.map(r => 
          `### ${r.agent_slug} (${r.source})\n${JSON.stringify(r.output, null, 2)}`
        ).join("\n\n");
        
        systemPrompt = `${systemPrompt}\n\n---\n## Parallel Task Results\nYou are an aggregator task. The following parallel tasks have completed:\n\n${resultsSection}`;
        
        // Add aggregation instructions if present
        if (taskContext?._aggregation_instructions) {
          systemPrompt = `${systemPrompt}\n\n## Aggregation Instructions\n${taskContext._aggregation_instructions}`;
        }
        
        console.log("[MAIN] Injected parallel task results", {
          dependent_count: task.dependent_task_ids.length,
          completed_count: parallelResults.length,
        });
      }
    }

    await logger.logThinking("Calling LLM...", {
      step: "llm_call_init",
      provider: provider.name,
      model: agent.model || provider.default_model,
      tool_count: toolDefinitions.length,
      has_handoff_context: !!(taskContext && taskContext._handoff_from),
    });

    // Call LLM
    const model = agent.model || provider.default_model;
    let llmResponse = "";
    let toolCalls: ToolCall[] = [];

    try {
      const result = await callLLM(
        provider,
        apiKey,
        model,
        systemPrompt,
        userMessage,
        toolDefinitions.length > 0 ? toolDefinitions : undefined,
        conversationHistory.length > 0 ? conversationHistory : undefined,
      );
      llmResponse = result.response;
      toolCalls = result.toolCalls;

      await logger.logThinking(`LLM responded${toolCalls.length > 0 ? ` with ${toolCalls.length} tool call(s)` : ""}`, {
        step: "llm_response_received",
        has_tool_calls: toolCalls.length > 0,
        tool_call_count: toolCalls.length,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await logger.logError(`LLM call failed: ${errorMsg}`, {}, true);
      return new Response(
        JSON.stringify({ error: errorMsg }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
      );
    }

    // Process tool calls
    if (toolCalls.length > 0) {
      const toolResults: string[] = [];
      let handoffExecuted = false;

      for (const toolCall of toolCalls) {
        const toolCallStart = Date.now();
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments || "{}");

        await logger.logToolCall(toolName, toolCall.id, toolArgs);

        let toolResult = "";

        // Handle load_skill pseudo-tool
        if (toolName === "load_skill") {
          const skillId = toolArgs.skill_id as string;
          const skill = await loadSkill(supabase, skillId);
          
          if (skill) {
            await logger.logSkillLoad(skill.name, skill.skill_id, skill.instructions);
            toolResult = skill.instructions || `Skill "${skill.name}" has no instructions defined.`;
            console.log("[MAIN] Skill loaded", {
              skill_id: skillId,
              skill_name: skill.name,
              instructions_length: skill.instructions?.length || 0,
            });
          } else {
            toolResult = `Skill not found: ${skillId}`;
            console.log("[MAIN] Skill not found", { skill_id: skillId });
          }
          
          const duration = Date.now() - toolCallStart;
          await logger.logToolResult(toolName, toolCall.id, toolResult, !!skill, duration);
          toolResults.push(toolResult);
          continue;
        }

        // Handle create_parallel_task built-in tool
        if (toolName === "create_parallel_task") {
          const targetAgentId = toolArgs.agent_id as string;
          const taskMessage = toolArgs.message as string;
          const taskContext = toolArgs.context as Record<string, unknown> | undefined;
          
          // Fetch target agent
          const { data: targetAgent } = await supabase
            .from("agents")
            .select("id, name, slug")
            .eq("id", targetAgentId)
            .single();
          
          if (!targetAgent) {
            toolResult = `Error: Agent not found (${targetAgentId})`;
          } else {
            const masterTaskId = task.master_task_id || task.id;
            
            const { data: newTask, error: createError } = await supabase
              .from("tasks")
              .insert({
                master_task_id: masterTaskId,
                parent_id: task_id,
                agent_id: targetAgent.id,
                agent_slug: targetAgent.slug,
                status: "pending",
                is_parallel_task: true,
                input: { message: taskMessage },
                context: taskContext || {},
              })
              .select()
              .single();
            
            if (createError || !newTask) {
              toolResult = `Error creating parallel task: ${createError?.message}`;
            } else {
              console.log("[MAIN] Parallel task created", {
                new_task_id: newTask.id,
                target_agent: targetAgent.slug,
                is_parallel: true,
              });
              
              // Fire and forget - trigger task processing
              invokeProcessTask(newTask.id).catch(err => {
                console.error("[MAIN] Failed to trigger parallel task:", err);
              });
              
              toolResult = `Parallel task created. Task ID: ${newTask.id}`;
            }
          }
          
          const duration = Date.now() - toolCallStart;
          await logger.logToolResult(toolName, toolCall.id, toolResult, !toolResult.includes("Error"), duration);
          toolResults.push(toolResult);
          continue;
        }

        // Handle create_aggregator_task built-in tool
        if (toolName === "create_aggregator_task") {
          const targetAgentId = toolArgs.agent_id as string;
          const dependentTaskIds = toolArgs.dependent_task_ids as string[];
          const instructions = toolArgs.instructions as string;
          
          // Fetch target agent
          const { data: targetAgent } = await supabase
            .from("agents")
            .select("id, name, slug")
            .eq("id", targetAgentId)
            .single();
          
          if (!targetAgent) {
            toolResult = `Error: Agent not found (${targetAgentId})`;
          } else if (!dependentTaskIds || dependentTaskIds.length === 0) {
            toolResult = `Error: dependent_task_ids is required`;
          } else {
            const masterTaskId = task.master_task_id || task.id;
            
            const { data: newTask, error: createError } = await supabase
              .from("tasks")
              .insert({
                master_task_id: masterTaskId,
                parent_id: task_id,
                agent_id: targetAgent.id,
                agent_slug: targetAgent.slug,
                status: "queued", // Will be activated by trigger when deps complete
                dependent_task_ids: dependentTaskIds,
                input: { message: `Aggregate results from ${dependentTaskIds.length} parallel tasks` },
                context: {
                  _aggregation_instructions: instructions,
                },
              })
              .select()
              .single();
            
            if (createError || !newTask) {
              toolResult = `Error creating aggregator task: ${createError?.message}`;
            } else {
              console.log("[MAIN] Aggregator task created", {
                new_task_id: newTask.id,
                target_agent: targetAgent.slug,
                dependent_task_ids: dependentTaskIds,
                status: "queued",
              });
              
              toolResult = `Aggregator task created (queued). Task ID: ${newTask.id}. Will activate when all ${dependentTaskIds.length} dependent tasks complete.`;
            }
          }
          
          const duration = Date.now() - toolCallStart;
          await logger.logToolResult(toolName, toolCall.id, toolResult, !toolResult.includes("Error"), duration);
          toolResults.push(toolResult);
          continue;
        }

        const [toolSlug, mcpFunctionName] = toolName.includes("__")
          ? toolName.split("__")
          : [toolName, null];

        const tool = tools.find((t) => t.slug === toolSlug);

        if (tool) {
          try {
            // Handle handoff tool
            if (tool.type === "handoff") {
              const config = tool.config;
              const targetAgentId = config.target_agent_id;
              const targetAgentSlug = config.target_agent_slug;
              
              // Fetch target agent to get name
              const { data: targetAgent } = await supabase
                .from("agents")
                .select("id, name, slug")
                .eq("id", targetAgentId)
                .single();
              
              if (!targetAgent) {
                toolResult = `Handoff failed: Target agent not found (${targetAgentSlug})`;
              } else {
                // Build context for new task
                const existingContext = (task.context as TaskContext) || {};
                const handoffChain = existingContext._handoff_chain || [];
                handoffChain.push(agent.slug);
                
                const newContext: TaskContext = {
                  ...existingContext,
                  ...toolArgs,
                  _handoff_from: agent.slug,
                  _handoff_tool: tool.slug,
                  _handoff_instructions: config.handoff_instructions,
                  _handoff_chain: handoffChain,
                };
                
                // Determine master_task_id
                const masterTaskId = task.master_task_id || task.id;
                
                // Create new task for target agent
                const { data: newTask, error: createError } = await supabase
                  .from("tasks")
                  .insert({
                    master_task_id: masterTaskId,
                    parent_id: task_id,
                    agent_id: targetAgent.id,
                    agent_slug: targetAgent.slug,
                    status: "pending",
                    input: { message: userMessage },
                    context: newContext,
                  })
                  .select()
                  .single();
                
                if (createError || !newTask) {
                  toolResult = `Handoff failed: Could not create task - ${createError?.message}`;
                } else {
                  console.log("[MAIN] Handoff task created", {
                    new_task_id: newTask.id,
                    target_agent: targetAgent.slug,
                    context_keys: Object.keys(newContext),
                  });
                  
                  // Log handoff message
                  await logger.logHandoff(targetAgent.name, targetAgent.slug, newContext, {
                    new_task_id: newTask.id,
                    tool_call_id: toolCall.id,
                  });
                  
                  // Explicitly mark current task as completed
                  const { error: completeError } = await supabase
                    .from("tasks")
                    .update({
                      status: "completed",
                      output: {
                        handoff: true,
                        target_agent: targetAgent.slug,
                        new_task_id: newTask.id,
                        context: newContext,
                      },
                    })
                    .eq("id", task_id);
                  
                  if (completeError) {
                    console.error("[MAIN] Failed to complete task after handoff:", completeError);
                  }
                  
                  handoffExecuted = true;
                  toolResult = `Handed off to ${targetAgent.name}`;
                  
                  // Trigger new task processing (fire and forget)
                  invokeProcessTask(newTask.id).catch(err => {
                    console.error("[MAIN] Failed to trigger handoff task:", err);
                  });
                }
              }
            } else if (tool.type === "mcp_server" && mcpFunctionName) {
              const mcpUrl = getMcpUrl(tool.config);
              if (mcpUrl) {
                let toolApiKey: string | null = null;
                if (tool.credential_secret_name) {
                  const { data } = await supabase.rpc("get_vault_secret", { secret_name: tool.credential_secret_name });
                  toolApiKey = data;
                }
                toolResult = await executeMcpTool(mcpUrl, mcpFunctionName, toolArgs, toolApiKey, tool.name);
              } else {
                toolResult = `MCP endpoint not configured for: ${tool.name}`;
              }
            } else if (tool.type === "http_api") {
              const config = tool.config;
              if (config.url) {
                const response = await fetch(config.url, {
                  method: config.method || "POST",
                  headers: { "Content-Type": "application/json", ...(config.headers || {}) },
                  body: JSON.stringify(toolArgs),
                });
                toolResult = await response.text();
              } else {
                toolResult = `HTTP URL not configured for: ${tool.name}`;
              }
            } else if (tool.type === "supabase_rpc") {
              const config = tool.config;
              if (config.function_name) {
                const { data, error } = await supabase.rpc(config.function_name, toolArgs);
                toolResult = error ? `RPC error: ${error.message}` : JSON.stringify(data);
              } else {
                toolResult = `RPC function not configured for: ${tool.name}`;
              }
            } else {
              toolResult = `Unknown tool type: ${tool.type}`;
            }
          } catch (error) {
            toolResult = `Tool error: ${error instanceof Error ? error.message : String(error)}`;
          }
        } else {
          toolResult = `Tool not found: ${toolSlug}`;
        }

        const duration = Date.now() - toolCallStart;
        const success = !toolResult.toLowerCase().includes("error") && !toolResult.includes("not found");
        
        await logger.logToolResult(toolName, toolCall.id, toolResult, success, duration);
        toolResults.push(toolResult);
        
        // If handoff was executed, stop processing other tools and return
        if (handoffExecuted) {
          console.log("[MAIN] Handoff completed, task ending", { task_id });
          return new Response(
            JSON.stringify({ success: true, handoff: true, response: toolResult }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }

      // Synthesize response from tool results
      await logger.logThinking("Synthesizing response from tool results...", {
        step: "llm_synthesis_start",
      });

      try {
        llmResponse = await synthesizeResponse(
          provider,
          apiKey,
          model,
          agent.system_prompt,
          userMessage,
          toolCalls,
          toolResults,
        );
      } catch (error) {
        llmResponse = `Tool executed. Synthesis error: ${error instanceof Error ? error.message : String(error)}`;
      }
    }

    // Log final response
    const totalDuration = Date.now() - taskStartTime;
    await logger.logAssistantMessage(llmResponse || "No response", {
      step: "final_response",
      total_duration_ms: totalDuration,
    });

    // Update task
    await supabase
      .from("tasks")
      .update({
        output: { response: llmResponse },
        intermediate_data: {
          execution_log: {
            total_duration_ms: totalDuration,
            started_at: new Date(taskStartTime).toISOString(),
            completed_at: new Date().toISOString(),
            tool_calls_count: toolCalls.length,
          },
        },
      })
      .eq("id", task_id);

    await logger.logComplete(llmResponse, { total_duration_ms: totalDuration });

    console.log("[MAIN] Task completed", { task_id, duration_ms: totalDuration });

    return new Response(
      JSON.stringify({ success: true, response: llmResponse }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[MAIN] Error:", message);
    
    // Escalate failures to human review using error handler
    try {
      const { task_id } = await req.clone().json().catch(() => ({ task_id: null }));
      if (task_id) {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        
        const errorHandler = createErrorHandler(supabase, task_id);
        
        // Check task details
        const { data: failedTask } = await supabase
          .from("tasks")
          .select("is_parallel_task, agent_slug, master_task_id, parent_id")
          .eq("id", task_id)
          .single();
        
        if (failedTask?.is_parallel_task) {
          // Find aggregator task that depends on this task
          const { data: aggregatorTask } = await supabase
            .from("tasks")
            .select("id")
            .contains("dependent_task_ids", [task_id])
            .eq("status", "queued")
            .single();
          
          const result = await errorHandler.handleParallelTaskFailure(
            message,
            aggregatorTask?.id,
            {
              agent_slug: failedTask.agent_slug,
              master_task_id: failedTask.master_task_id,
              parent_task_id: failedTask.parent_id,
            }
          );
          
          if (result.success) {
            return new Response(
              JSON.stringify({ 
                error: message, 
                escalated_to_human_review: true,
                review_id: result.review_id,
                task_id,
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
            );
          }
        } else {
          // For non-parallel tasks, still escalate to human review
          const result = await errorHandler.escalateToHumanReview({
            category: "unknown",
            error_message: message,
            context: {
              task_id,
              agent_slug: failedTask?.agent_slug,
              master_task_id: failedTask?.master_task_id,
              parent_task_id: failedTask?.parent_id,
            },
          });
          
          if (result.success) {
            return new Response(
              JSON.stringify({ 
                error: message, 
                escalated_to_human_review: true,
                review_id: result.review_id,
                task_id,
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
            );
          }
        }
      }
    } catch (escalationError) {
      console.error("[MAIN] Failed to escalate to human review:", escalationError);
    }
    
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
