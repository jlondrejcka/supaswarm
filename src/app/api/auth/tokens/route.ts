/**
 * API Token Management - List & Create
 * GET /api/auth/tokens - List user's tokens
 * POST /api/auth/tokens - Create new token
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateApiToken, calculateExpirationDate } from '@/lib/auth/token-generator'
import { logTokenAudit } from '@/lib/auth/log-usage'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

/**
 * GET /api/auth/tokens
 * List user's API tokens (without sensitive data)
 */
export async function GET(req: NextRequest) {
  try {
    // Get user from session (Supabase auth)
    // For now, we'll use a header or require authentication
    const userId = req.headers.get('x-user-id')
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const { data: tokens, error } = await supabaseAdmin
      .from('api_tokens')
      .select(`
        id,
        name,
        prefix,
        scope_type,
        allowed_agent_ids,
        allowed_origins,
        last_used_at,
        expires_at,
        is_active,
        created_at,
        token_permissions (
          resource,
          route_pattern,
          can_create,
          can_read,
          can_update,
          can_delete
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw error

    // Transform data for UI
    const tokenList = tokens?.map(token => ({
      id: token.id,
      name: token.name,
      prefix: token.prefix,
      scope_type: token.scope_type,
      last_used_at: token.last_used_at,
      expires_at: token.expires_at,
      is_active: token.is_active,
      created_at: token.created_at,
      permissions_count: token.token_permissions?.length || 0,
      has_agent_restrictions: token.allowed_agent_ids?.length > 0,
      has_cors_restrictions: token.allowed_origins?.length > 0
    }))

    return NextResponse.json(tokenList || [])
  } catch (error) {
    console.error('[tokens] List error:', error)
    return NextResponse.json(
      { error: 'Failed to list tokens' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/auth/tokens
 * Create a new API token
 */
export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id')
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const body = await req.json()
    const {
      name,
      scope_type = 'service',
      duration = '365',
      allowed_agent_ids,
      allowed_origins,
      permissions
    } = body

    // Validate required fields
    if (!name || !permissions || permissions.length === 0) {
      return NextResponse.json(
        { error: 'name and permissions are required' },
        { status: 400 }
      )
    }

    // Check for duplicate name
    const { data: existing } = await supabaseAdmin
      .from('api_tokens')
      .select('id')
      .eq('user_id', userId)
      .eq('name', name)
      .single()

    if (existing) {
      return NextResponse.json(
        { error: 'Token name already exists' },
        { status: 400 }
      )
    }

    // Generate token
    const { token, hash, prefix } = generateApiToken()
    const expiresAt = calculateExpirationDate(duration)

    // Insert token
    const { data: tokenData, error: tokenError } = await supabaseAdmin
      .from('api_tokens')
      .insert({
        user_id: userId,
        name,
        token_hash: hash,
        prefix,
        scope_type,
        allowed_agent_ids: allowed_agent_ids || null,
        allowed_origins: allowed_origins || null,
        expires_at: expiresAt?.toISOString() || null,
        is_active: true
      })
      .select('id')
      .single()

    if (tokenError) throw tokenError

    // Insert permissions
    const permissionsToInsert = permissions.map((p: any) => ({
      token_id: tokenData.id,
      resource: p.resource,
      route_pattern: p.route_pattern,
      can_create: p.can_create || false,
      can_read: p.can_read || false,
      can_update: p.can_update || false,
      can_delete: p.can_delete || false
    }))

    const { error: permsError } = await supabaseAdmin
      .from('token_permissions')
      .insert(permissionsToInsert)

    if (permsError) throw permsError

    // Log audit event
    await logTokenAudit(
      tokenData.id,
      userId,
      'created',
      { name, scope_type, permissions_count: permissions.length },
      req.ip || req.headers.get('x-forwarded-for') || undefined
    )

    // Return token ONCE (never retrievable again)
    return NextResponse.json({
      token, // Full token - user must copy now
      token_id: tokenData.id,
      prefix,
      expires_at: expiresAt?.toISOString() || null,
      message: 'Token created successfully. Copy it now - you will not see it again.'
    })
  } catch (error) {
    console.error('[tokens] Create error:', error)
    return NextResponse.json(
      { error: 'Failed to create token' },
      { status: 500 }
    )
  }
}
