# Task 2: Queue Review - Continuous Edge Function Pinging

## Issue
Edge function `process-task` appears to be continuously pinged, likely from a queue or database trigger setup.

## Current Setup Analysis

### Edge Function Invocation
- **Direct invocation**: Frontend (`chat-dialog.tsx`) calls `supabase.functions.invoke('process-task')` when a task is created
- **No queue found in codebase**: pgmq is mentioned in PRD but not implemented in code
- **No database triggers found**: No triggers in seed.sql or migrations

### Two Possible Patterns:
1. **Direct Queue → Edge Function**: Queue consumer directly calls edge function via HTTP
2. **Queue → Database Function → Edge Function**: Queue consumer calls a database function, which then calls edge function via `pg_net`/`http_request`

### Potential Causes
1. **Database trigger** on `tasks` table INSERT/UPDATE calling edge function via `pg_net`/`http_request`
2. **pgmq queue** polling and calling edge function
3. **pg_cron job** running periodically
4. **Realtime subscription** with automatic retry logic

## SQL Queries to Check

### 1. Check for Database Triggers
```sql
-- List all triggers on tasks table
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement,
    action_timing
FROM information_schema.triggers
WHERE event_object_table = 'tasks';

-- Check for triggers calling edge functions
SELECT 
    t.trigger_name,
    t.event_manipulation,
    p.proname as function_name,
    pg_get_functiondef(p.oid) as function_definition
FROM information_schema.triggers t
JOIN pg_trigger pt ON pt.tgname = t.trigger_name
JOIN pg_proc p ON p.oid = pt.tgfoid
WHERE t.event_object_table = 'tasks'
AND (pg_get_functiondef(p.oid) LIKE '%process-task%' 
     OR pg_get_functiondef(p.oid) LIKE '%http_request%'
     OR pg_get_functiondef(p.oid) LIKE '%pg_net%');
```

### 2. Check for pgmq Queues
```sql
-- List all pgmq queues
SELECT queue_name 
FROM pgmq.list_queues();

-- Check for messages in queue (try common queue names)
SELECT * 
FROM pgmq.read('task_queue', 10, 1);
SELECT * 
FROM pgmq.read('tasks', 10, 1);
SELECT * 
FROM pgmq.read('process_task', 10, 1);

-- Check queue stats
SELECT queue_name, 
       queue_length,
       newest_msg_age_sec,
       oldest_msg_age_sec
FROM pgmq.metrics('task_queue'); -- Try different queue names

-- Check all queue metrics
SELECT * FROM pgmq.list_queues();
```

### 3. Check for pg_cron Jobs
```sql
-- List all cron jobs (requires pg_cron extension)
SELECT
    jobid,
    schedule,
    command,
    nodename,
    nodeport,
    database,
    username,
    active,
    created_at,
    updated_at
FROM cron.job
WHERE command LIKE '%process-task%'
   OR command LIKE '%edge%function%'
   OR command LIKE '%pgmq%'
   OR command LIKE '%queue%';

-- Check for any cron jobs at all
SELECT
    jobid,
    schedule,
    command,
    active
FROM cron.job
ORDER BY jobid;

-- Check cron job run history (if available)
SELECT *
FROM cron.job_run_details
WHERE status = 'failed'
   OR status = 'succeeded'
ORDER BY start_time DESC
LIMIT 20;
```

### 4. Check for Database Functions Calling Edge Function
```sql
-- Find functions that might call the edge function
SELECT 
    p.proname as function_name,
    n.nspname as schema_name,
    pg_get_functiondef(p.oid) as function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE (pg_get_functiondef(p.oid) LIKE '%process-task%'
     OR pg_get_functiondef(p.oid) LIKE '%http_request%'
     OR pg_get_functiondef(p.oid) LIKE '%pg_net%'
     OR pg_get_functiondef(p.oid) LIKE '%functions.invoke%');

-- Check if any function is a queue consumer
SELECT 
    p.proname as function_name,
    n.nspname as schema_name,
    pg_get_functiondef(p.oid) as function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE (pg_get_functiondef(p.oid) LIKE '%pgmq%'
     OR pg_get_functiondef(p.oid) LIKE '%queue%');
```

### 5. Check for pg_net Requests
```sql
-- Check recent HTTP requests from database (if pg_net extension exists)
SELECT 
    id,
    url,
    method,
    headers,
    body,
    created_at,
    status_code
FROM net.http_request_queue
WHERE url LIKE '%process-task%'
ORDER BY created_at DESC
LIMIT 20;
```

## Recommended Actions

