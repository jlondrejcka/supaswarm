/**
 * Next.js Instrumentation Hook
 * 
 * Starts background workers and services in the Node.js runtime.
 * Uses setTimeout to avoid blocking server startup.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("[INSTRUMENTATION] Initializing in Node.js runtime");

    // Delay worker start by 3s so server can accept requests first
    setTimeout(async () => {
      try {
        const { startWorker } = await import("./lib/worker");
        console.log("[INSTRUMENTATION] Starting embedded worker");
        await startWorker();
      } catch (error) {
        console.error("[INSTRUMENTATION] Failed to start worker:", error);
      }
    }, 3000);

    // Delay Slack bots start
    setTimeout(async () => {
      try {
        const { startSlackBots } = await import("./lib/slack/bolt-app");
        console.log("[INSTRUMENTATION] Starting Slack bots (Socket Mode)");
        await startSlackBots();
      } catch (error) {
        console.error("[INSTRUMENTATION] Failed to start Slack bots:", error);
      }
    }, 3000);
  }
}
