# Supabase Authentication Setup

Complete user authentication system using Supabase with email/password authentication, session management, and password recovery.

## Overview

The authentication system provides:
- Email/password signup and login
- Session management
- Password reset
- User profile auto-creation
- API token management

## Pages & Routes

### Public Pages
- `/login` - Login page
- `/signup` - Account creation
- `/forgot-password` - Password reset
- `/auth/callback` - Email confirmation callback

### API Endpoints

#### User Authentication

**POST /api/auth/login** (via Supabase client, not direct endpoint)
```typescript
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password123'
})
```

**POST /api/auth/signup** (via Supabase client)
```typescript
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password123',
  options: {
    emailRedirectTo: 'http://localhost:3000/auth/callback'
  }
})
```

**GET /api/auth/session** - Get current user session
```bash
curl -H "Authorization: Bearer <access_token>" \
  http://localhost:3000/api/auth/session
```

**POST /api/auth/session** - Refresh session
```bash
curl -X POST http://localhost:3000/api/auth/session \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "<refresh_token>"}'
```

**POST /api/auth/forgot-password** - Send password reset email
```bash
curl -X POST http://localhost:3000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}'
```

**POST /api/auth/logout** - Sign out user
```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer <access_token>"
```

## Database Changes

### User Profiles Table
Automatically created on first signup via trigger:

```sql
CREATE TABLE public.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text,
  role text DEFAULT 'user',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Trigger auto-creates profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

## Configuration

### Supabase Dashboard Setup

1. **Enable Email Provider**
   - Go to Authentication > Providers
   - Enable Email/Password provider
   - Configure email verification settings

2. **Set Redirect URL**
   - In Authentication > URL Configuration
   - Add: `http://localhost:3000/auth/callback`
   - Production: `https://yourdomain.com/auth/callback`

3. **Email Templates** (Optional)
   - Customize signup confirmation emails
   - Customize password reset emails

### Environment Variables

```env
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://bgqxccmdcpegvbuxmnrf.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Authentication Flow

### Signup Flow
1. User fills signup form with email & password
2. Supabase creates user in `auth.users` table
3. Trigger auto-creates `user_profiles` record
4. Confirmation email sent (if email verification enabled)
5. User clicks confirmation link → redirects to `/auth/callback`
6. Session established, user can login

### Login Flow
1. User enters email & password
2. Supabase validates credentials
3. Returns `access_token` + `refresh_token`
4. Access token stored in memory (or secure cookie)
5. User redirected to dashboard

### Password Reset Flow
1. User clicks "Forgot Password"
2. Enters email address
3. Supabase sends reset email with token
4. User clicks link in email
5. Redirected to reset password form (to implement)
6. User enters new password
7. Supabase updates password

## Session Management

### Access Token
- Short-lived JWT token (default: 1 hour)
- Used to authenticate API requests
- Passed in `Authorization: Bearer <token>` header

### Refresh Token
- Long-lived token (default: 7 days)
- Used to get new access token without re-login
- Should be stored securely (httpOnly cookie recommended)

### Session Endpoints

**Check if user is logged in:**
```typescript
const { data: { user } } = await supabase.auth.getUser()
if (user) {
  // User is logged in
}
```

**Refresh expired session:**
```typescript
const { data, error } = await supabase.auth.refreshSession()
if (data.session) {
  // New session established
}
```

**Sign out:**
```typescript
await supabase.auth.signOut()
```

## Protected Routes

### Using Middleware
Protect routes from unauthenticated access:

```typescript
// src/middleware.ts
if (protectedRoute && !user) {
  return redirect('/login')
}
```

### Using Client Components
```typescript
'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function ProtectedPage() {
  const [user, setUser] = useState(null)

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        window.location.href = '/login'
      }
      setUser(user)
    }
    getUser()
  }, [])

  return user ? <div>Protected content</div> : null
}
```

## User Metadata

Store additional user info in `user_metadata`:

```typescript
// During signup
await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password123',
  options: {
    data: {
      name: 'John Doe',
      avatar_url: 'https://...',
      company: 'Acme Inc'
    }
  }
})

// Update profile
await supabase.auth.updateUser({
  data: { 
    name: 'Jane Doe',
    phone: '+1234567890'
  }
})

// Access in app
const user = supabase.auth.getUser()
console.log(user?.user_metadata?.name)
```

## Security Best Practices

1. **Never expose refresh tokens** - Store in httpOnly cookies only
2. **Validate sessions server-side** - Don't trust client-side auth state
3. **Use HTTPS in production** - Protects auth tokens in transit
4. **Set strong password requirements** - Enforce in signup form
5. **Implement rate limiting** - On login/signup endpoints
6. **Log auth events** - For audit trail and anomaly detection
7. **Enable MFA** - For high-security accounts (future)
8. **Secure password reset** - Use time-limited tokens (Supabase handles this)

## Testing

### Manual Testing

1. **Signup:**
   - Navigate to `/signup`
   - Enter email & password
   - Confirm email (if required)
   - Verify user_profiles entry created

2. **Login:**
   - Navigate to `/login`
   - Enter credentials
   - Should redirect to dashboard
   - Verify session exists

3. **Password Reset:**
   - Navigate to `/forgot-password`
   - Enter email
   - Check email for reset link
   - Reset password
   - Login with new password

4. **Protected Routes:**
   - Try accessing `/` without auth
   - Should redirect to `/login`
   - Login, then access works

### API Testing

```bash
# Create account
curl -X POST https://bgqxccmdcpegvbuxmnrf.supabase.co/auth/v1/signup \
  -H "apikey: <ANON_KEY>" \
  -d '{"email":"test@example.com","password":"password123"}'

# Login
curl -X POST https://bgqxccmdcpegvbuxmnrf.supabase.co/auth/v1/token?grant_type=password \
  -H "apikey: <ANON_KEY>" \
  -d '{"email":"test@example.com","password":"password123"}'

# Get session
curl -H "Authorization: Bearer <access_token>" \
  http://localhost:3000/api/auth/session
```

## Next Steps

1. ✅ Enable Supabase Auth Email Provider
2. ✅ Configure redirect URLs
3. Test signup/login flows
4. Implement middleware protection
5. Add social login (Google, GitHub) - optional
6. Implement MFA - optional
7. Add user profile management page

## Resources

- [Supabase Auth Docs](https://supabase.com/docs/guides/auth)
- [Password-based Auth](https://supabase.com/docs/guides/auth/passwords)
- [Session Management](https://supabase.com/docs/guides/auth/sessions)
- [Auth Errors](https://supabase.com/docs/reference/javascript/auth-signinwithpassword)
