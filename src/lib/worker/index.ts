import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { processTask } from "../engine/process-task";
import type { Database } from "../supabase-types";

interface WorkerConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
}

interface QueueMessage {
  msg_id: number;
  read_ct: number;
  enqueued_at: string;
  vt: string;
  message: Record<string, unknown>;
}

interface ScheduledJob {
  id: string;
  name: string;
  cron_expression: string | null;
  handler_function: string;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
}

type WorkerTask = "task_processing" | "context_graph_jobs" | "slack_replies";

class Worker {
  private config: WorkerConfig;
  private supabase: SupabaseClient<Database>;
  private isRunning = false;
  private activeTasks = new Map<string, Promise<void>>();
  private maxConcurrency = 3;
  private errorSuppressed = new Set<string>();
  private pollIntervals: Map<WorkerTask, number> = new Map([
    ["task_processing", 2000],
    ["context_graph_jobs", 5000],
    ["slack_replies", 2000],
  ]);
  private scheduledJobsInterval = 60000; // 60 seconds
  private timers: NodeJS.Timeout[] = [];

  constructor(config: WorkerConfig) {
    this.config = config;
    this.supabase = createClient<Database>(config.supabaseUrl, config.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log("[WORKER] Worker already running");
      return;
    }

    this.isRunning = true;
    console.log("[WORKER] Starting embedded pgmq worker");

    // Start polling different queues
    this.startPolling("task_processing");
    this.startPolling("context_graph_jobs");
    this.startPolling("slack_replies");

    // Start scheduled jobs checker
    this.startScheduledJobsChecker();

    // Setup graceful shutdown
    this.setupGracefulShutdown();
  }

  stop(): void {
    if (!this.isRunning) {
      console.log("[WORKER] Worker not running");
      return;
    }

    console.log("[WORKER] Stopping worker");
    this.isRunning = false;

    // Clear all timers
    for (const timer of this.timers) {
      clearInterval(timer);
    }
    this.timers = [];
  }

  private startPolling(queueName: WorkerTask): void {
    const interval = this.pollIntervals.get(queueName) || 2000;

    const timer = setInterval(async () => {
      if (!this.isRunning) return;
      await this.pollQueue(queueName);
    }, interval);

    this.timers.push(timer);
    console.log(`[WORKER] Started polling queue: ${queueName} every ${interval}ms`);
  }

  private startScheduledJobsChecker(): void {
    const timer = setInterval(async () => {
      if (!this.isRunning) return;
      await this.checkScheduledJobs();
    }, this.scheduledJobsInterval);

    this.timers.push(timer);
    console.log(`[WORKER] Started scheduled jobs checker every ${this.scheduledJobsInterval}ms`);
  }

  private async pollQueue(queueName: WorkerTask): Promise<void> {
    try {
      // Check concurrency limit
      if (this.activeTasks.size >= this.maxConcurrency) {
        return; // Silently skip if at capacity
      }

      // Read message from pgmq queue using SQL
      // @ts-ignore - pgmq_read is not in the generated RPC types
      const { data, error } = await this.supabase.rpc("pgmq_read" as any, {
        queue_name: queueName,
        limit: 1,
        vt: 30, // 30 second visibility timeout
      } as any);

      if (error) {
        // Only log once per queue, not every poll cycle
        if (!this.errorSuppressed.has(queueName)) {
          console.warn(`[WORKER] Queue ${queueName} not available:`, error.message);
          this.errorSuppressed.add(queueName);
        }
        return;
      }

      if (!data || !Array.isArray(data) || data.length === 0) {
        return; // Queue is empty
      }

      const message = data[0] as QueueMessage;
      console.log(`[WORKER] Received message from ${queueName}:`, message.msg_id);

      // Process the message
      const processPromise = this.processQueueMessage(queueName, message).catch((error) => {
        console.error(`[WORKER] Error processing message ${message.msg_id}:`, error);
      });

      this.activeTasks.set(`${queueName}-${message.msg_id}`, processPromise);

      // Clean up after completion
      processPromise.finally(() => {
        this.activeTasks.delete(`${queueName}-${message.msg_id}`);
      });
    } catch (error) {
      console.error(`[WORKER] Unexpected error in pollQueue(${queueName}):`, error);
    }
  }

  private async processQueueMessage(queueName: WorkerTask, message: QueueMessage): Promise<void> {
    const msgId = message.msg_id;
    console.log(`[WORKER] Processing ${queueName} message ${msgId}`);

    try {
      switch (queueName) {
        case "task_processing":
          await this.processTaskMessage(message);
          break;
        case "context_graph_jobs":
          await this.processContextGraphJob(message);
          break;
        case "slack_replies":
          await this.processSlackReply(message);
          break;
      }

      // Delete message from queue after successful processing
      const { error: deleteError } = await this.supabase.rpc("pgmq_delete", {
        queue_name: queueName,
        msg_id: msgId,
      });

      if (deleteError) {
        console.error(`[WORKER] Failed to delete message ${msgId} from ${queueName}:`, deleteError.message);
      } else {
        console.log(`[WORKER] Successfully deleted message ${msgId} from ${queueName}`);
      }
    } catch (error) {
      console.error(`[WORKER] Error processing message ${msgId}:`, error);
      // Message will be re-delivered after visibility timeout
    }
  }

