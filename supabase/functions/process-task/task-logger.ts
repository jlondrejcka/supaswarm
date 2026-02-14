import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export interface TokenUsageRecord {
  input: number;
  output: number;
}

export interface TurnAttribution {
  tool_calls?: string[];
  skill_loads?: Array<{ skill_id: string; skill_name?: string }>;
}

export type MessageType = 
  | "user_message"
  | "assistant_message"
  | "tool_call"
  | "tool_result"
  | "skill_load"
  | "thinking"
  | "status_change"
  | "error"
  | "handoff"
  | "delegation_start"
  | "delegation_complete";

/**
 * Create a task logger instance
 */
export function createTaskLogger(
  supabase: SupabaseClient,
  taskId: string,
  startTime: number,
) {
  let sequenceNumber = 1;

  /**
   * Map message type to role
   */
  function getRole(messageType: MessageType): string {
    switch (messageType) {
      case "user_message":
        return "user";
      case "tool_call":
      case "tool_result":
        return "tool";
      default:
        return "assistant";
    }
  }

  /**
   * Log and save a message
   */
  async function log(
    messageType: MessageType,
    content: string,
    metadata?: Record<string, unknown>,
    updateTaskStatus?: { status: string; output?: Record<string, unknown> },
    options?: { tokenUsage?: TokenUsageRecord; attribution?: TurnAttribution },
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    const elapsedMs = Date.now() - startTime;
    const enrichedMetadata = {
      ...metadata,
      ...(options?.attribution?.tool_calls?.length
        ? { tool_calls: options.attribution.tool_calls }
        : {}),
      ...(options?.attribution?.skill_loads?.length
        ? { skill_loads: options.attribution.skill_loads }
        : {}),
      timestamp,
      elapsed_ms: elapsedMs,
      sequence: sequenceNumber,
    };

    // Log to console
    console.log(`[TASK] [${messageType.toUpperCase()}]`, {
      content: content.substring(0, 200),
      ...enrichedMetadata,
      ...(options?.tokenUsage ? { tokens: options.tokenUsage } : {}),
    });

    const insertPayload: Record<string, unknown> = {
      task_id: taskId,
      type: messageType,
      role: getRole(messageType),
      content: { text: content },
      metadata: enrichedMetadata,
      sequence_number: sequenceNumber++,
    };
    if (options?.tokenUsage) {
      insertPayload.token_usage = {
        input: options.tokenUsage.input,
        output: options.tokenUsage.output,
      };
    }

    // Save to task_messages
    const { error: messageError } = await supabase
      .from("task_messages")
      .insert(insertPayload);

    if (messageError) {
      console.error("[TASK] Failed to save message:", messageError);
    }

    // Optionally update task status
    if (updateTaskStatus) {
      const updateData: Record<string, unknown> = {
        status: updateTaskStatus.status,
      };
      if (updateTaskStatus.output) {
        updateData.output = updateTaskStatus.output;
      }

      const { error: updateError } = await supabase
        .from("tasks")
        .update(updateData)
        .eq("id", taskId);

      if (updateError) {
        console.error("[TASK] Failed to update status:", updateError);
      }
    }
  }

  /**
   * Log user message
   */
  async function logUserMessage(message: string): Promise<void> {
    await log("user_message", message, {
      message_length: message.length,
    });
  }

  /**
   * Log assistant response (use tokenUsage for final turn)
   */
  async function logAssistantMessage(
    message: string,
    metadata?: Record<string, unknown>,
    options?: { tokenUsage?: TokenUsageRecord; attribution?: TurnAttribution },
  ): Promise<void> {
    await log("assistant_message", message, {
      ...metadata,
      response_length: message.length,
    }, undefined, options);
  }

  /**
   * Log tool call
   */
  async function logToolCall(
    toolName: string,
    toolId: string,
    args: Record<string, unknown>,
  ): Promise<void> {
    await log("tool_call", `Calling tool: ${toolName}`, {
      tool_name: toolName,
      tool_id: toolId,
      arguments: args,
      step: "tool_call_start",
    });
  }

  /**
   * Log tool result
   */
  async function logToolResult(
    toolName: string,
    toolId: string,
    result: string,
    success: boolean,
    durationMs: number,
  ): Promise<void> {
    await log("tool_result", result, {
      tool_name: toolName,
      tool_id: toolId,
      success,
      duration_ms: durationMs,
      result_length: result.length,
      step: "tool_call_complete",
    });
  }

  /**
   * Log skill load
   */
  async function logSkillLoad(
    skillName: string,
    skillId: string,
    instructions: string | null,
  ): Promise<void> {
    await log("skill_load", `Loaded skill: ${skillName}`, {
      skill_name: skillName,
      skill_id: skillId,
      instructions_length: instructions?.length || 0,
      step: "skill_loaded",
    });
  }

  /**
   * Log thinking/status (use for LLM turns with optional token usage + attribution)
   */
  async function logThinking(
    content: string,
    metadata?: Record<string, unknown>,
    options?: { tokenUsage?: TokenUsageRecord; attribution?: TurnAttribution },
  ): Promise<void> {
    await log("thinking", content, metadata, undefined, options);
  }

  /**
   * Log status change
   */
  async function logStatusChange(
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await log("status_change", content, metadata);
  }

  /**
   * Log error
   */
  async function logError(
    content: string,
    metadata?: Record<string, unknown>,
    failTask?: boolean,
  ): Promise<void> {
    await log(
      "error",
      content,
      metadata,
      failTask ? { status: "failed", output: { error: content } } : undefined,
    );
  }

  /**
   * Log task completion
   */
  async function logComplete(
    response: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await log(
      "status_change",
      "Task completed",
      {
        ...metadata,
        step: "task_complete",
      },
      {
        status: "completed",
        output: { response },
      },
    );
  }

  /**
   * Log agent handoff (legacy — kept for backward compat)
   */
  async function logHandoff(
    targetAgentName: string,
    targetAgentSlug: string,
    context: Record<string, unknown>,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await log(
      "handoff",
      `Routed to ${targetAgentName}`,
      {
        ...metadata,
        target_agent_name: targetAgentName,
        target_agent_slug: targetAgentSlug,
        handoff_context: context,
        step: "handoff",
      },
      {
        status: "completed",
        output: { handoff: true, target_agent: targetAgentSlug, context },
      },
    );
  }

  /**
   * Log delegation start (spawn sub-agent)
   */
  async function logDelegationStart(
    targetAgentName: string,
    targetAgentSlug: string,
    childSessionId: string,
    childTaskId: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await log(
      "delegation_start",
      `Delegating to ${targetAgentName}`,
      {
        ...metadata,
        target_agent_name: targetAgentName,
        target_agent_slug: targetAgentSlug,
        child_session_id: childSessionId,
        child_task_id: childTaskId,
        step: "delegation_start",
      },
    );
  }

  /**
   * Log delegation complete (spawn result received)
   */
  async function logDelegationComplete(
    fromAgentSlug: string,
    result: Record<string, unknown>,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await log(
      "delegation_complete",
      `Received result from ${fromAgentSlug}`,
      {
        ...metadata,
        from_agent_slug: fromAgentSlug,
        spawn_result: result,
        step: "delegation_complete",
      },
    );
  }

  return {
    log,
    logUserMessage,
    logAssistantMessage,
    logToolCall,
    logToolResult,
    logSkillLoad,
    logThinking,
    logStatusChange,
    logError,
    logComplete,
    logHandoff,
    logDelegationStart,
    logDelegationComplete,
  };
}

export type TaskLogger = ReturnType<typeof createTaskLogger>;

