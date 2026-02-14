# API Token System - Implementation Guide

Complete implementation plan for secure API token authentication with scoped permissions.

## Implementation Status: Ready to Deploy

All code files created, ready for deployment and testing.

## Files Created

### Database
- ✅ `supabase/migrations/20260214000002_api_tokens_schema.sql` - Complete schema

### Authentication Library
- ✅ `src/lib/auth/token-generator.ts` - Token generation & validation
- ✅ `src/lib/auth/validate-token.ts` - Token validation & loading
- ✅ `src/lib/auth/check-permission.ts` - Permission checking logic
- ✅ `src/lib/auth/log-usage.ts` - Usage & audit logging

### Middleware
- ✅ `src/middleware.ts` - API authentication & authorization

### API Routes
- ✅ `src/app/api/auth/tokens/route.ts` - List & create tokens
- ✅ `src/app/api/auth/tokens/[id]/route.ts` - Update & delete tokens
- ✅ `src/app/api/auth/tokens/[id]/rotate/route.ts` - Token rotation
- ✅ `src/app/api/auth/templates/route.ts` - Permission templates

### Documentation
- ✅ `features/api-tokens.md` - Feature documentation
- ✅ `features/api-tokens-implementation.md` - This file

## Deployment Steps

### 1. Install Dependencies

```bash
npm install bcryptjs
npm install --save-dev @types/bcryptjs
```

### 2. Deploy Database Migration

```bash
# Review migration
cat supabase/migrations/20260214000002_api_tokens_schema.sql

# Deploy to Supabase
supabase db push

# Verify tables created
supabase db diff --schema public
```

### 3. Set Up Supabase Auth (If Not Already)

```bash
# Enable email auth in Supabase dashboard
# Settings > Authentication > Providers > Email
```

### 4. Create Auth UI Components (TODO)

Required UI components to implement:

**Login Page** (`/login`)
```typescript
// src/app/login/page.tsx
- Email/password form
- Magic link option
- Redirect to dashboard on success
```

**Signup Page** (`/signup`)
```typescript
// src/app/signup/page.tsx
- Registration form
- Auto-create user_profile via trigger
```

**Settings > API Tokens Page** (`/settings/tokens`)
```typescript
// src/app/settings/tokens/page.tsx
- List user's tokens
- Create new token modal
- Permission builder UI
- Copy token dialog
- Revoke confirmation
```

### 5. Test API Endpoints

```bash
# 1. Login and get user session
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password"}'

# 2. Create token (pass user_id in header for testing)
curl -X POST http://localhost:3000/api/auth/tokens \
  -H "Content-Type: application/json" \
  -H "x-user-id: <user-uuid>" \
  -d '{
    "name": "Test Token",
    "scope_type": "service",
    "duration": "365",
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
  }'

# 3. Test token authentication
curl -X GET http://localhost:3000/api/agents \
  -H "Authorization: Bearer ss_live_xxxxx..."

# 4. List tokens
curl -X GET http://localhost:3000/api/auth/tokens \
  -H "x-user-id: <user-uuid>"

# 5. Rotate token
curl -X POST http://localhost:3000/api/auth/tokens/<token-id>/rotate \
  -H "x-user-id: <user-uuid>"

# 6. Revoke token
curl -X DELETE http://localhost:3000/api/auth/tokens/<token-id> \
  -H "x-user-id: <user-uuid>"
```

### 6. Protect Existing API Routes

Update existing API routes to use token auth context:

```typescript
// Example: src/app/api/agents/route.ts
export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  const scopeType = req.headers.get('x-scope-type')
  const tokenId = req.headers.get('x-token-id')
  
  // Use appropriate Supabase client based on scope
  const supabase = scopeType === 'service' 
    ? supabaseAdmin 
    : supabaseClient
  
  // Query data
  const { data, error } = await supabase
    .from('agents')
    .select('*')
  
  return NextResponse.json(data)
}
```

### 7. Set Up Email Notifications (Optional)

Create Edge Function for expiring token notifications:

```typescript
// supabase/functions/notify-expiring-tokens/index.ts
import { createClient } from '@supabase/supabase-js'

Deno.serve(async () => {
  const supabase = createClient(...)
  
  // Get tokens expiring in 7 days
  const { data } = await supabase.rpc('get_expiring_tokens', { p_days_threshold: 7 })
  
  // Send emails
  for (const token of data) {
    await sendEmail(token.user_email, {
      subject: 'API Token Expiring Soon',
      body: `Your token "${token.token_name}" expires on ${token.expires_at}`
    })
  }
  
  return new Response('OK')
})
```

Schedule daily:
```bash
supabase functions deploy notify-expiring-tokens
supabase functions schedule notify-expiring-tokens --cron "0 9 * * *"
```

