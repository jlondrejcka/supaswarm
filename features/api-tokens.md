# API Token System

Secure API authentication with scoped permissions for programmatic access to SupaSwarm.

## Overview

The API token system allows users to create secure API tokens with granular permissions for programmatic access to SupaSwarm resources. This enables:
- Programmatic agent management and task execution
- Integration with external systems and CI/CD pipelines
- Secure access control with CORS and agent-level restrictions
- Usage tracking and LLM token consumption monitoring
- Audit logging for compliance and security

## Architecture

### Token Types

**Service Tokens** (Default)
- Full access to resources (respects configured permissions)
- Can be scoped to specific agents
- Bypasses RLS (Row Level Security)
- Ideal for backend integrations and automation
- **No user restriction** - can be used by anyone who has the token

**User Tokens**
- **Tied to specific user account** - only that user can use the token
- Respects RLS policies
- Suitable for user-facing applications
- Limited to user's own resources
- **Security**: Attempting to use another user's token returns 403 Forbidden

### Token Format

```
ss_live_<43-character-base64url-string>
```

- Prefix: `ss_live_` for identification
- Entropy: 256 bits of cryptographic randomness
- Storage: bcrypt-hashed, never stored in plaintext
- Prefix stored for quick lookup (first 16 characters)

## Features

### 1. Token Management

**Create Token**
- Choose service or user scope
- Select permission template or custom permissions
- Set expiration (7, 30, 90, 180, 365 days, or never)
- Optional agent restrictions (service tokens only)
- Optional CORS origin restrictions

**List Tokens**
- View all your tokens with metadata
- See last used timestamp
- Monitor expiration dates
- Check permission counts

**Update Token**
- Change name and permissions
- Enable/disable token
- Update agent or CORS restrictions
- Cannot change scope type or expiration (security)

**Revoke Token**
- Permanently delete token
- Cascade deletes permissions and logs
- Audit trail maintained

**Rotate Token**
- Generate new secret without changing permissions
- Old token immediately invalidated
- Useful for security incidents or regular rotation

### 2. Permission System

#### Resources
- `agents` - Agent management
- `tasks` - Task execution and monitoring
- `sessions` - Session management
- `tools` - Tool configuration
- `skills` - Skill management
- `channels` - Channel integrations

#### CRUD Operations
- `can_create` - POST requests
- `can_read` - GET requests
- `can_update` - PUT/PATCH requests
- `can_delete` - DELETE requests

#### Route Patterns
- Exact: `/api/agents` - Only this endpoint
- Wildcard: `/api/agents/*` - All sub-routes
- Parameter: `/api/agents/:id` - Single resource by ID

#### Permission Templates

**Read Only**
- Read access to all resources
- No create, update, or delete permissions

**Full Access**
- Complete CRUD on all resources
- Best for trusted integrations

**Agent Management**
- Full access to agents
- Read-only for other resources

**Task Execution**
- Create and read tasks
- Read agents
- Ideal for execution-only workflows

### 3. Security Features

#### Token Hashing
- bcrypt with cost factor 10
- Constant-time comparison to prevent timing attacks
- Prefix-based lookup for performance

#### CORS Protection
- Restrict tokens to specific origins
- Prevent token theft from unauthorized domains
- Support wildcard subdomains (e.g., `*.example.com`)

#### Agent Restrictions
- Service tokens can be scoped to specific agents
- Prevents unauthorized access to other agents
- Useful for multi-tenant scenarios

#### Rate Limiting
- Track request counts per token
- Monitor for abuse patterns
- (Future: Enforce rate limits per token)

#### Audit Logging
- All token operations logged
- Track creation, updates, revocations, rotations
- IP address and details captured
- Immutable audit trail

### 4. Usage Tracking

**Request Logs**
- Endpoint, method, status code
- Response time in milliseconds
- IP address and user agent
- Origin and referer for CORS tracking

**LLM Token Tracking**
- Input tokens consumed
- Output tokens consumed
- Track costs per API call
- Aggregate by token or time period

**Analytics Dashboard** (Future)
- Requests per token over time
- Most used endpoints
- Success/error rates
- LLM token consumption trends

### 5. Expiration & Notifications

**Token Expiration**
- Choose duration at creation
- Cannot be changed after creation (security)
- Expired tokens automatically rejected

**Email Notifications** (Future)
- Notify 7 days before expiration
- Daily reminder for expiring tokens
- Immediate notification on revocation

## API Reference

### Authentication

All API requests must include the token in the Authorization header:

```bash
curl -H "Authorization: Bearer ss_live_xxxxx..." \
  https://api.supaswarm.com/api/agents
```

### Endpoints

#### Create Token
```
POST /api/auth/tokens
```

