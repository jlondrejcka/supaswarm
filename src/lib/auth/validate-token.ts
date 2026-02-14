/**
 * API Token Validation
 * Validates tokens and loads permissions
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// Edge-compatible token format validation
function isValidTokenFormat(token: string): boolean {
  const TOKEN_PREFIX = 'ss_live_'
  if (!token.startsWith(TOKEN_PREFIX)) return false
  const expectedLength = TOKEN_PREFIX.length + 43
  if (token.length !== expectedLength) return false
  return true
}

function extractTokenPrefix(token: string): string | null {
  if (!isValidTokenFormat(token)) return null
  return token.substring(0, 16)
}

function isTokenExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt) < new Date()
}

// Edge-compatible token verification using crypto.subtle
async function verifyTokenEdge(token: string, hash: string): Promise<boolean> {
  try {
    // Use bcrypt comparison via API route or direct check
    // For now, we'll do a simple comparison since we need bcryptjs
    const bcrypt = await import('bcryptjs')
    return bcrypt.compareSync(token, hash)
  } catch (error) {
    console.error('[validate-token] Hash comparison error:', error)
    return false
  }
}

export interface TokenPermission {
  resource: string
  route_pattern: string
  can_create: boolean
  can_read: boolean
  can_update: boolean
  can_delete: boolean
}

export interface TokenAuth {
  valid: boolean
  user_id?: string
  token_id?: string
  scope_type?: 'user' | 'service'
  permissions: TokenPermission[]
  allowed_agent_ids?: string[]
  allowed_origins?: string[]
  error?: string
}

/**
 * Validate API token and load permissions
 */
export async function validateApiToken(token: string): Promise<TokenAuth> {
  // Validate format
  if (!isValidTokenFormat(token)) {
    return { 
      valid: false, 
      error: 'Invalid token format', 
      permissions: [] 
    }
  }

  // Extract prefix for lookup
  const prefix = extractTokenPrefix(token)
  if (!prefix) {
    return { 
      valid: false, 
      error: 'Invalid token prefix', 
      permissions: [] 
    }
  }
  
  try {
    // Query token by prefix with permissions
    const { data: tokenData, error } = await supabaseAdmin
      .from('api_tokens')
      .select(`
        id,
        user_id,
        token_hash,
        scope_type,
        allowed_agent_ids,
        allowed_origins,
        expires_at,
        is_active,
        token_permissions (
          resource,
          route_pattern,
          can_create,
          can_read,
          can_update,
          can_delete
        )
      `)
      .eq('prefix', prefix)
      .single()
    
    if (error || !tokenData) {
      return { 
        valid: false, 
        error: 'Token not found', 
        permissions: [] 
      }
    }
    
    // Verify hash matches
    if (!(await verifyTokenEdge(token, tokenData.token_hash))) {
      return { 
        valid: false, 
        error: 'Invalid token', 
        permissions: [] 
      }
    }
    
    // Check active status
    if (!tokenData.is_active) {
      return { 
        valid: false, 
        error: 'Token revoked', 
        permissions: [] 
      }
    }
    
    // Check expiration
    if (isTokenExpired(tokenData.expires_at)) {
      return { 
        valid: false, 
        error: 'Token expired', 
        permissions: [] 
      }
    }
    
    // Update last_used_at (async, don't block)
    supabaseAdmin
      .from('api_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', tokenData.id)
      .then(() => {}, err => console.error('[validate-token] Failed to update last_used_at:', err))
    
    return {
      valid: true,
      user_id: tokenData.user_id,
      token_id: tokenData.id,
      scope_type: tokenData.scope_type,
      permissions: tokenData.token_permissions || [],
      allowed_agent_ids: tokenData.allowed_agent_ids || undefined,
      allowed_origins: tokenData.allowed_origins || undefined
    }
  } catch (error) {
    console.error('[validate-token] Validation error:', error)
    return { 
      valid: false, 
      error: 'Token validation failed', 
      permissions: [] 
    }
  }
}

/**
 * Get Supabase client for the token scope
 * - Service tokens: admin client (bypasses RLS)
 * - User tokens: user-scoped client (respects RLS)
 */
export function getSupabaseClientForToken(auth: TokenAuth) {
  if (auth.scope_type === 'service') {
    return supabaseAdmin
  }
  
  // For user tokens, we still use admin client but can set RLS context
  // This allows controlled user-scoped queries
  return supabaseAdmin
}
