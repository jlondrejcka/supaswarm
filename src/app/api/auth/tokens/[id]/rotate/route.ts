/**
 * API Token Rotation
 * POST /api/auth/tokens/:id/rotate - Generate new token hash, keep permissions
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateApiToken } from '@/lib/auth/token-generator'
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
 * POST /api/auth/tokens/:id/rotate
 * Regenerate token secret, keep all settings and permissions
 */
export async function POST(
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

    // Generate new token
    const { token: newToken, hash: newHash, prefix: newPrefix } = generateApiToken()

    // Update token hash and prefix
    const { error: updateError } = await supabaseAdmin
      .from('api_tokens')
      .update({
        token_hash: newHash,
        prefix: newPrefix
      })
      .eq('id', tokenId)

    if (updateError) throw updateError

    // Log audit event
    await logTokenAudit(
      tokenId,
      userId,
      'regenerated',
      { token_name: token.name },
      req.ip || req.headers.get('x-forwarded-for') || undefined
    )

    // Return new token ONCE
    return NextResponse.json({
      token: newToken,
      prefix: newPrefix,
      message: 'Token regenerated successfully. Copy it now - you will not see it again.'
    })
  } catch (error) {
    console.error('[tokens/:id/rotate] Rotate error:', error)
    return NextResponse.json(
      { error: 'Failed to rotate token' },
      { status: 500 }
    )
  }
}
