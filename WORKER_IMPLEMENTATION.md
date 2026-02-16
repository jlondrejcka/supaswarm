# Embedded pgmq Worker Implementation

## Overview

The embedded pgmq worker has been implemented as a Node.js-based background worker that:
- Polls pgmq queues for new tasks and messages
- Processes tasks concurrently with a configurable limit (max 3 tasks simultaneously)
- Provides graceful shutdown on SIGTERM/SIGINT
- Integrates with Next.js via the instrumentation hook

## Files Created

### 1. `src/lib/worker/index.ts`
The main worker implementation with the following responsibilities:

#### Key Features:
- **Queue Polling**: Continuously polls three pgmq queues:
  - `task_processing` (every 2 seconds) - for general task execution
  - `context_graph_jobs` (every 5 seconds) - for context graph operations
  - `slack_replies` (every 2 seconds) - for Slack message replies

- **Task Processing**: 
  - Calls `processTask()` function directly from `src/lib/engine/process-task.ts`
  - No HTTP overhead - direct function invocation
  - Concurrency limit of 3 simultaneous tasks
  - Automatic message deletion after successful processing

- **Scheduled Jobs**: 
  - Checks `scheduled_jobs` table every 60 seconds
  - Note: `scheduled_jobs` table must be added to Supabase schema
  - Placeholder implementation ready for future enhancement

- **Graceful Shutdown**:
  - Listens for SIGTERM and SIGINT signals
  - Waits up to 30 seconds for active tasks to complete
  - Clears all timers before exiting

#### Class Structure:
```typescript
class Worker {
  private config: WorkerConfig                    // Supabase credentials
  private supabase: SupabaseClient<Database>      // Supabase client
  private isRunning: boolean                      // Running state
  private activeTasks: Map<string, Promise>       // Active task tracking
  private maxConcurrency: number                  // Max concurrent tasks (3)
  private pollIntervals: Map<string, number>      // Queue poll intervals
  private scheduledJobsInterval: number           // Scheduled jobs check interval
  private timers: NodeJS.Timeout[]               // Interval timer references
}
```

#### Public Functions:
- `startWorker()` - Initializes and starts the worker
- `stopWorker()` - Cleanly stops the worker
- `getWorkerStatus()` - Returns current worker status (running, active tasks, concurrency)

### 2. `src/instrumentation.ts`
The Next.js instrumentation hook file that:
- Only runs in Node.js runtime (checks `process.env.NEXT_RUNTIME === 'nodejs'`)
- Starts the embedded worker on application initialization
- Handles startup failures gracefully (doesn't crash the app)
- Ready for Slack bots integration (commented placeholder)

### 3. `next.config.mjs`
Updated to enable the instrumentation hook:
```javascript
experimental: {
  instrumentationHook: true,
}
```

## How It Works

### Startup Flow
1. Next.js initializes the instrumentation hook (`register()` function)
2. Checks if running in Node.js runtime
3. Dynamically imports and calls `startWorker()`
4. Worker creates Supabase client and starts all interval timers
5. Setup graceful shutdown handlers

### Queue Processing Flow
1. Worker polls each queue at its configured interval
2. Checks concurrency limit (max 3 tasks)
3. Reads one message from pgmq queue (with 30s visibility timeout)
4. Routes message to appropriate handler based on queue name:
   - `task_processing` → calls `processTask()` function
   - `context_graph_jobs` → placeholder for context graph logic
   - `slack_replies` → placeholder for Slack reply logic
5. On successful processing, deletes message from queue
6. On error, message is re-delivered after visibility timeout expires

### Error Handling
- Queue read errors logged but don't stop polling
- Task processing errors logged and re-queued for retry
- Failed message deletions logged but don't block worker
- Unhandled errors in any async operation caught and logged

## Configuration

### Environment Variables Required
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role API key

If not configured, the worker logs a warning and doesn't start.

### Tunable Parameters (in `src/lib/worker/index.ts`)
- `maxConcurrency` - Maximum concurrent tasks (default: 3)
- `pollIntervals` - Map of queue-specific poll intervals
  - `task_processing`: 2000ms
  - `context_graph_jobs`: 5000ms
  - `slack_replies`: 2000ms
- `scheduledJobsInterval` - How often to check scheduled jobs (default: 60000ms)
- Shutdown timeout - Wait up to 30 seconds for tasks to complete

## Integration with Existing Code

### processTask Integration
The worker directly calls the existing `processTask()` function from `src/lib/engine/process-task.ts`:
```typescript
const result = await processTask(
  taskId,
  this.config.supabaseUrl,
  this.config.serviceRoleKey,
);
```

This eliminates HTTP overhead compared to calling it via an API endpoint.

### Supabase Integration
Uses the standard Supabase JavaScript client with service role key for elevated permissions:
```typescript
const supabase = createClient<Database>(config.supabaseUrl, config.serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
```

## Database Requirements

### Expected pgmq Tables/Functions
- `pgmq_read(queue_name, limit, vt)` - Read messages from queue (must be created as Supabase function)
- `pgmq_delete(queue_name, msg_id)` - Delete message from queue (already in types)

### Expected Application Tables
For full functionality, add to Supabase schema:
- `scheduled_jobs` table with columns: `id`, `name`, `cron_expression`, `handler_function`, `enabled`, `last_run_at`, `next_run_at`

## Deployment Considerations

### Local Development
Set environment variable to enable Node.js runtime:
```bash
export NEXT_RUNTIME=nodejs
npm run dev
```

### Production
- The instrumentation hook automatically runs in Next.js server runtime
- Ensure environment variables are set in your hosting platform
- Worker runs in the same process as the Next.js server
- For serverless deployments, consider external worker service (not covered by this implementation)

## Future Enhancements

### Placeholders Ready for Implementation
1. **Context Graph Jobs** - `processContextGraphJob()` method
2. **Slack Reply Processing** - `processSlackReply()` method
3. **Scheduled Jobs** - `checkScheduledJobs()` and `executeScheduledJob()` methods
4. **Slack Bots Integration** - Uncomment in instrumentation.ts once created

### Potential Improvements
- Add monitoring/metrics (tasks processed, queue depth, etc.)
- Add configurable retry logic with exponential backoff
- Implement Dead Letter Queue (DLQ) for failed messages
- Add task priority levels
- Add worker health checks endpoint
- Implement worker clustering for multi-instance deployments

## Testing

### Manual Testing
```typescript
// Import in a test file
import { startWorker, stopWorker, getWorkerStatus } from '@/lib/worker';

// Start worker
await startWorker();

// Check status
const status = getWorkerStatus();
console.log(status); // { isRunning: true, activeTasks: 0, maxConcurrency: 3 }

// Stop worker
stopWorker();
```

### Monitoring
Check worker status via the `getWorkerStatus()` function or monitor console output with `[WORKER]` prefix.

## Logging

All worker operations are logged with a `[WORKER]` prefix for easy filtering:
```
[WORKER] Starting embedded pgmq worker
[WORKER] Started polling queue: task_processing every 2000ms
[WORKER] Received message from task_processing: 123
[WORKER] Processing task abc-123
[WORKER] Task abc-123 completed successfully
[WORKER] Graceful shutdown complete
```

Instrumentation logs use `[INSTRUMENTATION]` prefix:
```
[INSTRUMENTATION] Initializing in Node.js runtime
[INSTRUMENTATION] Starting embedded worker
```
