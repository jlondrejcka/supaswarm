# Process Scheduled Jobs

Edge function that checks for scheduled jobs due to run and creates tasks for them.

## Setup

This function should be invoked via Supabase Edge Function Cron.

### Configure Cron Schedule

In Supabase Dashboard:
1. Go to Edge Functions
2. Select `process-scheduled-jobs`
3. Enable cron schedule: `* * * * *` (every minute)

Or via Supabase CLI:

```bash
supabase functions schedule process-scheduled-jobs --cron "* * * * *"
```

### Manual Invocation

```bash
curl -X POST \
  https://your-project.supabase.co/functions/v1/process-scheduled-jobs \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
```

## How It Works

1. Queries `scheduled_jobs` table for active jobs where `next_run_at <= NOW()`
2. For each due job:
   - Creates a new session with `channel_type = 'cron'`
   - Creates a task with the configured message and context
   - Updates job's `last_run_at` and calculates `next_run_at`
   - Logs the run in `scheduled_job_runs` table
   - Invokes `process-task` to execute the task
3. Returns summary of processed jobs

## Database Tables

- `scheduled_jobs`: Job definitions
- `scheduled_job_runs`: Execution history
