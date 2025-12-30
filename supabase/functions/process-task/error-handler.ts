import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export type ErrorCategory = 
  | "tool_execution"      // Tool failed to execute
  | "llm_error"           // LLM API error
  | "validation"          // Input/output validation failed
  | "timeout"             // Task timed out
  | "parallel_task"       // Parallel task failure
  | "skill_load"          // Failed to load skill
  | "mcp_error"           // MCP server error
  | "unknown";            // Catch-all

export type ReviewOption = "retry" | "abort" | "manual" | "skip" | "escalate";

export interface ErrorContext {
  task_id: string;
  agent_slug?: string;
  tool_name?: string;
  skill_name?: string;
  mcp_server?: string;
  aggregator_task_id?: string;
  is_parallel_task?: boolean;
  master_task_id?: string;
  parent_task_id?: string;
  additional_context?: Record<string, unknown>;
}

export interface HumanReviewRequest {
  category: ErrorCategory;
  error_message: string;
  context: ErrorContext;
  options?: ReviewOption[];
  suggested_action?: ReviewOption;
  priority?: "low" | "medium" | "high" | "critical";
}

// Default options per error category
const DEFAULT_OPTIONS: Record<ErrorCategory, ReviewOption[]> = {
  tool_execution: ["retry", "skip", "manual"],
  llm_error: ["retry", "abort"],
  validation: ["manual", "abort"],
  timeout: ["retry", "abort"],
  parallel_task: ["retry", "abort", "manual"],
  skill_load: ["retry", "skip"],
  mcp_error: ["retry", "abort", "escalate"],
  unknown: ["retry", "abort", "manual"],
};

// Default priority per error category
const DEFAULT_PRIORITY: Record<ErrorCategory, HumanReviewRequest["priority"]> = {
  tool_execution: "medium",
  llm_error: "high",
  validation: "medium",
  timeout: "medium",
  parallel_task: "high",
  skill_load: "low",
  mcp_error: "high",
  unknown: "medium",
};

/**
 * Creates an error handler instance for a task
 */
export function createErrorHandler(supabase: SupabaseClient, task_id: string) {
  return {
    /**
     * Escalates an error to human review
     * Updates task status to 'needs_human_review' and creates a human_reviews entry
     */
    async escalateToHumanReview(request: HumanReviewRequest): Promise<{
      success: boolean;
      review_id?: string;
      error?: string;
    }> {
      const {
        category,
        error_message,
        context,
        options = DEFAULT_OPTIONS[category],
        suggested_action,
        priority = DEFAULT_PRIORITY[category],
      } = request;

      try {
        console.log(`[ERROR_HANDLER] Escalating ${category} error to human review`, {
          task_id,
          error_message: error_message.substring(0, 100),
        });

        // Update task status to needs_human_review
        const { error: updateError } = await supabase
          .from("tasks")
          .update({
            status: "needs_human_review",
            output: {
              error: error_message,
              error_category: category,
              escalated_at: new Date().toISOString(),
            },
          })
          .eq("id", task_id);

        if (updateError) {
          console.error("[ERROR_HANDLER] Failed to update task status:", updateError);
          return { success: false, error: updateError.message };
        }

        // Create human review entry
        const { data: review, error: reviewError } = await supabase
          .from("human_reviews")
          .insert({
            task_id,
            response: {
              category,
              error: error_message,
              options,
              suggested_action,
              priority,
              context: {
                agent_slug: context.agent_slug,
                tool_name: context.tool_name,
                skill_name: context.skill_name,
                mcp_server: context.mcp_server,
                is_parallel_task: context.is_parallel_task || false,
                aggregator_task_id: context.aggregator_task_id,
                master_task_id: context.master_task_id,
                parent_task_id: context.parent_task_id,
                ...context.additional_context,
              },
              created_at: new Date().toISOString(),
            },
          })
          .select("id")
          .single();

        if (reviewError) {
          console.error("[ERROR_HANDLER] Failed to create human review:", reviewError);
          return { success: false, error: reviewError.message };
        }

        console.log(`[ERROR_HANDLER] Created human review ${review.id} for task ${task_id}`);
        return { success: true, review_id: review.id };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[ERROR_HANDLER] Unexpected error:", message);
        return { success: false, error: message };
      }
    },

    /**
     * Marks task as failed without human review (for non-recoverable errors)
     */
    async markFailed(error_message: string, category: ErrorCategory = "unknown"): Promise<void> {
      console.log(`[ERROR_HANDLER] Marking task ${task_id} as failed`, { category });
      
      await supabase
        .from("tasks")
        .update({
          status: "failed",
          output: {
            error: error_message,
            error_category: category,
            failed_at: new Date().toISOString(),
          },
        })
        .eq("id", task_id);
    },

    /**
     * Helper for tool execution errors
     */
    async handleToolError(tool_name: string, error: Error | string, context?: Partial<ErrorContext>) {
      const message = error instanceof Error ? error.message : error;
      return this.escalateToHumanReview({
        category: "tool_execution",
        error_message: `Tool '${tool_name}' failed: ${message}`,
        context: {
          task_id,
          tool_name,
          ...context,
        },
      });
    },

    /**
     * Helper for LLM errors
     */
    async handleLLMError(error: Error | string, context?: Partial<ErrorContext>) {
      const message = error instanceof Error ? error.message : error;
      return this.escalateToHumanReview({
        category: "llm_error",
        error_message: `LLM error: ${message}`,
        context: {
          task_id,
          ...context,
        },
        priority: "high",
      });
    },

    /**
     * Helper for parallel task failures
     */
    async handleParallelTaskFailure(
      error: Error | string,
      aggregator_task_id?: string,
      context?: Partial<ErrorContext>
    ) {
      const message = error instanceof Error ? error.message : error;
      return this.escalateToHumanReview({
        category: "parallel_task",
        error_message: message,
        context: {
          task_id,
          is_parallel_task: true,
          aggregator_task_id,
          ...context,
        },
        priority: "high",
      });
    },

    /**
     * Helper for MCP errors
     */
    async handleMCPError(mcp_server: string, error: Error | string, context?: Partial<ErrorContext>) {
      const message = error instanceof Error ? error.message : error;
      return this.escalateToHumanReview({
        category: "mcp_error",
        error_message: `MCP server '${mcp_server}' error: ${message}`,
        context: {
          task_id,
          mcp_server,
          ...context,
        },
      });
    },

    /**
     * Helper for skill loading errors
     */
    async handleSkillError(skill_name: string, error: Error | string, context?: Partial<ErrorContext>) {
      const message = error instanceof Error ? error.message : error;
      return this.escalateToHumanReview({
        category: "skill_load",
        error_message: `Failed to load skill '${skill_name}': ${message}`,
        context: {
          task_id,
          skill_name,
          ...context,
        },
        priority: "low",
      });
    },
  };
}

export type ErrorHandler = ReturnType<typeof createErrorHandler>;





