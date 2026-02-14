# Scheduled Jobs Quick Start

Get started with scheduled jobs in 5 minutes.

## Setup

1. **Deploy migration** (already done):
   ```bash
   # Migration deployed via Supabase MCP
   ✓ 20260214000001_scheduled_jobs.sql
   ```

2. **Deploy edge function** (already done):
   ```bash
   # Edge function deployed
   ✓ process-scheduled-jobs
   ```

3. **Set up cron schedule**:
   ```bash
   supabase functions schedule process-scheduled-jobs --cron "* * * * *"
   ```
   
   Or via Supabase Dashboard:
   - Go to Edge Functions
   - Select `process-scheduled-jobs`
   - Enable cron: `* * * * *` (every minute)

## Create Your First Job

### Via UI

1. Go to `http://localhost:3000/jobs`
2. Click "Create Job"
3. Fill in:
   - **Name**: Morning Weather
   - **Agent**: Select an agent
   - **Schedule**: Daily at 4:00 AM
   - **Task Message**: "Get the weather forecast and send it to me"
4. Click "Create Job"

### Via API

```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Morning Weather",
    "agent_id": "YOUR_AGENT_ID",
    "interval_type": "daily",
    "interval_config": {"hour": 4, "minute": 0},
    "task_message": "Get the weather forecast and send it to me"
  }'
```

### Via Database

```sql
SELECT upsert_scheduled_job(
  p_name := 'Morning Weather',
  p_agent_id := 'YOUR_AGENT_ID',
  p_interval_type := 'daily',
  p_interval_config := '{"hour": 4, "minute": 0}'::jsonb,
  p_task_message := 'Get the weather forecast and send it to me'
);
```

## Test Your Job

### Manual Run (No Wait)

```bash
curl -X POST http://localhost:3000/api/jobs/JOB_ID/run
```

This creates a task immediately without waiting for the schedule.

### Monitor Progress

```bash
# View job with running tasks
curl http://localhost:3000/api/jobs/JOB_ID

# List all jobs
curl http://localhost:3000/api/jobs?include_tasks=true
```

### Check Logs

View in Supabase Dashboard:
1. Go to Logs
2. Filter by function: `process-scheduled-jobs`
3. See cron execution logs

## Common Patterns

### Daily Report at 9 AM

```json
{
  "name": "Daily Report",
  "interval_type": "daily",
  "interval_config": {"hour": 9, "minute": 0},
  "task_message": "Generate daily summary report"
}
```

### Hourly Health Check

```json
{
  "name": "Health Check",
  "interval_type": "hourly",
  "task_message": "Check system health and alert if issues"
}
```

### Weekly Summary (Monday 9 AM)

```json
{
  "name": "Weekly Summary",
  "interval_type": "weekly",
  "interval_config": {"day_of_week": 1, "hour": 9, "minute": 0},
  "task_message": "Generate weekly summary of tasks"
}
```

### With Slack Delivery

```json
{
  "name": "Morning News",
  "interval_type": "daily",
  "interval_config": {"hour": 7, "minute": 0},
  "task_message": "Get top news headlines",
  "task_context": {
    "delivery_context": {
      "channel_type": "slack",
      "channel_id": "#general"
    }
  }
}
```

## Troubleshooting

### Job not running?

1. Check if job is active:
   ```bash
   curl http://localhost:3000/api/jobs/JOB_ID
   ```

2. Check cron is configured:
   - Supabase Dashboard → Edge Functions → process-scheduled-jobs
   - Verify cron schedule is enabled

3. Check logs:
   - Supabase Dashboard → Logs → Edge Functions
   - Look for `process-scheduled-jobs` executions

### Cancel stuck job

```bash
curl -X POST http://localhost:3000/api/jobs/JOB_ID/cancel
```

### Pause job

```bash
curl -X POST http://localhost:3000/api/jobs/JOB_ID/toggle
```

## Next Steps

- [Full API Documentation](./scheduled-jobs-api.md)
- [Detailed Feature Guide](./scheduled-jobs.md)
- Configure Slack integration for delivery
- Set up approval workflows for sensitive jobs
- Monitor job performance in `/jobs` page

## Example: Weather Bot

Complete example that gets weather and sends to Slack daily:

```bash
# 1. Get agent ID
AGENT_ID=$(curl http://localhost:3000/api/agents | jq -r '.agents[0].id')

# 2. Create job
JOB_RESPONSE=$(curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Daily Weather Bot\",
    \"description\": \"Get weather forecast and send to Slack\",
    \"agent_id\": \"$AGENT_ID\",
    \"interval_type\": \"daily\",
    \"interval_config\": {\"hour\": 7, \"minute\": 0},
    \"task_message\": \"Get the weather forecast for San Francisco and send it to the team\",
    \"task_context\": {
      \"delivery_context\": {
        \"channel_type\": \"slack\",
        \"channel_id\": \"#general\"
      }
    }
  }")

JOB_ID=$(echo $JOB_RESPONSE | jq -r '.job.id')

# 3. Test immediately
curl -X POST http://localhost:3000/api/jobs/$JOB_ID/run

# 4. Monitor
watch -n 5 "curl -s http://localhost:3000/api/jobs/$JOB_ID | jq '.running_tasks'"

echo "Job created: $JOB_ID"
echo "View at: http://localhost:3000/jobs"
```
