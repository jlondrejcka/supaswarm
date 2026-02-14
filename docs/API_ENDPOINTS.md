# API Endpoints & Token Authentication

## Overview

All new API endpoints are protected by token-based authentication. Tokens can be created via `/api/auth/tokens` and must be included in the `Authorization` header as `Bearer <token>`.

## Token System

**Token Format**: `ss_live_` + 43 alphanumeric chars (total 50 chars)

**Header**: `Authorization: Bearer ss_live_...`

### Creating Tokens

```bash
POST /api/auth/tokens
Content-Type: application/json
X-User-ID: <user-id>

{
  "name": "My API Token",
  "scope_type": "service", // or "user"
  "duration": "365",
  "allowed_agent_ids": ["agent-1", "agent-2"], // optional
  "allowed_origins": ["https://example.com"], // optional
  "permissions": [
    {
      "resource": "dashboard",
      "route_pattern": "/api/dashboard/*",
      "can_read": true
    },
    {
      "resource": "approvals",
      "route_pattern": "/api/approvals/*",
      "can_read": true,
      "can_update": true
    }
  ]
}
```

**Response**: Returns full token (only shown once, copy immediately)

## Protected API Endpoints

### Dashboard

**GET** `/api/dashboard/stats`
- Aggregate metrics for all resources
- Returns counts for: tasks, agents, approvals, sessions, chats, tools, skills, channels

**Query Params**: None required

**Permission**: `dashboard:read`

### Approvals

**GET** `/api/approvals`
- List approval requests
- Query params: `status`, `limit`, `offset`
- Permission: `approvals:read`

**GET** `/api/approvals/[id]`
- Get approval details
- Permission: `approvals:read`

**POST** `/api/approvals/[id]/review`
- Approve or reject request
- Body: `{ approved: boolean, review_notes?: string }`
- Permission: `approvals:update`

### Chats

**GET** `/api/chats`
- List task messages
- Query params: `task_id`, `type`, `limit`, `offset`
- Permission: `chats:read`

**GET** `/api/chats/[id]`
- Get chat message + thread chain
- Permission: `chats:read`

### Sessions

**GET** `/api/sessions`
- List sessions
- Query params: `status`, `agent_id`, `limit`, `offset`
- Permission: `sessions:read`

**GET** `/api/sessions/[id]`
- Get session details
- Permission: `sessions:read`

**PATCH** `/api/sessions/[id]`
- Update session (status, display_name)
- Permission: `sessions:update`

### Tasks

**GET** `/api/tasks`
- List tasks
- Query params: `status`, `agent_id`, `session_id`, `limit`, `offset`
- Permission: `tasks:read`

**GET** `/api/tasks/[id]`
- Get task details
- Permission: `tasks:read`

**PATCH** `/api/tasks/[id]`
- Update task (status, priority, mission_status)
- Permission: `tasks:update`

### Channels

**GET** `/api/channels`
- List channels
- Query params: `type`, `status`, `limit`, `offset`
- Permission: `channels:read`

**GET** `/api/channels/[id]`
- Get channel details + recent events
- Permission: `channels:read`

**POST** `/api/channels`
- Create new channel
- Body: `{ channel_type, channel_id, display_name?, config? }`
- Permission: `channels:create`

**PATCH** `/api/channels/[id]`
- Update channel
- Permission: `channels:update`

### Agents

**GET** `/api/agents`
- List agents
- Query params: `role`, `is_active`, `limit`, `offset`
- Permission: `agents:read`

**GET** `/api/agents/[id]`
- Get agent details with skills/tools
- Permission: `agents:read`

**PATCH** `/api/agents/[id]`
- Update agent (name, model, temperature, etc)
- Permission: `agents:update`

## Usage Examples

### Using cURL

