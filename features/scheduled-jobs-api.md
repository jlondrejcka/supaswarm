# Scheduled Jobs API

Complete REST API for managing scheduled jobs (cron tasks).

## Base URL

```
http://localhost:3000/api/jobs
```

## Authentication

All endpoints require Supabase authentication. Include the service role key or user JWT in requests.

---

## Endpoints

### 1. List Jobs

**GET** `/api/jobs`

List all scheduled jobs with optional filtering.

#### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `active` | boolean | Filter by active status (`?active=true`) |
| `include_tasks` | boolean | Include running tasks in response (`?include_tasks=true`) |

#### Response

```json
{
  "jobs": [
    {
      "id": "uuid",
      "name": "Daily Weather",
      "description": "Get weather at 4am",
      "agent_id": "uuid",
      "interval_type": "daily",
      "interval_config": {"hour": 4, "minute": 0},
      "task_message": "Get weather forecast",
      "task_context": {"delivery_context": {"channel_type": "slack", "channel_id": "#general"}},
      "is_active": true,
      "last_run_at": "2026-02-13T04:00:00Z",
      "next_run_at": "2026-02-14T04:00:00Z",
      "total_runs": 45,
      "failed_runs": 2,
      "created_at": "2026-01-01T00:00:00Z",
      "updated_at": "2026-02-13T04:00:00Z",
      "running_tasks": []
    }
  ],
  "count": 1
}
```

#### Example

```bash
curl http://localhost:3000/api/jobs?active=true&include_tasks=true
```

---

### 2. Get Job Details

**GET** `/api/jobs/[id]`

Get detailed information about a specific job including run history and running tasks.

#### Response

```json
{
  "job": {
    "id": "uuid",
    "name": "Daily Weather",
    "..."
  },
  "runs": [
    {
      "id": "uuid",
      "job_id": "uuid",
      "task_id": "uuid",
      "started_at": "2026-02-13T04:00:00Z",
      "status": "success",
      "error_message": null,
      "created_at": "2026-02-13T04:00:00Z"
    }
  ],
  "running_tasks": [
    {
      "id": "uuid",
      "status": "running",
      "created_at": "2026-02-14T04:00:00Z",
      "session_id": "uuid",
      "agent_slug": "weather-agent"
    }
  ],
  "stats": {
    "total_runs": 45,
    "failed_runs": 2,
    "success_rate": "95.6"
  }
}
```

#### Example

```bash
curl http://localhost:3000/api/jobs/abc-123-def-456
```

---

### 3. Create Job

**POST** `/api/jobs`

Create a new scheduled job.

#### Request Body

```json
{
  "name": "Morning Weather",
  "description": "Get weather forecast and send to Slack",
  "agent_id": "uuid",
  "interval_type": "daily",
  "interval_config": {"hour": 4, "minute": 0},
  "task_message": "Get the weather forecast for San Francisco",
  "task_context": {
    "delivery_context": {
      "channel_type": "slack",
      "channel_id": "#general"
    }
  },
  "is_active": true
}
```

#### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Job name |
| `description` | string | No | Job description |
| `agent_id` | uuid | Yes | Agent to execute the task |
| `interval_type` | enum | Yes | `minutely`, `hourly`, `daily`, `weekly`, `monthly`, `custom_cron` |
| `interval_config` | object | No | Config for schedule (e.g., `{"hour": 4, "minute": 0}`) |
| `cron_expression` | string | No | Cron expression (for `custom_cron` type) |
| `task_message` | string | Yes | Task instructions |
| `task_context` | object | No | Context variables to pass to task |
| `is_active` | boolean | No | Active state (default: `true`) |

#### Response

```json
{
  "success": true,
  "job": {
    "id": "uuid",
    "name": "Morning Weather",
    "..."
  }
}
```

#### Example

```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Daily Weather",
    "agent_id": "abc-123",
    "interval_type": "daily",
    "interval_config": {"hour": 4, "minute": 0},
    "task_message": "Get weather and send to Slack"
  }'
```

---

### 4. Update Job

**PATCH** `/api/jobs?id=[job_id]`

Update an existing scheduled job.

#### Request Body

```json
{
  "name": "Evening Weather",
  "interval_config": {"hour": 20, "minute": 0},
  "is_active": false
}
```

All fields are optional. Only provided fields will be updated.

#### Response

```json
{
  "success": true,
  "job": {
    "id": "uuid",
    "name": "Evening Weather",
    "..."
  }
}
```

#### Example

```bash
curl -X PATCH "http://localhost:3000/api/jobs?id=abc-123" \
  -H "Content-Type: application/json" \
  -d '{"is_active": false}'
```

---

### 5. Delete Job

**DELETE** `/api/jobs?id=[job_id]`

Permanently delete a scheduled job and its run history.

#### Response

```json
{
  "success": true
}
```

#### Example