1. **Run the SQL queries above** in Supabase SQL Editor to identify the source
2. **Check Supabase Dashboard**:
   - Edge Functions logs for call frequency
   - Database logs for trigger activity
   - Queue metrics (if pgmq is configured)
3. **If trigger found**: Review trigger logic and disable if not needed
4. **If pgmq queue found**: Check queue consumer configuration and message TTL
5. **If pg_cron found**: Review schedule and disable if not needed

## How to Run Diagnostic Queries

1. **Open Supabase Dashboard**: Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. **Find your project**: Look for project `bgqxccmdcpegvbuxmnrf` (shown in Settings page)
3. **Open SQL Editor**: Click "SQL Editor" in the left sidebar
4. **Run each query below** and check the results

## Diagnostic Queries to Run

### 1. Check for Database Functions Calling Edge Function
```sql
SELECT 
    p.proname as function_name,
    n.nspname as schema_name,
    pg_get_functiondef(p.oid) as function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE (pg_get_functiondef(p.oid) LIKE '%process-task%'
     OR pg_get_functiondef(p.oid) LIKE '%http_request%'
     OR pg_get_functiondef(p.oid) LIKE '%pg_net%'
     OR pg_get_functiondef(p.oid) LIKE '%net.http%');
```

### 2. Check for Triggers on Tasks Table
```sql
SELECT 
    t.trigger_name,
    t.event_manipulation,
    t.action_timing,
    p.proname as function_name
FROM information_schema.triggers t
LEFT JOIN pg_trigger pt ON pt.tgname = t.trigger_name
LEFT JOIN pg_proc p ON p.oid = pt.tgfoid
WHERE t.event_object_table = 'tasks';
```

### 3. Check for pgmq Queues
```sql
-- List all queues
SELECT queue_name FROM pgmq.list_queues();

-- Check queue metrics (if queues exist)
SELECT * FROM pgmq.metrics('task_queue');
SELECT * FROM pgmq.metrics('tasks');
```

### 4. Check for pg_cron Jobs
```sql
SELECT 
    jobid,
    schedule,
    command,
    active
FROM cron.job
WHERE command LIKE '%process-task%' 
   OR command LIKE '%edge%function%';
```

### 5. Check for pg_net HTTP Requests
```sql
SELECT 
    id,
    url,
    method,
    created_at,
    status_code
FROM net.http_request_queue
WHERE url LIKE '%process-task%'
ORDER BY created_at DESC
LIMIT 20;
```

## Expected Results & Actions

### If you find pg_cron jobs:
- **Pattern**: Cron Job → Edge Function
- **Action**: Check the cron schedule and command. A cron job running every few seconds/minutes could cause continuous edge function calls
- **Common Issues**: Cron jobs that process the same task repeatedly without proper completion logic

### If you find a database function calling the edge function:
- **Pattern**: Queue → Database Function → Edge Function
- **Action**: Check the function logic and disable if it's causing excessive calls

### If you find a trigger on the tasks table:
- **Pattern**: Database Trigger → Edge Function
- **Action**: Review trigger logic, disable if unnecessary

### If you find pgmq queues with messages:
- **Pattern**: Queue Consumer → Edge Function
- **Action**: Check queue consumer configuration and message TTL

### If you find pg_net HTTP requests:
- **Pattern**: Database → HTTP Request to Edge Function
- **Action**: Check what function is making the requests

## FOUND THE ISSUE: Async Edge Function Calls + Premature Message Deletion

**Problem Identified:**
- Cron job runs every 5 seconds: `SELECT util.process_task_queue();`
- Function reads from `task_processing` queue using `pgmq.read()`
- Calls `util.invoke_edge_function()` which uses async `net.http_post()`
- **Immediately deletes message** with `pgmq.delete()` before edge function completes
- If edge function fails, message is lost and never retried
- Queue has 16 messages but they're invisible (being processed)

**Root Cause:**
The function doesn't wait for edge function success before acknowledging the queue message.

**Immediate Actions:**

### 1. Disable the Cron Job (Temporary Fix)
```sql
-- Disable the cron job (replace JOBID with your actual job ID)
SELECT cron.unschedule('JOBID_HERE');
```

### 2. Check the Function Logic
```sql
-- See what util.process_task_queue() does
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'process_task_queue'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'util');
```

### 3. Check Current Tasks
```sql
-- See what tasks exist and their status
SELECT
    id,
    status,
    created_at,
    updated_at,
    input,
    output
FROM tasks
ORDER BY updated_at DESC
LIMIT 10;
```

