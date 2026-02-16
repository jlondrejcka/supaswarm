/**
 * Next.js Instrumentation Hook
 * 
 * This file is loaded by Next.js during initialization.
 * It's used to start background workers and services that should run
 * in the Node.js runtime (not in the browser or serverless functions).
 * 
 * Reference: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 * 
 * To enable this file:
 * 1. Add `instrumentationHook: './src/instrumentation.ts'` to next.config.js
 * 2. Or set `NEXT_RUNTIME=nodejs` for local development
 */

/**
 * This function is called when Next.js is initializing in Node.js runtime
 */
export async function register() {
  // Only initialize workers in Node.js runtime, not in browser or other runtimes
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("[INSTRUMENTATION] Initializing in Node.js runtime");

    try {
      // Start the embedded pgmq worker
      const { startWorker } = await import("./lib/worker");
      console.log("[INSTRUMENTATION] Starting embedded worker");
      await startWorker();
    } catch (error) {
      console.error("[INSTRUMENTATION] Failed to start worker:", error);
      // Don't crash the entire app if worker fails to start
    }

    try {
      // Start Slack bots with Socket Mode
      const { startSlackBots } = await import("./lib/slack/bolt-app");
      console.log("[INSTRUMENTATION] Starting Slack bots (Socket Mode)");
      await startSlackBots();
    } catch (error) {
      console.error("[INSTRUMENTATION] Failed to start Slack bots:", error);
      // Don't crash the entire app if Slack bots fail to start
    }
  }
}
