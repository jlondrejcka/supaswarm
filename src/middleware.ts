/**
 * API Token Authentication Middleware
 * Validates tokens and enforces permissions for API routes
 * 
 * Note: This runs in Edge Runtime, so we avoid bcrypt here
 */

import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_ROUTES = [
  '/login',
  '/signup',
  '/api/auth/login',
  '/api/auth/signup',
  '/api/auth/verify-token', // Allow token verification endpoint
  '/_next',
  '/favicon.ico',
  '/public'
]

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname
  
  // Skip auth for public routes
  if (PUBLIC_ROUTES.some(route => path.startsWith(route))) {
    return NextResponse.next()
  }
  
  // Check for API token in Authorization header
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace(/^Bearer\s+/i, '')
  
  if (token && token.startsWith('ss_live_')) {
    // For API routes, validate token via internal API call
    if (path.startsWith('/api/')) {
      try {
        // Call internal verification endpoint
        const verifyUrl = new URL('/api/auth/verify-token', req.url)
        const verifyRes = await fetch(verifyUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            token,
            path,
            method: req.method,
            origin: req.headers.get('origin'),
            // Pass user context header for user token validation
            // In a real implementation, this would come from Supabase auth session
            userIdContext: req.headers.get('x-user-id-context')
          })
        })
        
        if (!verifyRes.ok) {
          const error = await verifyRes.json()
          return NextResponse.json(
            { error: error.error || 'Unauthorized' },
            { status: verifyRes.status }
          )
        }
        
        const auth = await verifyRes.json()
        
        // Attach auth context to request headers
        const response = NextResponse.next()
        response.headers.set('x-token-id', auth.token_id)
        response.headers.set('x-scope-type', auth.scope_type)
        if (auth.user_id) {
          response.headers.set('x-user-id', auth.user_id)
        }
        
        // Set CORS headers if origin present
        const origin = req.headers.get('origin')
        if (origin) {
          response.headers.set('Access-Control-Allow-Origin', origin)
          response.headers.set('Access-Control-Allow-Credentials', 'true')
          response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
          response.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
        }
        
        return response
      } catch (error) {
        console.error('[middleware] Token verification failed:', error)
        return NextResponse.json(
          { error: 'Authentication failed' },
          { status: 500 }
        )
      }
    }
  }
  
  // For non-API routes without token, fall back to session-based auth
  // (Existing Supabase auth check would go here)
  
  // For API routes without valid token, require auth
  if (path.startsWith('/api/') && !path.startsWith('/api/auth/')) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    )
  }
  
  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)'
  ]
}
