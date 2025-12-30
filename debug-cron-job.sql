-- DEBUG SCRIPT: Cron Job Issue Investigation
-- Run these queries in sequence in Supabase SQL Editor

-- 1. FIND THE CRON JOB
SELECT jobid, schedule, command, active, created_at
FROM cron.job
WHERE command LIKE '%process_task_queue%';

-- 2. CHECK RECENT CRON RUNS (replace JOBID below)
-- SELECT
--     jobid,
--     command,
--     status,
--     start_time,
--     end_time,
--     return_message,
--     output
-- FROM cron.job_run_details
-- WHERE jobid = 'YOUR_JOB_ID_HERE'
-- ORDER BY start_time DESC
-- LIMIT 5;

-- 3. EXAMINE THE FUNCTION LOGIC
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'process_task_queue'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'util');

-- 4. CHECK CURRENT TASKS
SELECT
    id,
    status,
    created_at,
    updated_at,
    input::text as input_preview,
    output::text as output_preview
FROM tasks
ORDER BY updated_at DESC
LIMIT 10;

-- 5. TEST FUNCTION MANUALLY
-- SELECT util.process_task_queue();

-- 6. MONITOR TASK CHANGES (run repeatedly)
SELECT
    id,
    status,
    updated_at
FROM tasks
WHERE status IN ('pending', 'running')
ORDER BY updated_at DESC
LIMIT 5;
