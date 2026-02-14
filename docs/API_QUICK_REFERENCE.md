# API Quick Reference

## Endpoints Summary

| Resource | GET List | GET Detail | POST | PATCH | DELETE |
|----------|----------|------------|------|-------|--------|
| **dashboard** | `/stats` | - | - | - | - |
| **approvals** | `/?status=pending` | `/:id` | - | `/:id/review` | - |
| **chats** | `/?task_id=...` | `/:id` | - | - | - |
| **sessions** | `/?status=active` | `/:id` | - | `/:id` | - |
| **tasks** | `/?status=running` | `/:id` | - | `/:id` | - |
| **channels** | `/?type=slack` | `/:id` | `/` | `/:id` | - |
| **agents** | `/?role=worker` | `/:id` | - | `/:id` | - |

## Token Usage

```bash
# Create token
curl -X POST https://app.com/api/auth/tokens \
  -H "X-User-ID: user-123" \
  -H "Content-Type: application/json" \
  -d '{"name":"My Token","permissions":[...]}'

# Use token
curl -H "Authorization: Bearer ss_live_..." \
  https://app.com/api/approvals?status=pending
```

## Common Queries

```bash
# Get pending approvals
GET /api/approvals?status=pending&limit=10

# Get running tasks
GET /api/tasks?status=running

# Get active sessions
GET /api/sessions?status=active

# Get agent details
GET /api/agents/{agent_id}

# Get chat thread
GET /api/chats/{message_id}

# Review approval
POST /api/approvals/{id}
{"approved":true,"review_notes":"Approved"}

# Update task status
PATCH /api/tasks/{id}
{"status":"completed"}

# Create channel
POST /api/channels
{"channel_type":"slack","channel_id":"C123","display_name":"alerts"}

# Update agent
PATCH /api/agents/{id}
{"temperature":0.7,"max_tokens":2000}
```

## Dashboard Stats

```json
GET /api/dashboard/stats
{
  "data": {
    "tasks": {"total":50,"running":5,"completed":40,"failed":3,"pending":2},
    "agents": {"total":8,"active":6,"inactive":2},
    "approvals": {"total":25,"pending":3,"approved":20,"rejected":2},
    "sessions": {"total":15,"active":8,"idle":7},
    "chats": {"total_messages":245,"active_conversations":8},
    "tools": {"total":12,"active":10},
    "skills": {"total":5,"active":4},
    "channels": {"total":3,"active":3}
  }
}
```

## Pages

| Page | URL | Purpose |
|------|-----|---------|
| Approvals List | `/approvals` | View all approval requests |
| Approval Detail | `/approvals/:id` | Review + approve/reject |
| Chats List | `/chats` | Browse task messages |
| Chat Detail | `/chats/:id` | View message thread |

## Error Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad request |
| 401 | Unauthorized (token invalid/missing) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not found |
| 500 | Server error |

## Permission Levels

- `resource:read` - Can list & view details
- `resource:create` - Can create new items (channels only)
- `resource:update` - Can modify items
- `resource:delete` - Not yet implemented

Wildcards:
- `*:read` - Read all resources
- `*:*` - Full access

## Rate Limits

- API: 100 req/min per token (planned)
- Dashboard: Limit 500 results per query
- Default list limit: 50 items
- Max page size: 500 items