**Request:**
```json
{
  "name": "Production API",
  "scope_type": "service",
  "duration": "365",
  "allowed_agent_ids": ["uuid1", "uuid2"],
  "allowed_origins": ["https://app.example.com"],
  "permissions": [
    {
      "resource": "agents",
      "route_pattern": "/api/agents/*",
      "can_create": true,
      "can_read": true,
      "can_update": true,
      "can_delete": false
    }
  ]
}
```

**Response:**
```json
{
  "token": "ss_live_AbCdEf1234567890...",
  "token_id": "uuid",
  "prefix": "ss_live_xxxxxxxx",
  "expires_at": "2027-02-14T00:00:00Z",
  "message": "Token created successfully. Copy it now - you will not see it again."
}
```

#### List Tokens
```
GET /api/auth/tokens
```

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "Production API",
    "prefix": "ss_live_xxxxxxxx",
    "scope_type": "service",
    "last_used_at": "2026-02-13T10:30:00Z",
    "expires_at": "2027-02-14T00:00:00Z",
    "is_active": true,
    "created_at": "2026-02-01T00:00:00Z",
    "permissions_count": 5,
    "has_agent_restrictions": true,
    "has_cors_restrictions": true
  }
]
```

#### Update Token
```
PATCH /api/auth/tokens/:id
```

**Request:**
```json
{
  "name": "Production API (Updated)",
  "is_active": false,
  "permissions": [...]
}
```

#### Revoke Token
```
DELETE /api/auth/tokens/:id
```

#### Rotate Token
```
POST /api/auth/tokens/:id/rotate
```

**Response:**
```json
{
  "token": "ss_live_NewSecret123...",
  "prefix": "ss_live_yyyyyyyy",
  "message": "Token regenerated successfully. Copy it now - you will not see it again."
}
```

#### List Permission Templates
```
GET /api/auth/templates
```

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "Full Access",
    "description": "Complete CRUD access to all resources",
    "is_system": true,
    "permissions": [...]
  }
]
```

## Use Cases

### CI/CD Pipeline
```bash
# Create task in CI/CD
curl -X POST \
  -H "Authorization: Bearer $SUPASWARM_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "uuid", "input": {"message": "Deploy to production"}}' \
  https://api.supaswarm.com/api/tasks
```

### External Dashboard
```typescript
// Read-only token for monitoring dashboard
const response = await fetch('https://api.supaswarm.com/api/tasks', {
  headers: {
    'Authorization': `Bearer ${process.env.SUPASWARM_TOKEN}`
  }
})
const tasks = await response.json()
```

### Automated Agent Management
```python
import requests

token = os.environ['SUPASWARM_TOKEN']
headers = {'Authorization': f'Bearer {token}'}

# Create new agent
response = requests.post(
    'https://api.supaswarm.com/api/agents',
    headers=headers,
    json={
        'name': 'Auto-generated Agent',
        'system_prompt': '...',
        'model': 'gpt-4o'
    }
)
```

## Security Best Practices

1. **Never commit tokens** - Use environment variables
2. **Rotate regularly** - Use token rotation feature
3. **Principle of least privilege** - Grant minimal permissions needed
4. **Monitor usage** - Review logs for suspicious activity
5. **Set expiration** - Avoid "never expires" for production tokens
6. **Restrict CORS** - Limit origins for browser-based apps
7. **Revoke unused tokens** - Clean up old or inactive tokens
8. **Use service tokens** - For backend/server-to-server only
9. **Separate environments** - Different tokens for dev/staging/prod
10. **Audit regularly** - Review audit logs monthly

## Implementation Details

### Database Tables
- `user_profiles` - User account information
- `api_tokens` - Token metadata and hashes
- `token_permissions` - Granular CRUD permissions
- `token_usage_logs` - Request and LLM token tracking
- `permission_templates` - Reusable permission presets
- `token_audit_log` - Immutable audit trail

### Middleware Flow
1. Extract token from Authorization header
2. Validate format and lookup by prefix
3. Verify bcrypt hash (constant-time)
4. Check expiration and active status
5. Validate CORS origin (if applicable)
6. Check route permissions (CRUD)
7. Validate agent restrictions (if applicable)
8. Attach auth context to request
9. Log usage asynchronously

### RLS Context
- Service tokens bypass RLS (use admin client)
- User tokens respect RLS (use user-scoped queries)
- Set session context for user-scoped operations

## Deployment

1. Deploy migration:
   ```bash
   supabase db push
   ```

2. Verify tables:
   ```bash
   supabase db diff --schema public
   ```

3. Test token creation:
   ```bash
   curl -X POST /api/auth/tokens -d '{...}'
   ```

## Future Enhancements

- Email notifications for expiring tokens
- Rate limit enforcement per token
- Usage analytics dashboard
- Custom permission templates (user-created)
- Token metadata (custom JSON fields)
- Webhook authentication tokens
- Token hierarchy (master tokens create sub-tokens)
- Geographic restrictions (IP allowlisting)
- Time-based restrictions (only allow access during business hours)
- Request payload logging for debugging