## Key Decisions Made

1. ✅ **Supabase Auth** - Use built-in auth.users for user management
2. ✅ **Single Tenant** - Each deployment is isolated instance
3. ✅ **Service + User Tokens** - Two-tier token system
4. ✅ **LLM Token Tracking** - Track input/output tokens in usage logs
5. ✅ **Unique Names** - Enforce unique token names per user
6. ✅ **Audit Logging** - Immutable audit trail for all operations
7. ✅ **Email Notifications** - Notify before expiration
8. ✅ **Token Regeneration** - Rotate without changing permissions
9. ✅ **Permission Templates** - Quick setup with presets
10. ✅ **CORS Protection** - Origin-based access control
11. ✅ **REST Only** - No GraphQL or webhooks for now
12. ❌ **No Vault Access** - Too dangerous for API tokens
13. ❌ **No Custom Metadata** - Can add later if needed

## Security Checklist

- [x] bcrypt hashing with cost factor 10
- [x] Constant-time hash comparison
- [x] Never store plaintext tokens
- [x] Token shown only once at creation
- [x] Prefix-based lookup for performance
- [x] CORS origin validation
- [x] Agent-level restrictions
- [x] Audit logging for all operations
- [x] IP address tracking
- [x] RLS policies for data isolation
- [x] Service role bypass for service tokens
- [x] Expiration enforcement
- [x] Active status checking

## Performance Considerations

- [x] Index on token prefix for fast lookup
- [x] Index on user_id for token listing
- [x] Index on expires_at for cleanup queries
- [x] Async logging (non-blocking)
- [x] Cascade deletes for cleanup
- [x] GIN index for JSONB permissions (future)

## Testing Checklist

### Unit Tests (TODO)
- [ ] Token generation format
- [ ] Hash verification
- [ ] Expiration calculation
- [ ] Permission checking logic
- [ ] CORS validation
- [ ] Agent access checking

### Integration Tests (TODO)
- [ ] Create token flow
- [ ] List tokens
- [ ] Update permissions
- [ ] Rotate token
- [ ] Revoke token
- [ ] Token validation
- [ ] Permission enforcement
- [ ] Usage logging

### Security Tests (TODO)
- [ ] Invalid token format
- [ ] Expired token rejection
- [ ] Revoked token rejection
- [ ] CORS bypass attempt
- [ ] Permission escalation attempt
- [ ] Agent access violation
- [ ] SQL injection attempts

## Monitoring & Alerts (Future)

1. **High-Priority Alerts**
   - Failed auth rate > 10% for token
   - Token used from unexpected origin
   - Permission denied rate > 5%
   - Token rotation frequency anomaly

2. **Metrics to Track**
   - Requests per token per hour
   - LLM token consumption per token
   - Auth failure rate
   - Average response time
   - Top endpoints by token
   - Origin distribution

3. **Dashboard Widgets**
   - Active tokens count
   - Tokens expiring this week
   - Top tokens by usage
   - Recent audit events
   - LLM token costs by token

## Migration Strategy

### Phase 1: Deploy Infrastructure (Day 1)
- Deploy database migration
- Install dependencies
- Deploy middleware
- Test basic token creation

### Phase 2: API Protection (Days 2-3)
- Update existing API routes
- Test permission enforcement
- Verify RLS behavior
- Load test performance

### Phase 3: UI Development (Days 4-6)
- Build login/signup pages
- Create token management UI
- Permission builder interface
- Usage analytics view

### Phase 4: Polish (Days 7-8)
- Email notifications
- Documentation
- Example code
- Video walkthrough

## Estimated Timeline

- **Infrastructure Setup**: 2 hours
- **Testing & Debugging**: 4 hours
- **UI Development**: 12 hours
- **Documentation**: 2 hours
- **Total**: ~20-24 hours (3-4 days)

## Success Criteria

- [ ] Users can create/manage tokens via UI
- [ ] Tokens authenticate API requests
- [ ] Permissions enforced correctly
- [ ] CORS restrictions work
- [ ] Usage logged accurately
- [ ] LLM tokens tracked
- [ ] Audit trail complete
- [ ] Email notifications sent
- [ ] Performance acceptable (<100ms auth)
- [ ] Documentation complete

## Next Steps

1. **Install dependencies** (`npm install bcryptjs`)
2. **Deploy migration** (`supabase db push`)
3. **Build auth UI** (login/signup/tokens pages)
4. **Test end-to-end** (create token → API call)
5. **Deploy to production**

## Support & Questions

- Feature docs: `features/api-tokens.md`
- Schema: `supabase/migrations/20260214000002_api_tokens_schema.sql`
- Examples: See "Use Cases" in feature docs