### 4. Check if Function Calls Edge Function
```sql
-- Check if the function contains calls to the edge function
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'process_task_queue'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'util')
AND pg_get_functiondef(oid) LIKE '%process-task%';
```

## SOLUTION: Fix the Async Processing Issue

### The Problem:
- `util.process_task_queue()` reads messages from `task_processing` queue
- Calls `util.invoke_edge_function()` which uses async `net.http_post()`
- Immediately deletes message before edge function completes
- Messages get lost if edge function fails

### The Fix: Make Edge Function Calls Synchronous

**Step 1: Update the invoke_edge_function to capture response:**

```sql
CREATE OR REPLACE FUNCTION util.invoke_edge_function(
  function_name text,
  body jsonb,
  timeout_milliseconds integer DEFAULT ((5 * 60) * 1000)
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  service_key text;
  response record;
BEGIN
  -- Get the service role key from vault
  SELECT decrypted_secret INTO service_key
  FROM vault.decrypted_secrets
  WHERE vault.decrypted_secrets.name = 'SUPABASE_SERVICE_ROLE_KEY';

  IF service_key IS NULL THEN
    RAISE EXCEPTION 'SUPABASE_SERVICE_ROLE_KEY not found in vault';
  END IF;

  -- Make synchronous HTTP request and capture response
  SELECT * INTO response FROM net.http_post(
    url => util.project_url() || '/functions/v1/' || function_name,
    headers => jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body => body,
    timeout_milliseconds => timeout_milliseconds
  );

  -- Check if the request was successful (2xx status codes)
  IF response.status_code < 200 OR response.status_code >= 300 THEN
    RAISE EXCEPTION 'Edge function call failed with status %: %',
      response.status_code, response.content;
  END IF;
END;
$function$;
```

**Step 2: Update the queue processor to handle errors properly:**

```sql
CREATE OR REPLACE FUNCTION util.process_task_queue(
  batch_size integer DEFAULT 10,
  timeout_milliseconds integer DEFAULT ((5 * 60) * 1000)
)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  job record;
BEGIN
  FOR job IN
    SELECT * FROM pgmq.read('task_processing', timeout_milliseconds / 1000, batch_size)
  LOOP
    -- Call the edge function (now synchronous with error checking)
    BEGIN
      PERFORM util.invoke_edge_function(
        function_name => 'process-task',
        body => job.message || jsonb_build_object('job_id', job.msg_id),
        timeout_milliseconds => timeout_milliseconds
      );

      -- Only acknowledge on successful processing
      PERFORM pgmq.delete('task_processing', job.msg_id);

    EXCEPTION WHEN OTHERS THEN
      -- Log the error but don't acknowledge - message will be retried later
      RAISE WARNING 'Failed to process job %: %', job.msg_id, SQLERRM;
      -- Message stays in queue for automatic retry by pgmq visibility timeout
    END;
  END LOOP;
END;
$function$;
```

**Step 3: Test the fix:**

```sql
-- Test the updated function manually
SELECT util.process_task_queue();

-- Check if messages are being processed properly
SELECT * FROM pgmq.metrics('task_processing');
```

**Step 4: Monitor the results:**
- Cron job should still run every 5 seconds
- But now only successfully processed messages get deleted
- Failed messages stay in queue and get retried automatically
```sql
-- Find the problematic cron job
SELECT jobid, schedule, command, active
FROM cron.job
WHERE command LIKE '%process_task_queue%';

-- Disable it immediately (replace JOBID with the actual ID)
SELECT cron.unschedule('JOBID_HERE');
```

### Step 2: Check the Function Logic
```sql
-- See what the function does
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'process_task_queue'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'util');
```

### Step 3: Check Current Tasks
```sql
-- See what tasks exist
SELECT id, status, created_at, updated_at, input
FROM tasks
ORDER BY updated_at DESC
LIMIT 5;
```

### Step 4: Check if Function Calls Edge Function
```sql
-- Check if it contains edge function calls
SELECT
    proname as function_name,
    pg_get_functiondef(oid) as definition
FROM pg_proc
WHERE proname = 'process_task_queue'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'util')
AND (
    pg_get_functiondef(oid) LIKE '%process-task%' OR
    pg_get_functiondef(oid) LIKE '%http_request%' OR
    pg_get_functiondef(oid) LIKE '%pg_net%'
);
```

### Option 2: Fix the Function Logic (If Needed)
If the function is supposed to run but has bugs, we need to fix it to:
- Only process tasks that are actually ready
- Update task status properly after processing
- Handle errors gracefully
- Not process the same task repeatedly