```bash
curl -X DELETE "http://localhost:3000/api/jobs?id=abc-123"
```

---

### 6. Toggle Job State

**POST** `/api/jobs/[id]/toggle`

Toggle job between active and paused states.

#### Response

```json
{
  "success": true,
  "is_active": false
}
```

#### Example

```bash
curl -X POST http://localhost:3000/api/jobs/abc-123/toggle
```

---

### 7. Cancel Running Tasks

**POST** `/api/jobs/[id]/cancel`

Cancel all currently running tasks for a job.

#### Response

```json
{
  "success": true,
  "cancelled_count": 3,
  "task_ids": ["task-1", "task-2", "task-3"],
  "message": "Cancelled 3 task(s) for job \"Daily Weather\""
}
```

#### Example

```bash
curl -X POST http://localhost:3000/api/jobs/abc-123/cancel
```

---

### 8. Manual Run

**POST** `/api/jobs/[id]/run`

Manually trigger a job run immediately (ignores schedule).

#### Response

```json
{
  "success": true,
  "task_id": "uuid",
  "session_id": "uuid",
  "message": "Manually triggered job \"Daily Weather\""
}
```

#### Example

```bash
curl -X POST http://localhost:3000/api/jobs/abc-123/run
```

---

## Error Responses

All endpoints return standard error responses:

```json
{
  "error": "Error message"
}
```

### Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `404` - Not Found
- `500` - Internal Server Error

---

## Interval Types

### Minutely
```json
{
  "interval_type": "minutely",
  "interval_config": {}
}
```

### Hourly
```json
{
  "interval_type": "hourly",
  "interval_config": {}
}
```

### Daily
```json
{
  "interval_type": "daily",
  "interval_config": {
    "hour": 4,
    "minute": 0
  }
}
```

### Weekly
```json
{
  "interval_type": "weekly",
  "interval_config": {
    "day_of_week": 1,
    "hour": 4,
    "minute": 0
  }
}
```
`day_of_week`: 0=Sunday, 1=Monday, ..., 6=Saturday

### Monthly
```json
{
  "interval_type": "monthly",
  "interval_config": {
    "hour": 4,
    "minute": 0
  }
}
```
Runs on the 1st of each month.

---

## Integration Examples

### Python

```python
import requests

# Create job
response = requests.post(
    "http://localhost:3000/api/jobs",
    json={
        "name": "Daily Report",
        "agent_id": "agent-uuid",
        "interval_type": "daily",
        "interval_config": {"hour": 9, "minute": 0},
        "task_message": "Generate daily report"
    }
)
job = response.json()["job"]

# Toggle job
requests.post(f"http://localhost:3000/api/jobs/{job['id']}/toggle")

# Cancel tasks
requests.post(f"http://localhost:3000/api/jobs/{job['id']}/cancel")
```

### JavaScript/TypeScript

```typescript
// Create job
const response = await fetch("http://localhost:3000/api/jobs", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "Hourly Sync",
    agent_id: "agent-uuid",
    interval_type: "hourly",
    task_message: "Sync data from external API"
  })
});
const { job } = await response.json();

// List active jobs
const activeJobs = await fetch(
  "http://localhost:3000/api/jobs?active=true&include_tasks=true"
).then(r => r.json());

// Manual run
await fetch(`http://localhost:3000/api/jobs/${job.id}/run`, {
  method: "POST"
});
```

### cURL

```bash
# Create
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Job","agent_id":"uuid","interval_type":"hourly","task_message":"Test"}'

# List
curl http://localhost:3000/api/jobs?active=true

# Get details
curl http://localhost:3000/api/jobs/abc-123

# Update
curl -X PATCH "http://localhost:3000/api/jobs?id=abc-123" \
  -H "Content-Type: application/json" \
  -d '{"is_active":false}'

# Toggle
curl -X POST http://localhost:3000/api/jobs/abc-123/toggle

# Cancel
curl -X POST http://localhost:3000/api/jobs/abc-123/cancel

# Manual run
curl -X POST http://localhost:3000/api/jobs/abc-123/run

# Delete
curl -X DELETE "http://localhost:3000/api/jobs?id=abc-123"
```

---

## Use Cases

### Monitoring Dashboard
```bash
# Get all jobs with running tasks
curl http://localhost:3000/api/jobs?include_tasks=true
```

### Emergency Stop
```bash
# Cancel all tasks for a misbehaving job
curl -X POST http://localhost:3000/api/jobs/abc-123/cancel
```

### Testing
```bash
# Manually trigger job without waiting for schedule
curl -X POST http://localhost:3000/api/jobs/abc-123/run
```

### Maintenance
```bash
# Pause all jobs
for id in $(curl http://localhost:3000/api/jobs | jq -r '.jobs[].id'); do
  curl -X PATCH "http://localhost:3000/api/jobs?id=$id" \
    -H "Content-Type: application/json" \
    -d '{"is_active":false}'
done
```
