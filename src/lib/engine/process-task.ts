import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type {
  Task,
  Agent,
  LLMProvider,
  LLMToolDefinition,
  LLMMessage,
  Tool,
  Skill,
  TaskContext,
  SpawnResult,
  ParallelTaskResult,
  ToolCall,
} from "./types";
import { callLLM, getVaultKeyName, ConversationMessage } from "./llm-providers";
import { createTaskLogger } from "./task-logger";
import { createErrorHandler } from "./error-handler";
import { executeMcpTool, getMcpUrl, hasPreDefinedTools } from "./mcp-client";
import { fetchAgentSkills, getSkillListForPrompt, loadSkill, getLoadSkillToolDefinition } from "./skill-loader";
import { handleSelfManagementTool, SELF_MANAGEMENT_TOOLS, SELF_MANAGEMENT_TOOL_DEFINITIONS } from "./self-management-tools";

const MAX_SPAWN_DEPTH = 3;
const MAX_TOOL_ITERATIONS = 10;

/**
 * Get tool definition for creating parallel tasks
 */
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

/**
 * Get tool definition for creating aggregator tasks
 */
function getCreateAggregatorTaskToolDefinition(): LLMToolDefinition {
  return {
    type: "function",
    function: {
      name: "create_aggregator_task",
      description:
        "Create a task that waits for parallel tasks to complete, then synthesizes their results. The aggregator will automatically run when all dependent tasks are done.",
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

/**
 * Get tool definition for asking a session (follow-up)
 */
function getAskSessionToolDefinition(): LLMToolDefinition {
  return {
    type: "function",
    function: {
      name: "ask_session",
      description:
        "Send a follow-up message to an existing agent session. The target session retains its full conversation history. Use this to ask follow-up questions to a previously spawned agent without starting a new session. Your task will suspend until the agent responds.",
      parameters: {
        type: "object",
        properties: {
          session_id: {
            type: "string",
            description: "The session ID to send the message to (from a previous spawn/delegation result)",
          },
          message: {
            type: "string",
            description: "The follow-up message or question to send",
          },
        },
        required: ["session_id", "message"],
      },
    },
  };
}

/**
 * Helper to invoke child task processing directly (local)
 */
async function invokeChildTask(
  taskId: string,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<void> {
  try {
    // Process child task directly (local execution, not remote edge function)
    processTask(taskId, supabaseUrl, serviceRoleKey)
      .then((result) => {
        if (!result.success) console.error("[PROCESS_TASK] Child task failed:", result.error);
      })
      .catch((err) => console.error("[PROCESS_TASK] Child task error:", err));
  } catch (err) {
    console.error("[PROCESS_TASK] Failed to invoke child task:", err);
  }
}

/**
 * After a child task completes, check if it has a parent waiting
 * and automatically resume it. The DB trigger check_spawn_completion
 * sets the parent to 'pending' with _spawn_result in context.
 * We just need to pick it up and process it.
 */
async function resumeParentIfNeeded(
  supabase: SupabaseClient,
  task: Record<string, any>,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<void> {
  try {
    if (!task.session_id) return;

    // Check if this task's session is a spawn session with a parent
    const { data: session } = await supabase
      .from("sessions")
      .select("spawn_parent_task_id")
      .eq("id", task.session_id)
      .single();

    if (!session?.spawn_parent_task_id) return;

    const parentTaskId = session.spawn_parent_task_id;

    // Small delay to let the trigger finish updating the parent
    await new Promise((r) => setTimeout(r, 500));

    // Verify parent is now pending (set by check_spawn_completion trigger)
    const { data: parentTask } = await supabase
      .from("tasks")
      .select("id, status")
      .eq("id", parentTaskId)
      .single();

    if (!parentTask || parentTask.status !== "pending") {
      console.log("[MAIN] Parent task not ready for resumption", {
        parent_id: parentTaskId,
        status: parentTask?.status,
      });
      return;
    }

    console.log("[MAIN] Resuming parent task after delegation", {
      child_task_id: task.id,
      parent_task_id: parentTaskId,
    });

    // Fire-and-forget: process the parent task
    processTask(parentTaskId, supabaseUrl, serviceRoleKey)
      .then((result) => {
        if (result.success) {
          console.log("[MAIN] Parent task resumed successfully", { parent_task_id: parentTaskId });
        } else {
          console.error("[MAIN] Parent task resumption failed:", result.error);
        }
      })
      .catch((err) => {
        console.error("[MAIN] Parent task resumption error:", err);
      });
  } catch (err) {
    console.error("[MAIN] Error checking parent resumption:", err);
  }
}

/**
 * Process a task: fetch input, run LLM loop, execute tools, complete
 *
 * This is a Node.js/Next.js port of supabase/functions/process-task/index.ts
 * Full implementation with:
 * 1. Fetch task from database
 * 2. Load agent, LLM provider, tools, skills
 * 3. Build system prompt with context
 * 4. Run agentic loop (max 10 iterations):
 *    - Call LLM with tools
 *    - Execute returned tools (built-in, MCP, HTTP, spawn/handoff)
 *    - Add tool results to message history
 *    - Continue until no more tool calls
 * 5. Complete task with final response
 */
export async function processTask(
  taskId: string,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<{
  success: boolean;
  response?: string;
  error?: string;
  delegation?: boolean;
  follow_up?: boolean;
}> {
  const startTime = Date.now();
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    console.log("[MAIN] Process task called", { task_id: taskId, timestamp: new Date().toISOString() });

    // Fetch task
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", taskId)
      .single();

    if (taskError || !task) {
      throw new Error(`Task not found: ${taskError?.message}`);
    }

    console.log("[MAIN] Task fetched", { task_id: taskId, status: task.status });

    // Skip if already in final state
    if (["completed", "failed", "cancelled"].includes(task.status)) {
      console.log("[MAIN] Task already completed/failed/cancelled", { status: task.status });
      return { success: true, response: `Task already ${task.status}` };
    }

    // Skip if already running
    if (task.status === "running") {
      console.log("[MAIN] Task already being processed");
      return { success: true, response: "Task already being processed" };
    }

    // Only process pending tasks
    if (task.status !== "pending" && task.status !== "pending_subtask") {
      throw new Error(`Task status '${task.status}' not processable`);
    }

    // Atomic update to running
    const { data: updatedTask, error: updateError } = await supabase
      .from("tasks")
      .update({ status: "running" })
      .eq("id", taskId)
      .eq("status", task.status)
      .select()
      .single();

    if (updateError || !updatedTask) {
      console.log("[MAIN] Task status changed by another process");
      return { success: true, response: "Task status changed" };
    }

    // Check if resuming from a blocking approval
    const approvalResult = (task.intermediate_data as Record<string, any>)?.approval_result;
    if (approvalResult) {
      const existingContext = (task.context || {}) as Record<string, unknown>;
      task.context = {
        ...existingContext,
        _approval_result: `Your previous request (${approvalResult.action_type}) was ${approvalResult.status}.${
          approvalResult.review_notes ? " Notes: " + approvalResult.review_notes : ""
        } Continue with your task.`,
      };
      await supabase.from("tasks").update({
        intermediate_data: {
          ...(task.intermediate_data as Record<string, any>) || {},
          approval_result: null,
          pending_approval: null,
        },
      }).eq("id", taskId);
      console.log("[MAIN] Resumed from approval", {
        action_type: approvalResult.action_type,
        status: approvalResult.status,
      });
    }

    // Initialize logger and error handler
    const logger = createTaskLogger(supabase, taskId, startTime);
    const errorHandler = createErrorHandler(supabase, taskId);

    // Log user message
    const userMessage = task.input?.message || "";
    await logger.logUserMessage(userMessage);

    // Fetch conversation history if this task is part of a conversation
    let conversationHistory: ConversationMessage[] = [];

    if (task.session_id) {
      const { data: conversationTasks } = await supabase
        .from("tasks")
        .select("id")
        .eq("session_id", task.session_id)
        .neq("id", taskId)
        .order("created_at", { ascending: true });

      if (conversationTasks && conversationTasks.length > 0) {
        const taskIds = conversationTasks.map((t) => t.id);

        console.log("[MAIN] Found conversation tasks", {
          session_id: task.session_id,
          task_count: taskIds.length,
          task_ids: taskIds,
        });

        const { data: historyMessages } = await supabase
          .from("task_messages")
          .select("role, type, content, sequence_number, task_id")
          .in("task_id", taskIds)
          .in("type", ["user_message", "assistant_message"])
          .order("created_at", { ascending: true });

        if (historyMessages && historyMessages.length > 0) {
          conversationHistory = historyMessages
            .filter((msg) => msg.role === "user" || msg.role === "assistant")
            .map((msg) => ({
              role: msg.role as "user" | "assistant",
              content:
                typeof msg.content === "object" && msg.content !== null
                  ? (msg.content as { text?: string }).text || JSON.stringify(msg.content)
                  : String(msg.content),
            }));
        }
      }

      console.log("[MAIN] Loaded conversation history", {
        session_id: task.session_id,
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
      const result = await errorHandler.escalateToHumanReview({
        category: "validation",
        error_message: "No agent configured. Set a default agent or assign one to this task.",
        context: { task_id: taskId, agent_slug: task.agent_slug },
        options: ["manual", "abort"],
        priority: "high",
      });
      await logger.logError("No agent configured", { review_id: result.review_id });
      return { success: false, error: "No agent configured" };
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
      tools.length > 0 ? `Loaded ${tools.length} tool(s): ${tools.map((t) => t.name).join(", ")}` : "No tools assigned",
      { step: "tools_loaded", tool_count: tools.length },
    );

    // Fetch skills
    const skills: Skill[] = await fetchAgentSkills(supabase, agent.id);

    await logger.logStatusChange(
      skills.length > 0
        ? `Loaded ${skills.length} skill(s): ${skills.map((s) => s.name).join(", ")}`
        : "No skills assigned",
      { step: "skills_loaded", skill_count: skills.length },
    );

    // Fetch LLM provider
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
      const result = await errorHandler.escalateToHumanReview({
        category: "validation",
        error_message: "No LLM provider configured. Add an active provider or assign one to the agent.",
        context: { task_id: taskId, agent_slug: agent.slug },
        options: ["manual", "abort"],
        priority: "high",
      });
      await logger.logError("No LLM provider configured", { review_id: result.review_id });
      return { success: false, error: "No LLM provider configured" };
    }

    await logger.logStatusChange(`Using provider: ${provider.display_name}`, {
      step: "provider_selected",
      provider_id: provider.id,
      provider_name: provider.name,
    });

    // Get API key (skip for providers that don't require one)
    const vaultKeyName = getVaultKeyName(provider.name);
    let apiKey = "";
    
    if (vaultKeyName) {
      // Fetch from vault (all providers need this now, including Ollama base_url)
      const { data: secretValue, error: vaultError } = await supabase.rpc("get_vault_secret", {
        secret_name: vaultKeyName,
      });

      if (vaultError || !secretValue) {
        const result = await errorHandler.escalateToHumanReview({
          category: "validation",
          error_message: `Secret not found in vault: ${vaultKeyName}. Add it to Supabase Vault.`,
          context: {
            task_id: taskId,
            agent_slug: agent.slug,
            additional_context: { vault_key: vaultKeyName, provider: provider.name },
          },
          options: ["abort"],
          priority: "critical",
        });
        await logger.logError(`Secret not found: ${vaultKeyName}`, { review_id: result.review_id });
        return { success: false, error: `Secret not found: ${vaultKeyName}` };
      }
      apiKey = secretValue;
      console.log("[MAIN] Retrieved secret from vault", { provider: provider.name, secret_name: vaultKeyName });
    } else {
      // Provider doesn't require a secret
      console.log("[MAIN] Provider does not require secret", { provider: provider.name });
    }

    // Build tool definitions
    const toolDefinitions: LLMToolDefinition[] = [];

    for (const tool of tools) {
      // Skip internal tools — they're UI display only
      if (tool.type === "internal") continue;
      if (tool.type === "mcp_server") {
        const config = tool.config;
        const mcpTools = hasPreDefinedTools(config) ? config.tools! : [];

        if (mcpTools.length === 0) {
          console.log("[MAIN] MCP tool has no cached tools, run verify-mcp first", { tool_name: tool.name });
          continue;
        }

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
      } else if (tool.type === "spawn" || tool.type === "handoff") {
        const config = tool.config;
        const contextVars = config.context_variables || [];

        const properties: Record<string, unknown> = {
          message: {
            type: "string",
            description: "Task instructions for the sub-agent — describe what you need done",
          },
        };
        const required: string[] = ["message"];

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
            description: tool.description || `Delegate task to ${config.target_agent_slug}`,
            parameters: {
              type: "object",
              properties,
              required,
            },
          },
        });

        console.log("[MAIN] Added spawn tool", {
          tool_slug: tool.slug,
          target_agent: config.target_agent_slug,
          skill_id: config.skill_id,
          context_vars: contextVars.map((cv) => cv.name),
        });
      } else {
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

    // Add load_skill tool if agent has skills
    if (skills.length > 0) {
      const hasLoadSkillTool = toolDefinitions.some((t) => t.function.name === "load_skill");
      if (!hasLoadSkillTool) {
        toolDefinitions.push(getLoadSkillToolDefinition());
        console.log("[MAIN] Added load_skill tool for skills", {
          skill_count: skills.length,
          skill_ids: skills.map((s) => s.skill_id),
        });
      }
    }

    // Add built-in coordination tools
    toolDefinitions.push(getCreateParallelTaskToolDefinition());
    toolDefinitions.push(getCreateAggregatorTaskToolDefinition());
    toolDefinitions.push(getAskSessionToolDefinition());
    console.log("[MAIN] Added coordination tools (parallel + ask_session)");

    // Self-management tools (Rick only — agent.role === 'system')
    if (agent.role === "system") {
      toolDefinitions.push(...SELF_MANAGEMENT_TOOL_DEFINITIONS);
      console.log("[MAIN] Added self-management tools for system agent", {
        agent_slug: agent.slug,
        tool_count: SELF_MANAGEMENT_TOOL_DEFINITIONS.length,
      });
    }

    console.log("[MAIN] Tool definitions built", {
      count: toolDefinitions.length,
      names: toolDefinitions.map((t) => t.function.name),
    });

    // Build system prompt with delegation/handoff context if present
    let systemPrompt = agent.system_prompt || "";
    const taskContext = task.context as TaskContext | null;

    if (taskContext && Object.keys(taskContext).length > 0) {
      const contextLines: string[] = [];

      if (taskContext._delegated_from) {
        contextLines.push(`You were delegated this task by the "${taskContext._delegated_from}" agent.`);
      }
      if (taskContext._handoff_from) {
        contextLines.push(`You received this conversation from the "${taskContext._handoff_from}" agent.`);
      }
      if (taskContext._handoff_instructions) {
        contextLines.push(`Instructions: ${taskContext._handoff_instructions}`);
      }

      const contextVars = Object.entries(taskContext)
        .filter(([key]) => !key.startsWith("_"))
        .map(([key, value]) => `- ${key}: ${JSON.stringify(value)}`)
        .join("\n");

      if (contextVars) {
        contextLines.push(`\nContext variables:\n${contextVars}`);
      }

      if (contextLines.length > 0) {
        systemPrompt = `${systemPrompt}\n\n---\nDelegation Context:\n${contextLines.join("\n")}`;
        console.log("[MAIN] Added delegation context to system prompt", {
          from: taskContext._delegated_from || taskContext._handoff_from,
          context_keys: Object.keys(taskContext).filter((k) => !k.startsWith("_")),
        });
      }
    }

    // Inject skill instructions for spawned tasks
    if (taskContext?._skill_instructions) {
      systemPrompt += `\n\n---\n## Task Instructions\n${taskContext._skill_instructions}`;
      console.log("[MAIN] Injected skill instructions", {
        instructions_length: taskContext._skill_instructions.length,
      });
    }

    // Add available skills to system prompt
    if (skills.length > 0) {
      systemPrompt = `${systemPrompt}\n\n## Available Skills\n${getSkillListForPrompt(skills)}`;
      console.log("[MAIN] Added skills to system prompt", {
        skill_count: skills.length,
        skill_ids: skills.map((s) => s.skill_id),
      });
    }

    // Inject spawn result if present (parent task resuming after delegation)
    console.log("[MAIN] Context check", {
      task_id: taskId,
      has_context: !!taskContext,
      context_keys: taskContext ? Object.keys(taskContext) : [],
      has_spawn_result: !!taskContext?._spawn_result,
    });

    if (taskContext?._spawn_result) {
      const sr = taskContext._spawn_result as SpawnResult;

      let childOutput = sr.output;
      if (!childOutput && sr.task_id) {
        const { data: childTask } = await supabase
          .from("tasks")
          .select("output")
          .eq("id", sr.task_id)
          .single();
        childOutput = childTask?.output;
      }

      const outputText = childOutput?.response || JSON.stringify(childOutput, null, 2);
      systemPrompt += `\n\n---\n## Delegation Result\nAgent "${sr.agent_slug}" completed with status: ${sr.status}\nResult:\n${outputText}\n\nIMPORTANT: Synthesize this result into your response. Do NOT delegate again.`;

      // Remove all spawn/handoff tools to prevent re-delegation loops
      const spawnToolSlugs = tools.filter((t) => t.type === "spawn" || t.type === "handoff").map((t) => t.slug);
      if (spawnToolSlugs.length > 0) {
        const beforeCount = toolDefinitions.length;
        const filtered = toolDefinitions.filter((td) => !spawnToolSlugs.includes(td.function.name));
        toolDefinitions.length = 0;
        toolDefinitions.push(...filtered);
        console.log("[MAIN] Removed spawn/handoff tools to prevent re-delegation", {
          removed: beforeCount - toolDefinitions.length,
          remaining: toolDefinitions.length,
        });
      }

      console.log("[MAIN] Injected spawn result", {
        from_agent: sr.agent_slug,
        status: sr.status,
        has_output: !!childOutput,
      });

      await logger.logDelegationComplete(sr.agent_slug, sr as unknown as Record<string, unknown>, {
        child_task_id: sr.task_id,
        child_session_id: sr.session_id,
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
          .filter((d) => d.status === "completed")
          .map((d) => ({
            task_id: d.id,
            agent_slug: d.agent_slug || "unknown",
            output: d.output,
            source: (d.output?.source === "human_review" ? "human_review" : "agent") as "agent" | "human_review",
          }));

        if (parallelResults.length > 0) {
          const resultsSection = parallelResults
            .map(
              (r) =>
                `### ${r.agent_slug} (${r.source})\n${JSON.stringify(r.output, null, 2)}`
            )
            .join("\n\n");

          systemPrompt = `${systemPrompt}\n\n---\n## Parallel Task Results\nYou are an aggregator task. The following parallel tasks have completed:\n\n${resultsSection}`;

          if (taskContext?._aggregation_instructions) {
            systemPrompt = `${systemPrompt}\n\n## Aggregation Instructions\n${taskContext._aggregation_instructions}`;
          }

          console.log("[MAIN] Injected parallel task results", {
            dependent_count: task.dependent_task_ids.length,
            completed_count: parallelResults.length,
          });
        }
      }
    }

    await logger.logThinking("Calling LLM...", {
      step: "llm_call_init",
      provider: provider.name,
      model: agent.model || provider.default_model,
      tool_count: toolDefinitions.length,
      has_handoff_context: !!(taskContext && taskContext._handoff_from),
    });

    // Call LLM with multi-turn tool loop
    const model = agent.model || provider.default_model;
    let llmResponse = "";
    let toolCalls: ToolCall[] = [];
    let iteration = 0;
    let totalToolCallsCount = 0;
    let totalTaskTokensInput = 0;
    let totalTaskTokensOutput = 0;

    // Build initial messages for the agentic loop
    const loopMessages: LLMMessage[] = [];
    const today = new Date().toDateString();
    if (systemPrompt) {
      loopMessages.push({ role: "system", content: `Current date: ${today}\n\n${systemPrompt}` });
    }
    if (conversationHistory.length > 0) {
      for (const msg of conversationHistory) {
        loopMessages.push({ role: msg.role, content: msg.content });
      }
    }
    loopMessages.push({ role: "user", content: userMessage });

    // --- Agentic tool loop ---
    while (iteration < MAX_TOOL_ITERATIONS) {
      iteration++;

      await logger.logThinking(
        iteration === 1 ? "Calling LLM..." : `Calling LLM (iteration ${iteration})...`,
        {
          step: "llm_call_init",
          provider: provider.name,
          model: agent.model || provider.default_model,
          tool_count: toolDefinitions.length,
          has_handoff_context: !!(taskContext && taskContext._handoff_from),
          iteration,
        },
      );

      try {
        const baseUrl = (provider as any).base_url || "https://api.openai.com/v1";
        const fetchResponse = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: loopMessages,
            tools: toolDefinitions.length > 0 ? toolDefinitions : undefined,
            tool_choice: toolDefinitions.length > 0 ? "auto" : undefined,
          }),
          signal: AbortSignal.timeout(120000), // 2 min timeout
        });

        if (!fetchResponse.ok) {
          const errorText = await fetchResponse.text();
          throw new Error(`OpenAI API error: ${fetchResponse.status} - ${errorText}`);
        }

        const data = await fetchResponse.json();
        const choice = data.choices?.[0];
        llmResponse = choice?.message?.content || "";
        toolCalls = choice?.message?.tool_calls || [];

        const usage = data.usage ?? {};
        const inputTokens = Number(usage.prompt_tokens) || 0;
        const outputTokens = Number(usage.completion_tokens) || 0;
        totalTaskTokensInput += inputTokens;
        totalTaskTokensOutput += outputTokens;

        const toolCallNames = toolCalls.map((tc) => tc.function.name);
        const skillLoads = toolCalls
          .filter((tc) => tc.function.name === "load_skill")
          .map((tc) => {
            try {
              const args = JSON.parse(tc.function.arguments || "{}");
              return { skill_id: String(args.skill_id ?? ""), skill_name: undefined as string | undefined };
            } catch {
              return { skill_id: "", skill_name: undefined };
            }
          });

        console.log("[MAIN] LLM response", {
          iteration,
          has_content: !!llmResponse,
          tool_call_count: toolCalls.length,
          usage: data.usage,
        });

        await logger.logThinking(
          `LLM responded${toolCalls.length > 0 ? ` with ${toolCalls.length} tool call(s)` : ""}`,
          {
            step: "llm_response_received",
            has_tool_calls: toolCalls.length > 0,
            tool_call_count: toolCalls.length,
            iteration,
          },
          {
            tokenUsage: { input: inputTokens, output: outputTokens },
            attribution:
              toolCallNames.length > 0
                ? { tool_calls: toolCallNames, skill_loads: skillLoads.length > 0 ? skillLoads : undefined }
                : undefined,
          },
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (iteration === 1) {
          const result = await errorHandler.handleLLMError(errorMsg, {
            agent_slug: agent.slug,
            additional_context: { provider: provider.name, model },
          });
          await logger.logError(`LLM call failed: ${errorMsg}`, { review_id: result.review_id });
          return { success: false, error: errorMsg };
        }
        llmResponse = `Tool loop error on iteration ${iteration}: ${errorMsg}`;
        break;
      }

      // No tool calls = LLM is done, break
      if (toolCalls.length === 0) break;

      // Append assistant message with tool_calls to history
      loopMessages.push({
        role: "assistant",
        content: llmResponse || "",
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })),
      });

      // Execute tool calls
      let delegationExecuted = false;

      for (const toolCall of toolCalls) {
        const toolCallStart = Date.now();
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments || "{}");
        totalToolCallsCount++;

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
          loopMessages.push({ role: "tool", content: toolResult, tool_call_id: toolCall.id });
          continue;
        }

        // Handle create_parallel_task built-in tool
        if (toolName === "create_parallel_task") {
          const targetAgentId = toolArgs.agent_id as string;
          const taskMessage = toolArgs.message as string;
          const taskCtx = toolArgs.context as Record<string, unknown> | undefined;

          const { data: targetAgent } = await supabase
            .from("agents")
            .select("id, name, slug")
            .eq("id", targetAgentId)
            .single();

          if (!targetAgent) {
            toolResult = `Error: Agent not found (${targetAgentId})`;
          } else {
            const sessionId = task.session_id;

            const { data: newTask, error: createError } = await supabase
              .from("tasks")
              .insert({
                session_id: sessionId,
                parent_id: taskId,
                agent_id: targetAgent.id,
                agent_slug: targetAgent.slug,
                status: "pending",
                is_parallel_task: true,
                input: { message: taskMessage },
                context: taskCtx || {},
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

              toolResult = `Parallel task created. Task ID: ${newTask.id}`;
            }
          }

          const duration = Date.now() - toolCallStart;
          await logger.logToolResult(toolName, toolCall.id, toolResult, !toolResult.includes("Error"), duration);
          loopMessages.push({ role: "tool", content: toolResult, tool_call_id: toolCall.id });
          continue;
        }

        // Handle create_aggregator_task built-in tool
        if (toolName === "create_aggregator_task") {
          const targetAgentId = toolArgs.agent_id as string;
          const dependentTaskIds = toolArgs.dependent_task_ids as string[];
          const instructions = toolArgs.instructions as string;

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
            const sessionId = task.session_id;

            const { data: newTask, error: createError } = await supabase
              .from("tasks")
              .insert({
                session_id: sessionId,
                parent_id: taskId,
                agent_id: targetAgent.id,
                agent_slug: targetAgent.slug,
                status: "queued",
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
          loopMessages.push({ role: "tool", content: toolResult, tool_call_id: toolCall.id });
          continue;
        }

        // Handle ask_session built-in tool (follow-up to existing session)
        if (toolName === "ask_session") {
          const targetSessionId = toolArgs.session_id as string;
          const followUpMessage = toolArgs.message as string;

          if (!targetSessionId || !followUpMessage) {
            toolResult = "Error: session_id and message are required";
          } else {
            try {
              const { data: targetSession, error: sessionErr } = await supabase
                .from("sessions")
                .select("id, agent_id, status, spawn_depth")
                .eq("id", targetSessionId)
                .single();

              if (sessionErr || !targetSession) {
                toolResult = `Error: Session not found (${targetSessionId})`;
              } else {
                const { data: targetAgent } = await supabase
                  .from("agents")
                  .select("id, name, slug")
                  .eq("id", targetSession.agent_id)
                  .single();

                if (!targetAgent) {
                  toolResult = `Error: Agent for session not found`;
                } else {
                  await supabase
                    .from("sessions")
                    .update({
                      status: "active",
                      spawn_parent_task_id: taskId,
                      parent_session_id: task.session_id,
                      last_activity_at: new Date().toISOString(),
                    })
                    .eq("id", targetSessionId);

                  const { data: childTask, error: taskErr } = await supabase
                    .from("tasks")
                    .insert({
                      session_id: targetSessionId,
                      parent_id: taskId,
                      agent_id: targetAgent.id,
                      agent_slug: targetAgent.slug,
                      status: "pending",
                      input: { message: followUpMessage },
                      context: { _delegated_from: agent.slug },
                    })
                    .select()
                    .single();

                  if (taskErr || !childTask) {
                    toolResult = `Error creating follow-up task: ${taskErr?.message}`;
                  } else {
                    console.log("[MAIN] ask_session: follow-up created", {
                      child_session_id: targetSessionId,
                      child_task_id: childTask.id,
                      target_agent: targetAgent.slug,
                    });

                    await logger.logDelegationStart(
                      targetAgent.name,
                      targetAgent.slug,
                      targetSessionId,
                      childTask.id,
                      { tool_call_id: toolCall.id, follow_up: true },
                    );

                    await supabase
                      .from("tasks")
                      .update({
                        status: "pending_subtask",
                        intermediate_data: {
                          delegation: {
                            child_session_id: targetSessionId,
                            child_task_id: childTask.id,
                            target_agent_slug: targetAgent.slug,
                            delegated_at: new Date().toISOString(),
                            follow_up: true,
                          },
                        },
                      })
                      .eq("id", taskId);

                    await invokeChildTask(childTask.id, supabaseUrl, serviceRoleKey);

                    delegationExecuted = true;
                    toolResult = `Follow-up sent to ${targetAgent.name} in session ${targetSessionId}`;
                  }
                }
              }
            } catch (err) {
              toolResult = `Error in ask_session: ${err instanceof Error ? err.message : String(err)}`;
            }
          }

          const duration = Date.now() - toolCallStart;
          await logger.logToolResult(toolName, toolCall.id, toolResult, !toolResult.includes("Error"), duration);
          loopMessages.push({ role: "tool", content: toolResult, tool_call_id: toolCall.id });

          if (delegationExecuted) {
            console.log("[MAIN] ask_session: parent task suspended", { task_id: taskId });
            return { success: true, delegation: true, follow_up: true };
          }
          continue;
        }

        // Handle self-management tools (Rick only)
        if (SELF_MANAGEMENT_TOOLS.includes(toolName as any)) {
          try {
            const { result, needsApproval, blocking } = await handleSelfManagementTool(toolName, toolArgs, {
              supabase,
              agentId: agent.id,
              agentSlug: agent.slug,
              taskId: taskId,
              sessionId: task.session_id || "",
            });
            toolResult = result;

            if (needsApproval && blocking) {
              const duration = Date.now() - toolCallStart;
              await logger.logToolResult(toolName, toolCall.id, result, true, duration);
              await supabase.from("tasks").update({
                status: "needs_human_review",
                intermediate_data: {
                  ...(task.intermediate_data || {}),
                  pending_approval: { tool: toolName, args: toolArgs },
                },
              }).eq("id", taskId);
              console.log("[MAIN] Task suspended for blocking approval", { tool: toolName, task_id: taskId });
              return { success: true, error: "Task suspended for blocking approval" };
            }
          } catch (error) {
            toolResult = `Error in ${toolName}: ${error instanceof Error ? error.message : String(error)}`;
          }

          const duration = Date.now() - toolCallStart;
          await logger.logToolResult(toolName, toolCall.id, toolResult, true, duration);
          loopMessages.push({ role: "tool", content: toolResult, tool_call_id: toolCall.id });
          continue;
        }

        const [toolSlug, mcpFunctionName] = toolName.includes("__") ? toolName.split("__") : [toolName, null];

        const tool = tools.find((t) => t.slug === toolSlug);

        if (tool) {
          try {
            // Handle spawn (sub-agent delegation) tool
            if (tool.type === "spawn" || tool.type === "handoff") {
              const config = tool.config;
              const targetAgentId = config.target_agent_id;

              const { data: targetAgent } = await supabase
                .from("agents")
                .select("id, name, slug")
                .eq("id", targetAgentId)
                .single();

              if (!targetAgent) {
                toolResult = `Delegation failed: Target agent not found`;
              } else {
                let currentDepth = 0;
                if (task.session_id) {
                  const { data: currentSession } = await supabase
                    .from("sessions")
                    .select("spawn_depth")
                    .eq("id", task.session_id)
                    .single();
                  currentDepth = currentSession?.spawn_depth || 0;
                }

                if (currentDepth >= MAX_SPAWN_DEPTH) {
                  toolResult = `Delegation failed: Maximum delegation depth (${MAX_SPAWN_DEPTH}) reached. Complete this task directly.`;
                } else {
                  let skillInstructions = config.instructions || config.handoff_instructions || "";
                  if (config.skill_id) {
                    const { data: skill } = await supabase
                      .from("skills")
                      .select("instructions")
                      .eq("id", config.skill_id)
                      .single();
                    if (skill?.instructions) skillInstructions = skill.instructions;
                  }

                  const { data: childSession, error: sessionError } = await supabase
                    .from("sessions")
                    .insert({
                      agent_id: targetAgent.id,
                      channel_type: "spawn",
                      parent_session_id: task.session_id,
                      spawn_parent_task_id: taskId,
                      spawn_depth: currentDepth + 1,
                      status: "active",
                      display_name: `Delegation: ${targetAgent.name}`,
                    })
                    .select()
                    .single();

                  if (sessionError || !childSession) {
                    toolResult = `Delegation failed: Could not create session - ${sessionError?.message}`;
                  } else {
                    const delegationMessage = toolArgs.message || userMessage;
                    const childContext: Record<string, unknown> = {
                      ...toolArgs,
                      _delegated_from: agent.slug,
                    };
                    if (skillInstructions) {
                      childContext._skill_instructions = skillInstructions;
                    }

                    const { data: childTask, error: taskError } = await supabase
                      .from("tasks")
                      .insert({
                        session_id: childSession.id,
                        parent_id: taskId,
                        agent_id: targetAgent.id,
                        agent_slug: targetAgent.slug,
                        status: "pending",
                        input: { message: delegationMessage },
                        context: childContext,
                      })
                      .select()
                      .single();

                    if (taskError || !childTask) {
                      toolResult = `Delegation failed: Could not create task - ${taskError?.message}`;
                    } else {
                      console.log("[MAIN] Delegation started", {
                        child_session_id: childSession.id,
                        child_task_id: childTask.id,
                        target_agent: targetAgent.slug,
                        spawn_depth: currentDepth + 1,
                      });

                      await logger.logDelegationStart(
                        targetAgent.name,
                        targetAgent.slug,
                        childSession.id,
                        childTask.id,
                        { tool_call_id: toolCall.id, skill_id: config.skill_id },
                      );

                      await supabase
                        .from("tasks")
                        .update({
                          status: "pending_subtask",
                          intermediate_data: {
                            delegation: {
                              child_session_id: childSession.id,
                              child_task_id: childTask.id,
                              target_agent_slug: targetAgent.slug,
                              delegated_at: new Date().toISOString(),
                            },
                          },
                        })
                        .eq("id", taskId);

                      await invokeChildTask(childTask.id, supabaseUrl, serviceRoleKey);

                      delegationExecuted = true;
                      toolResult = `Delegating to ${targetAgent.name}`;
                    }
                  }
                }
              }
            } else if (tool.type === "mcp_server" && mcpFunctionName) {
              const mcpUrl = getMcpUrl(tool.config);
              if (mcpUrl) {
                let toolApiKey: string | null = null;
                if (tool.credential_secret_name) {
                  const { data } = await supabase.rpc("get_vault_secret", {
                    secret_name: tool.credential_secret_name,
                  });
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
        loopMessages.push({ role: "tool", content: toolResult, tool_call_id: toolCall.id });

        // If delegation was executed, stop processing — parent suspends until child completes
        if (delegationExecuted) {
          console.log("[MAIN] Delegation started, parent task suspended", { task_id: taskId });
          return { success: true, delegation: true };
        }
      }

      // Continue loop — LLM will see tool results and decide next action
      console.log("[MAIN] Tool loop iteration complete", { iteration, total_tool_calls: totalToolCallsCount });
    }

    if (iteration >= MAX_TOOL_ITERATIONS) {
      console.warn("[MAIN] Tool loop hit max iterations", {
        MAX_TOOL_ITERATIONS,
        total_tool_calls: totalToolCallsCount,
      });
    }

    // Log final response
    const totalDuration = Date.now() - startTime;
    await logger.logAssistantMessage(llmResponse || "No response", {
      step: "final_response",
      total_duration_ms: totalDuration,
    });

    // Update task — use RPC to bypass PostgREST PATCH
    const completionOutput = {
      response: llmResponse,
      usage:
        totalTaskTokensInput > 0 || totalTaskTokensOutput > 0
          ? {
              prompt_tokens: totalTaskTokensInput,
              completion_tokens: totalTaskTokensOutput,
              total_tokens: totalTaskTokensInput + totalTaskTokensOutput,
            }
          : undefined,
    };
    const completionIntermediateData = {
      execution_log: {
        total_duration_ms: totalDuration,
        started_at: new Date(startTime).toISOString(),
        completed_at: new Date().toISOString(),
        tool_calls_count: totalToolCallsCount,
        tool_loop_iterations: iteration,
      },
    };

    let completionSuccess = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const { data: rpcResult, error: rpcError } = await supabase.rpc("complete_task", {
          p_task_id: taskId,
          p_output: completionOutput,
          p_intermediate_data: completionIntermediateData,
        });

        if (rpcError) {
          console.error(`[MAIN] complete_task RPC error (attempt ${attempt}):`, rpcError);
        } else if (rpcResult && !rpcResult.success) {
          console.error(`[MAIN] complete_task returned failure (attempt ${attempt}):`, rpcResult);
        } else {
          completionSuccess = true;
          console.log("[MAIN] Task marked completed via RPC", { task_id: taskId, attempt });
          break;
        }
      } catch (err) {
        console.error(`[MAIN] complete_task exception (attempt ${attempt}):`, err);
      }

      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }

    if (!completionSuccess) {
      console.error("[MAIN] CRITICAL: Failed to mark task completed after 3 attempts", { task_id: taskId });
    }

    // Roll up token usage to task and session
    if (totalTaskTokensInput > 0 || totalTaskTokensOutput > 0) {
      await supabase
        .from("tasks")
        .update({ tokens_input: totalTaskTokensInput, tokens_output: totalTaskTokensOutput })
        .eq("id", taskId);
      if (task.session_id) {
        await supabase.rpc("increment_session_tokens", {
          p_session_id: task.session_id,
          p_tokens_input: totalTaskTokensInput,
          p_tokens_output: totalTaskTokensOutput,
        });
      }
    } else if (task.session_id) {
      supabase
        .from("sessions")
        .update({ last_activity_at: new Date().toISOString() })
        .eq("id", task.session_id)
        .then(() => {});
    }

    await logger.logComplete(llmResponse, {
      total_duration_ms: totalDuration,
      ...(totalTaskTokensInput > 0 || totalTaskTokensOutput > 0
        ? { tokens_input: totalTaskTokensInput, tokens_output: totalTaskTokensOutput }
        : {}),
    });

    console.log("[MAIN] Task completed", { task_id: taskId, duration_ms: totalDuration });

    // Send Slack replies if needed (bypass queue system)
    await sendSlackRepliesIfNeeded(supabase, taskId);

    // Resume parent task if this was a delegated child
    // The check_spawn_completion trigger already set parent to 'pending' with _spawn_result
    await resumeParentIfNeeded(supabase, task, supabaseUrl, serviceRoleKey);

    return { success: true, response: llmResponse };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[MAIN] Error:", message);

    try {
      const errorHandler = createErrorHandler(supabase, taskId);
      const { data: failedTask } = await supabase
        .from("tasks")
        .select("is_parallel_task, agent_slug, session_id, parent_id")
        .eq("id", taskId)
        .single();

      if (failedTask?.is_parallel_task) {
        const { data: aggregatorTask } = await supabase
          .from("tasks")
          .select("id")
          .contains("dependent_task_ids", [taskId])
          .eq("status", "queued")
          .single();

        await errorHandler.handleParallelTaskFailure(message, aggregatorTask?.id, {
          agent_slug: failedTask.agent_slug,
          session_id: failedTask.session_id,
          parent_task_id: failedTask.parent_id,
        });
      } else {
        await errorHandler.escalateToHumanReview({
          category: "unknown",
          error_message: message,
          context: {
            task_id: taskId,
            agent_slug: failedTask?.agent_slug,
            session_id: failedTask?.session_id,
            parent_task_id: failedTask?.parent_id,
          },
        });
      }
    } catch (escalationError) {
      console.error("[MAIN] Failed to escalate to human review:", escalationError);
    }

    return { success: false, error: message };
  }
}

/**
 * Send any pending Slack replies for this task (bypass queue system)
 */
async function sendSlackRepliesIfNeeded(supabase: SupabaseClient, taskId: string): Promise<void> {
  try {
    // Find any unsent Slack messages for this task (only assistant_message)
    const { data: pendingMessages } = await supabase
      .from("task_messages")
      .select("*")
      .eq("task_id", taskId)
      .eq("type", "assistant_message")
      .eq("slack_notify", true)
      .eq("slack_sent", false);

    if (!pendingMessages || pendingMessages.length === 0) {
      return;
    }

    console.log(`[MAIN] Sending ${pendingMessages.length} Slack reply(s) for task ${taskId}`);

    // Import and call reply handler directly
    const { handleSlackReply } = await import("../slack/reply-handler");
    
    for (const msg of pendingMessages) {
      try {
        await handleSlackReply(msg as any);
      } catch (err) {
        console.error(`[MAIN] Failed to send Slack reply ${msg.id}:`, err);
      }
    }
  } catch (err) {
    console.error("[MAIN] Error checking Slack replies:", err);
  }
}

/**
 * Export for use in Next.js API route or worker
 *
 * Usage in Next.js API route:
 * ```typescript
 * export async function POST(req: NextRequest) {
 *   const { task_id } = await req.json();
 *   const result = await processTask(
 *     task_id,
 *     process.env.NEXT_PUBLIC_SUPABASE_URL!,
 *     process.env.SUPABASE_SERVICE_ROLE_KEY!,
 *   );
 *   return NextResponse.json(result);
 * }
 * ```
 */
