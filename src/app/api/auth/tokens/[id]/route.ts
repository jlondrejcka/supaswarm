/**
 * API Token Management - Individual Token Operations
 * PATCH /api/auth/tokens/:id - Update token
 * DELETE /api/auth/tokens/:id - Revoke token
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logTokenAudit } from '@/lib/auth/log-usage'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

interface RouteParams {
  params: {
    id: string
  }
}

/**
 * PATCH /api/auth/tokens/:id
 * Update token metadata and permissions
 * Cannot update: scope_type, expires_at (security)
 */
export async function PATCH(
  req: NextRequest,
  { params }: RouteParams
) {
  try {
    const userId = req.headers.get('x-user-id')
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const tokenId = params.id
    const body = await req.json()
    const {
      name,
      is_active,
      allowed_agent_ids,
      allowed_origins,
      permissions
    } = body

    // Verify token ownership
    const { data: token, error: fetchError } = await supabaseAdmin
      .from('api_tokens')
      .select('user_id')
      .eq('id', tokenId)
      .single()

    if (fetchError || !token) {
      return NextResponse.json(
        { error: 'Token not found' },
        { status: 404 }
      )
    }

    if (token.user_id !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // Update token
    const updates: any = {}
    if (name !== undefined) updates.name = name
    if (is_active !== undefined) updates.is_active = is_active
    if (allowed_agent_ids !== undefined) updates.allowed_agent_ids = allowed_agent_ids
    if (allowed_origins !== undefined) updates.allowed_origins = allowed_origins

    const { error: updateError } = await supabaseAdmin
      .from('api_tokens')
      .update(updates)
      .eq('id', tokenId)

    if (updateError) throw updateError

    // Update permissions if provided
    if (permissions && Array.isArray(permissions)) {
      // Delete existing permissions
      await supabaseAdmin
        .from('token_permissions')
        .delete()
        .eq('token_id', tokenId)

      // Insert new permissions
      const permissionsToInsert = permissions.map((p: any) => ({
        token_id: tokenId,
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
    }

    // Log audit event
    await logTokenAudit(
      tokenId,
      userId,
      'updated',
      { updates, permissions_updated: !!permissions },
      req.ip || req.headers.get('x-forwarded-for') || undefined
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[tokens/:id] Update error:', error)
    return NextResponse.json(
      { error: 'Failed to update token' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/auth/tokens/:id
 * Revoke (delete) a token
 */
export async function DELETE(
  req: NextRequest,
  { params }: RouteParams
) {
  try {
    const userId = req.headers.get('x-user-id')
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const tokenId = params.id

    // Verify token ownership
    const { data: token, error: fetchError } = await supabaseAdmin
      .from('api_tokens')
      .select('user_id, name')
      .eq('id', tokenId)
      .single()

    if (fetchError || !token) {
      return NextResponse.json(
        { error: 'Token not found' },
        { status: 404 }
      )
    }

    if (token.user_id !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // Delete token (cascade will delete permissions and logs)
    const { error: deleteError } = await supabaseAdmin
      .from('api_tokens')
      .delete()
      .eq('id', tokenId)

    if (deleteError) throw deleteError

    // Log audit event
    await logTokenAudit(
      null, // Token deleted
      userId,
      'revoked',
      { token_name: token.name },
      req.ip || req.headers.get('x-forwarded-for') || undefined
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[tokens/:id] Delete error:', error)
    return NextResponse.json(
      { error: 'Failed to delete token' },
      { status: 500 }
    )
  }
}
