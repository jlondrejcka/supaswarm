import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export type MessageType = 
  | "user_message"
  | "assistant_message"
  | "tool_call"
  | "tool_result"
  | "thinking"
  | "status_change"
  | "error"
  | "handoff";

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
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    const elapsedMs = Date.now() - startTime;
    const enrichedMetadata = {
      ...metadata,
      timestamp,
      elapsed_ms: elapsedMs,
      sequence: sequenceNumber,
    };

    // Log to console
    console.log(`[TASK] [${messageType.toUpperCase()}]`, {
      content: content.substring(0, 200),
      ...enrichedMetadata,
    });

    // Save to task_messages
    const { error: messageError } = await supabase.from("task_messages").insert({
      task_id: taskId,
      type: messageType,
      role: getRole(messageType),
      content: { text: content },
      metadata: enrichedMetadata,
      sequence_number: sequenceNumber++,
    });

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
   * Log assistant response
   */
  async function logAssistantMessage(
    message: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await log("assistant_message", message, {
      ...metadata,
      response_length: message.length,
    });
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
   * Log thinking/status
   */
  async function logThinking(
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await log("thinking", content, metadata);
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
   * Log agent handoff
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

  return {
    log,
    logUserMessage,
    logAssistantMessage,
    logToolCall,
    logToolResult,
    logThinking,
    logStatusChange,
    logError,
    logComplete,
    logHandoff,
  };
}

export type TaskLogger = ReturnType<typeof createTaskLogger>;

