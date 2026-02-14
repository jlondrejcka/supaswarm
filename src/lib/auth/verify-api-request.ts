/**
 * API Request Verification Helper
 * Reusable middleware for validating API tokens + permissions
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

interface TokenAuthContext {
  valid: boolean
  user_id: string
  token_id: string
  scope_type: 'service' | 'user'
  permissions?: Array<{
    resource: string
    route_pattern: string
    can_create: boolean
    can_read: boolean
    can_update: boolean
    can_delete: boolean
  }>
}

interface VerifyApiRequestOptions {
  req: NextRequest
  requiredResource?: string
  requiredAction?: 'create' | 'read' | 'update' | 'delete'
}

/**
 * Verify API request - extract token from Authorization header
 * and validate against stored permissions
 */
export async function verifyApiRequest(
  opts: VerifyApiRequestOptions
): Promise<{
  isValid: boolean
  error?: string
  statusCode?: number
  auth?: TokenAuthContext
}> {
  try {
    const { req, requiredResource, requiredAction } = opts

    // Extract token from Authorization header
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return {
        isValid: false,
        error: 'Missing or invalid Authorization header',
        statusCode: 401
      }
    }

    const token = authHeader.slice(7) // Remove 'Bearer '

    // Validate token format
    if (!isValidTokenFormat(token)) {
      return {
        isValid: false,
        error: 'Invalid token format',
        statusCode: 401
      }
    }

    // Extract prefix for database lookup
    const prefix = extractTokenPrefix(token)
    if (!prefix) {
      return {
        isValid: false,
        error: 'Invalid token prefix',
        statusCode: 401
      }
    }

    // Query token with permissions
    const { data: tokenData, error: tokenError } = await supabaseAdmin
      .from('api_tokens')
      .select(
        `
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
      `
      )
      .eq('prefix', prefix)
      .single()

    if (tokenError || !tokenData) {
      return {
        isValid: false,
        error: 'Token not found',
        statusCode: 401
      }
    }

    // Verify hash
    const isValidHash = bcrypt.compareSync(token, tokenData.token_hash)
    if (!isValidHash) {
      return {
        isValid: false,
        error: 'Invalid token',
        statusCode: 401
      }
    }

    // Check active status
    if (!tokenData.is_active) {
      return {
        isValid: false,
        error: 'Token revoked',
        statusCode: 401
      }
    }

    // Check expiration
    if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
      return {
        isValid: false,
        error: 'Token expired',
        statusCode: 401
      }
    }

    // Check permissions if specified
    if (requiredResource && requiredAction && tokenData.token_permissions) {
      const hasPermission = tokenData.token_permissions.some((perm: any) => {
        const resourceMatch =
          perm.resource === '*' ||
          perm.resource === requiredResource ||
          (perm.resource.endsWith('*') &&
            requiredResource.startsWith(perm.resource.slice(0, -1)))

        const actionMap: Record<string, string> = {
          create: 'can_create',
          read: 'can_read',
          update: 'can_update',
          delete: 'can_delete'
        }

        return resourceMatch && perm[actionMap[requiredAction]]
      })

      if (!hasPermission) {
        return {
          isValid: false,
          error: 'Insufficient permissions',
          statusCode: 403
        }
      }
    }

    // Log usage (async, don't await)
    void supabaseAdmin
      .from('api_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', tokenData.id)
      .then(() => {}, err => console.error('[verifyApiRequest] Failed to update last_used_at:', err))

    return {
      isValid: true,
      auth: {
        valid: true,
        user_id: tokenData.user_id,
        token_id: tokenData.id,
        scope_type: tokenData.scope_type,
        permissions: tokenData.token_permissions || []
      }
    }
  } catch (error) {
    console.error('[verifyApiRequest] Error:', error)
    return {
      isValid: false,
      error: 'Token verification failed',
      statusCode: 500
    }
  }
}

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

/**
 * Wrapper for API route handlers - enforces token validation
 */
export function withTokenAuth(
  handler: (
    req: NextRequest,
    opts: { params?: Record<string, string>; auth: TokenAuthContext }
  ) => Promise<NextResponse>
) {
  return async (
    req: NextRequest,
    opts?: { params?: Record<string, string> }
  ): Promise<NextResponse> => {
    const verification = await verifyApiRequest({ req })

    if (!verification.isValid) {
      return NextResponse.json(
        { error: verification.error || 'Unauthorized' },
        { status: verification.statusCode || 401 }
      )
    }

    return handler(req, {
      params: opts?.params,
      auth: verification.auth!
    })
  }
}