  private async processTaskMessage(message: QueueMessage): Promise<void> {
    const messageData = message.message as Record<string, string>;
    const taskId = messageData.task_id;
    if (!taskId) {
      console.error("[WORKER] Message missing task_id");
      return;
    }

    console.log(`[WORKER] Processing task ${taskId}`);

    try {
      const result = await processTask(
        taskId,
        this.config.supabaseUrl,
        this.config.serviceRoleKey,
      );

      if (result.success) {
        console.log(`[WORKER] Task ${taskId} completed successfully`);
      } else {
        console.error(`[WORKER] Task ${taskId} failed:`, result.error);
      }
    } catch (error) {
      console.error(`[WORKER] Error processing task ${taskId}:`, error);
      throw error;
    }
  }

  private async processContextGraphJob(message: QueueMessage): Promise<void> {
    const messageData = message.message as Record<string, string>;
    const jobId = messageData.job_id;
    if (!jobId) {
      console.error("[WORKER] Message missing job_id for context_graph_jobs");
      return;
    }

    console.log(`[WORKER] Processing context graph job ${jobId}`);

    try {
      // TODO: Implement context graph processing logic
      console.log(`[WORKER] Context graph job ${jobId} completed (placeholder)`);
    } catch (error) {
      console.error(`[WORKER] Error processing context graph job ${jobId}:`, error);
      throw error;
    }
  }

  private async processSlackReply(message: QueueMessage): Promise<void> {
    try {
      // Import the reply handler
      const { handleSlackReply } = await import("../slack/reply-handler");
      
      // The message.message should contain the reply data
      const reply = message.message as Record<string, unknown>;
      
      if (!reply.id) {
        console.error("[WORKER] Message missing id for slack_replies");
        return;
      }

      console.log(`[WORKER] Processing Slack reply with id: ${reply.id}`);

      // Handle the reply
      await handleSlackReply(reply as any);
      
      console.log(`[WORKER] Slack reply ${reply.id} processed successfully`);
    } catch (error) {
      console.error(`[WORKER] Error processing Slack reply:`, error);
      throw error;
    }
  }

  private async checkScheduledJobs(): Promise<void> {
    try {
      // Note: scheduled_jobs table is not in the generated types.
      // This would need to be added to the Supabase database schema first.
      // For now, we'll use a placeholder for scheduled jobs checking.
      console.log("[WORKER] Checking scheduled jobs (placeholder)");

      // TODO: Implement scheduled jobs checking
      // This requires either:
      // 1. Adding scheduled_jobs table to the schema
      // 2. Using a raw SQL query via supabase.rpc() or similar
    } catch (error) {
      console.error("[WORKER] Unexpected error in checkScheduledJobs:", error);
    }
  }

  private setupGracefulShutdown(): void {
    const handleShutdown = async (signal: string) => {
      console.log(`[WORKER] Received ${signal}, shutting down gracefully`);
      this.stop();

      // Wait for active tasks to complete (with timeout)
      const timeout = setTimeout(() => {
        console.warn("[WORKER] Shutdown timeout, forcing exit");
        process.exit(1);
      }, 30000); // 30 second timeout

      // Wait for all active tasks
      if (this.activeTasks.size > 0) {
        console.log(`[WORKER] Waiting for ${this.activeTasks.size} active task(s) to complete`);
        await Promise.all(Array.from(this.activeTasks.values()));
      }

      clearTimeout(timeout);
      console.log("[WORKER] Graceful shutdown complete");
      process.exit(0);
    };

    process.on("SIGTERM", () => handleShutdown("SIGTERM"));
    process.on("SIGINT", () => handleShutdown("SIGINT"));
  }

  getStatus(): {
    isRunning: boolean;
    activeTasks: number;
    maxConcurrency: number;
  } {
    return {
      isRunning: this.isRunning,
      activeTasks: this.activeTasks.size,
      maxConcurrency: this.maxConcurrency,
    };
  }
}

let workerInstance: Worker | null = null;

/**
 * Start the embedded pgmq worker
 * Called from instrumentation.ts when running in Node.js runtime
 */
export async function startWorker(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.warn("[WORKER] Supabase credentials not configured, worker not started");
    return;
  }

  if (workerInstance) {
    console.log("[WORKER] Worker already started");
    return;
  }

  workerInstance = new Worker({
    supabaseUrl,
    serviceRoleKey,
  });

  await workerInstance.start();
}

/**
 * Stop the worker (useful for testing and cleanup)
 */
export function stopWorker(): void {
  if (workerInstance) {
    workerInstance.stop();
    workerInstance = null;
  }
}

/**
 * Get worker status (useful for monitoring)
 */
export function getWorkerStatus(): {
  isRunning: boolean;
  activeTasks: number;
  maxConcurrency: number;
} | null {
  return workerInstance?.getStatus() ?? null;
}
