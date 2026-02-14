# Scheduled Jobs API Routes

REST API for managing scheduled jobs (cron tasks).

## Structure

```
api/jobs/
├── route.ts                    # GET, POST, PATCH, DELETE /api/jobs
├── [id]/
│   ├── route.ts               # GET /api/jobs/[id]
│   ├── toggle/route.ts        # POST /api/jobs/[id]/toggle
│   ├── cancel/route.ts        # POST /api/jobs/[id]/cancel
│   └── run/route.ts           # POST /api/jobs/[id]/run
└── README.md                  # This file
```

## Endpoints

### `/api/jobs`

**GET** - List all scheduled jobs
- Query params: `?active=true`, `?include_tasks=true`

**POST** - Create new scheduled job
- Body: `{name, agent_id, interval_type, interval_config, task_message, ...}`

**PATCH** - Update scheduled job
- Query params: `?id=<job_id>`
- Body: `{name?, interval_config?, is_active?, ...}`

**DELETE** - Delete scheduled job
- Query params: `?id=<job_id>`

### `/api/jobs/[id]`

**GET** - Get job details with run history and stats

### `/api/jobs/[id]/toggle`

**POST** - Toggle job active/paused state

### `/api/jobs/[id]/cancel`

**POST** - Cancel all running tasks for the job

### `/api/jobs/[id]/run`

**POST** - Manually trigger job (ignores schedule)

## Authentication

All endpoints use Supabase service role key from environment:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Error Handling

Standard error response format:
```json
{
  "error": "Error message"
}
```

Status codes: 200, 201, 400, 404, 500

## Usage Examples

See [Scheduled Jobs API Documentation](../../../../features/scheduled-jobs-api.md) for complete examples.

Quick test:
```bash
# List jobs
curl http://localhost:3000/api/jobs

# Create job
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","agent_id":"uuid","interval_type":"hourly","task_message":"test"}'
```

## Development

### Adding New Endpoints

1. Create route file in appropriate directory
2. Use `createClient(supabaseUrl, supabaseServiceKey)` for DB access
3. Return `NextResponse.json()` for responses
4. Handle errors with try/catch

### Testing Locally

```bash
# Start dev server
npm run dev

# Test endpoint
curl http://localhost:3000/api/jobs
```

## Related

- [Scheduled Jobs Feature](../../../../features/scheduled-jobs.md)
- [Scheduled Jobs API Docs](../../../../features/scheduled-jobs-api.md)
- [Quick Start Guide](../../../../features/scheduled-jobs-quickstart.md)
