/**
 * Internal Token Verification Endpoint
 * Called by middleware to verify tokens (runs in Node.js runtime with bcrypt support)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { checkRoutePermission, checkCorsOrigin, checkAgentAccess, extractAgentId } from '@/lib/auth/check-permission'
import { logTokenUsage } from '@/lib/auth/log-usage'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

export const runtime = 'nodejs' // Force Node.js runtime for bcrypt

function isValidTokenFormat(token: string): boolean {
  const TOKEN_PREFIX = 'ss_live_'
  if (!token.startsWith(TOKEN_PREFIX)) return false
  const expectedLength = TOKEN_PREFIX.length + 43
  return token.length === expectedLength
}

function extractTokenPrefix(token: string): string | null {
  if (!isValidTokenFormat(token)) return null
  return token.substring(0, 16)
}

export async function POST(req: NextRequest) {
  try {
    const { token, path, method, origin, userIdContext } = await req.json()
    
    // Validate format
    if (!isValidTokenFormat(token)) {
      return NextResponse.json(
        { error: 'Invalid token format' },
        { status: 401 }
      )
    }

    // Extract prefix for lookup
    const prefix = extractTokenPrefix(token)
    if (!prefix) {
      return NextResponse.json(
        { error: 'Invalid token prefix' },
        { status: 401 }
      )
    }
    
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
      return NextResponse.json(
        { error: 'Token not found' },
        { status: 401 }
      )
    }
    
    // Verify hash
    const isValid = bcrypt.compareSync(token, tokenData.token_hash)
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      )
    }
    
    // Check active status
    if (!tokenData.is_active) {
      return NextResponse.json(
        { error: 'Token revoked' },
        { status: 401 }
      )
    }
    
    // Check expiration
    if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'Token expired' },
        { status: 401 }
      )
    }

    // User tokens: Verify token belongs to authenticated user
    if (tokenData.scope_type === 'user') {
      if (!userIdContext) {
        return NextResponse.json(
          { error: 'User tokens require authenticated session' },
          { status: 401 }
        )
      }

      if (userIdContext !== tokenData.user_id) {
        return NextResponse.json(
          { error: 'Token belongs to different user' },
          { status: 403 }
        )
      }
    }
    
    // Check CORS origin restrictions
    if (origin && !checkCorsOrigin(tokenData.allowed_origins, origin)) {
      return NextResponse.json(
        { error: 'Origin not allowed for this token' },
        { status: 403 }
      )
    }
    
    // Check permissions
    const hasPermission = checkRoutePermission(
      tokenData.token_permissions || [],
      path,
      method
    )
    
    if (!hasPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }
    
    // For service tokens with agent restrictions, validate agent_id
    if (tokenData.scope_type === 'service' && 
        tokenData.allowed_agent_ids && 
        tokenData.allowed_agent_ids.length > 0) {
      
      const agentId = extractAgentId(path)
      if (agentId && !checkAgentAccess(tokenData.allowed_agent_ids, agentId)) {
        return NextResponse.json(
          { error: 'Token not authorized for this agent' },
          { status: 403 }
        )
      }
    }
    
    // Update last_used_at (async, don't await)
    void supabaseAdmin
      .from('api_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', tokenData.id)
      .then(() => {}, err => console.error('[verify-token] Failed to update last_used_at:', err))
    
    // Log usage (async, don't await)
    logTokenUsage(
      tokenData.id,
      req,
      undefined,
      200
    ).catch(err => console.error('[verify-token] Log usage error:', err))
    
    // Return auth context
    return NextResponse.json({
      valid: true,
      user_id: tokenData.user_id,
      token_id: tokenData.id,
      scope_type: tokenData.scope_type
    })
  } catch (error) {
    console.error('[verify-token] Verification error:', error)
    return NextResponse.json(
      { error: 'Token validation failed' },
      { status: 500 }
    )
  }
}