```bash
# Get dashboard stats
curl -H "Authorization: Bearer ss_live_..." \
  https://your-app.com/api/dashboard/stats

# List approvals
curl -H "Authorization: Bearer ss_live_..." \
  "https://your-app.com/api/approvals?status=pending&limit=10"

# Review approval
curl -X POST \
  -H "Authorization: Bearer ss_live_..." \
  -H "Content-Type: application/json" \
  -d '{"approved":true,"review_notes":"Looks good"}' \
  https://your-app.com/api/approvals/[id]
```

### Using JavaScript/TypeScript

```typescript
const token = 'ss_live_...';

// Fetch stats
const stats = await fetch('/api/dashboard/stats', {
  headers: { Authorization: `Bearer ${token}` }
}).then(r => r.json());

// List approvals
const approvals = await fetch('/api/approvals?status=pending', {
  headers: { Authorization: `Bearer ${token}` }
}).then(r => r.json());

// Review approval
await fetch('/api/approvals/[id]', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ approved: true })
});
```

### Using Python

```python
import requests

TOKEN = 'ss_live_...'
BASE_URL = 'https://your-app.com'
HEADERS = {'Authorization': f'Bearer {TOKEN}'}

# Get stats
stats = requests.get(
  f'{BASE_URL}/api/dashboard/stats',
  headers=HEADERS
).json()

# List approvals
approvals = requests.get(
  f'{BASE_URL}/api/approvals?status=pending',
  headers=HEADERS
).json()

# Review approval
requests.post(
  f'{BASE_URL}/api/approvals/[id]',
  headers={**HEADERS, 'Content-Type': 'application/json'},
  json={'approved': True}
)
```

## Response Format

All endpoints return consistent JSON response:

### Success (2xx)

```json
{
  "data": [...],
  "meta": {
    "timestamp": "2026-02-14T...",
    "limit": 50,
    "offset": 0
  }
}
```

### Error (4xx/5xx)

```json
{
  "error": "Detailed error message"
}
```

## Middleware

The middleware at `/src/middleware.ts` automatically:
1. Routes requests to protected API endpoints
2. Extracts token from Authorization header
3. Validates token format, expiration, active status
4. Checks permissions against requested resource
5. Sets response headers with token metadata

Protected routes require token auth. Public routes (auth, vault, etc) bypass middleware.

## Files Structure

```
src/
├── lib/auth/
│   └── verify-api-request.ts      # Token validation helper
├── app/api/
│   ├── dashboard/
│   │   └── stats/route.ts
│   ├── approvals/
│   │   ├── route.ts               # List + Create
│   │   └── [id]/route.ts          # Get + Review
│   ├── chats/
│   │   ├── route.ts               # List
│   │   └── [id]/route.ts          # Get + Thread
│   ├── sessions/
│   │   ├── route.ts               # List
│   │   └── [id]/route.ts          # Get + Update
│   ├── tasks/
│   │   ├── route.ts               # List
│   │   └── [id]/route.ts          # Get + Update
│   ├── channels/
│   │   ├── route.ts               # List + Create
│   │   └── [id]/route.ts          # Get + Update
│   └── agents/
│       ├── route.ts               # List
│       └── [id]/route.ts          # Get + Update
└── app/
    ├── approvals/
    │   ├── page.tsx               # List view
    │   └── [id]/page.tsx          # Detail + Review
    └── chats/
        ├── page.tsx               # List view
        └── [id]/page.tsx          # Detail + Thread
```

## Security

- Tokens hashed with bcrypt before storage
- Tokens validated on every request
- Expiration checked automatically
- CORS origins verified if specified
- Agent access restrictions enforced
- All requests logged with usage tracking
- Permissions checked against route patterns

## Token Expiration

Tokens expire based on duration set at creation:
- Check `expires_at` field in token metadata
- Expired tokens return 401 Unauthorized
- Create new token before expiration

## Revoking Tokens

Tokens can be revoked via:
- `/api/auth/tokens/[id]` DELETE endpoint
- Sets `is_active` to false
- Revoked tokens return 401 Unauthorized

## Auditing

All token usage is logged:
- Check `api_token_usage` table for access logs
- Includes: timestamp, endpoint, status code, user
- Use for security auditing and analytics