### Option 3: Change the Schedule
If the function logic is correct but runs too frequently:
```sql
-- Change from every 5 seconds to every 30 seconds
SELECT cron.unschedule('JOBID_HERE');
SELECT cron.schedule('process-task-queue', '*/30 * * * * *', 'SELECT util.process_task_queue();');
```

## DEBUGGING WORKFLOW - Examine the Cron Job Logic

### Query 1: Find the Cron Job Details
```sql
SELECT jobid, schedule, command, active, created_at
FROM cron.job
WHERE command LIKE '%process_task_queue%';
```

**Expected Result:** Should show the job running every 5 seconds

### Query 2: Check Recent Cron Job Runs
```sql
-- Get the jobid from Query 1, then run this
SELECT
    jobid,
    command,
    status,
    start_time,
    end_time,
    return_message,
    output
FROM cron.job_run_details
WHERE jobid = 'YOUR_JOB_ID_HERE'
ORDER BY start_time DESC
LIMIT 10;
```

**Look for:** What the job is returning, if it's succeeding/failing, how long it takes

### Query 3: Examine the Function Logic
```sql
-- Get the complete function definition
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'process_task_queue'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'util');
```

**Critical Analysis Points:**
- Does it select tasks to process?
- Does it call the edge function?
- Does it update task status after processing?
- Does it have proper error handling?

### Query 4: Check Current Tasks Status
```sql
-- See all tasks and their current status
SELECT
    id,
    status,
    created_at,
    updated_at,
    input::text as input_preview,
    output::text as output_preview
FROM tasks
ORDER BY updated_at DESC
LIMIT 20;
```

**Look for:**
- Tasks stuck in 'pending' status
- Tasks that are being processed repeatedly
- Any pattern in task creation/updates

### Query 5: Test the Function Manually
```sql
-- Run the function once manually to see what it does
SELECT util.process_task_queue();
```

**Expected:** Should process 1 task and return some result

### Query 6: Monitor Function Calls in Real Time
```sql
-- Check what happens when the cron job runs (run this right before the next 5-second interval)
SELECT
    id,
    status,
    updated_at
FROM tasks
WHERE status IN ('pending', 'running')
ORDER BY updated_at DESC;
```

**Run this query repeatedly** to see if tasks change status

## ANALYSIS STEPS

1. **Query 1**: Get the job ID and confirm schedule
2. **Query 2**: Check if cron runs are succeeding or failing
3. **Query 3**: Examine the function code for bugs
4. **Query 4**: Identify which tasks are being processed repeatedly
5. **Query 5**: Test the function manually
6. **Query 6**: Monitor real-time changes

## HYPOTHESIZED ISSUES

The `util.process_task_queue()` function likely has one of these problems:

1. **Infinite Loop Logic**: Processes the same task repeatedly without marking it complete
2. **Missing Status Updates**: Calls edge function but doesn't update task status
3. **Error Handling Issues**: Function fails but cron keeps retrying the same task
4. **Queue Logic Bug**: Always finds the same "pending" task to process
5. **Race Condition**: Multiple instances processing the same task simultaneously

## DEBUGGING STRATEGY

Instead of disabling, let's understand the root cause:

1. **Check what tasks exist** and their status
2. **Run the function manually** to see what it does
3. **Monitor task status changes** during cron execution
4. **Check function logic** for the bug
5. **Fix the logic** rather than disabling the automation

## DEBUGGING PLAN - Keep Cron Job Running

**Goal**: Understand why `util.process_task_queue()` keeps processing the same row without disabling the automation.

### DEBUG SCRIPT CREATED
I've created `debug-cron-job.sql` with all the queries you need. Copy and paste these into your Supabase SQL Editor.

### Step-by-Step Investigation:
1. **Run Query 1** → Find the cron job details
2. **Run Query 2** → Check recent cron execution history
3. **Run Query 3** → Examine the function source code
4. **Run Query 4** → See current task states
5. **Run Query 5** → Test the function manually
6. **Run Query 6** → Monitor live task changes

### Expected Findings:
- Function probably finds 1 "pending" task every 5 seconds
- Calls edge function for that task
- Task status doesn't get updated properly
- Same task gets processed repeatedly

### Next Steps After Debugging:
- [x] Created diagnostic SQL queries
- [x] Identified root cause: Async edge function calls with premature message deletion
- [x] **FIXED**: Updated functions to handle errors properly and wait for success
- [ ] Test the updated functions in Supabase SQL Editor
- [ ] Monitor that queue processing works correctly
- [ ] Verify edge function calls are no longer continuous

