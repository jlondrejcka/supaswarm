# Scheduled Jobs Feature

Create recurring tasks that run on a schedule from the UI.

## Overview

The scheduled jobs feature allows you to configure cron-like recurring tasks that automatically create and execute tasks at specified intervals. This is useful for:
- Daily reports (e.g., "Get weather at 4am and Slack it to me")
- Periodic data syncs
- Automated monitoring and alerts
- Regular maintenance tasks

## Components

### Database Schema
- `scheduled_jobs`: Stores job definitions (schedule, agent, message, context)
- `scheduled_job_runs`: Execution history log
- Helper functions for calculating next run times

### Edge Function
- `process-scheduled-jobs`: Cron-invoked function that checks for due jobs and creates tasks

### UI
- `/jobs` page: Create, view, pause/resume, cancel running tasks, and delete scheduled jobs

### REST API
- Full CRUD API at `/api/jobs` for programmatic management
- See [Scheduled Jobs API Documentation](./scheduled-jobs-api.md) for complete API reference

## Usage

### Managing Jobs

The Jobs UI provides full lifecycle management:

**Create**: Set up new scheduled tasks
**Pause/Resume**: Toggle `is_active` to temporarily stop/restart jobs
**Cancel**: Stop currently running tasks from a job
**Delete**: Permanently remove a job and its history

### Creating a Job

1. Navigate to `/jobs`
2. Click "Create Job"
3. Configure:
   - Name and description
   - Select agent to execute the task
   - Schedule interval (minutely, hourly, daily, weekly, monthly)
   - Time (for daily/weekly/monthly)
   - Task message/instructions
   - Optional: Slack channel for delivery

### Example Use Cases

#### Daily Weather Report
```
Name: Morning Weather
Schedule: Daily at 4:00 AM
Agent: General Assistant
Message: Get the weather forecast for San Francisco and send it to me
Slack Channel: #general
```

#### Weekly Summary
```
Name: Weekly Task Summary
Schedule: Weekly on Monday at 9:00 AM
Agent: Rick (System Agent)
Message: Create a summary of all completed tasks from the past week
```

#### Hourly Health Check
```
Name: System Health Check
Schedule: Hourly
Agent: Monitoring Agent
Message: Check system health metrics and alert if any issues
```

## Interval Types

- **Minutely**: Runs every minute
- **Hourly**: Runs every hour
- **Daily**: Runs once per day at specified time (hour:minute)
- **Weekly**: Runs once per week on specified day and time
- **Monthly**: Runs once per month on the 1st at specified time
- **Custom Cron**: (Future) Support for cron expressions

## Task Context

Jobs can include context variables that are passed to the task:
- `delivery_context`: For Slack/email delivery configuration
- Custom variables for specific agent requirements

## Monitoring

Each job tracks:
- Total runs
- Failed runs
- Last run timestamp
- Next scheduled run
- Currently running tasks (real-time)

The UI auto-refreshes every 5 seconds to show:
- Number of active tasks
- Task IDs and status
- Links to task detail pages

Job execution history is stored in `scheduled_job_runs` table.

### Canceling Running Tasks

If a scheduled job is taking too long or needs to be stopped:
1. View the job card in `/jobs`
2. See the "X running" badge showing active tasks
3. Click "Cancel" to stop all running tasks
4. Tasks are set to `cancelled` status

This is useful when:
- A job is stuck or hanging
- You need to modify the job configuration
- A job is producing unexpected results

## Deployment

1. Deploy the migration:
   ```bash
   supabase db push
   ```

2. Deploy the edge function:
   ```bash
   supabase functions deploy process-scheduled-jobs
   ```

3. Configure cron schedule:
   ```bash
   supabase functions schedule process-scheduled-jobs --cron "* * * * *"
   ```

## Architecture Notes

- Jobs create new sessions with `channel_type = 'cron'`
- Tasks are created in 'pending' status and picked up by `process-pending-tasks`
- Next run calculation is done via SQL function `calculate_next_run()`
- Failed jobs increment `failed_runs` counter but continue scheduling
- Jobs can be paused/resumed without losing schedule state
