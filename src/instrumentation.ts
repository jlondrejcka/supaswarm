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
    
    // TEMPORARILY DISABLED - causing server hang
    // TODO: Investigate why worker/slack initialization blocks request handling
    console.log("[INSTRUMENTATION] Worker and Slack initialization disabled (debugging)");
    return;

    // // Fire off worker start async with timeout (don't block server startup)
    // (async () => {
    //   try {
    //     // Start the embedded pgmq worker
    //     const { startWorker } = await import("./lib/worker");
    //     console.log("[INSTRUMENTATION] Starting embedded worker");
    //     
    //     // Use a promise race to timeout after 5s if worker takes too long
    //     await Promise.race([
    //       startWorker(),
    //       new Promise((_, reject) => 
    //         setTimeout(() => reject(new Error("Worker startup timeout")), 5000)
    //       )
    //     ]);
    //   } catch (error) {
    //     console.error("[INSTRUMENTATION] Failed to start worker:", error);
    //     // Don't crash the entire app if worker fails to start
    //   }
    // })();

    // // Fire off Slack bots start async with timeout (don't block server startup)
    // (async () => {
    //   try {
    //     // Start Slack bots with Socket Mode
    //     const { startSlackBots } = await import("./lib/slack/bolt-app");
    //     console.log("[INSTRUMENTATION] Starting Slack bots (Socket Mode)");
    //     
    //     // Use a promise race to timeout after 5s if Slack startup takes too long
    //     await Promise.race([
    //       startSlackBots(),
    //       new Promise((_, reject) => 
    //         setTimeout(() => reject(new Error("Slack startup timeout")), 5000)
    //       )
    //     ]);
    //   } catch (error) {
    //     console.error("[INSTRUMENTATION] Failed to start Slack bots:", error);
    //     // Don't crash the entire app if Slack bots fail to start
    //   }
    // })();
  }
}
