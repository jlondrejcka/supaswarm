/**
 * Session Detail API
 * GET /api/sessions/[id] - Get session details
 * PATCH /api/sessions/[id] - Update session (status, etc)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyApiRequest } from '@/lib/auth/verify-api-request'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const verification = await verifyApiRequest({
      req,
      requiredResource: 'sessions',
      requiredAction: 'read'
    })

    if (!verification.isValid) {
      return NextResponse.json(
        { error: verification.error || 'Unauthorized' },
        { status: verification.statusCode || 401 }
      )
    }

    const { data: session, error } = await supabaseAdmin
      .from('sessions')
      .select(
        `
        id,
        agent_id,
        channel_type,
        channel_id,
        thread_id,
        display_name,
        status,
        sender_id,
        origin,
        delivery_context,
        tokens_input,
        tokens_output,
        idle_timeout_min,
        spawn_depth,
        last_activity_at,
        created_at,
        parent_session_id,
        agents(name, slug, system_prompt),
        tasks(id, status, created_at)
      `
      )
      .eq('id', params.id)
      .single()

    if (error || !session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      data: session
    })
  } catch (error) {
    console.error('[sessions] Get error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch session' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const verification = await verifyApiRequest({
      req,
      requiredResource: 'sessions',
      requiredAction: 'update'
    })

    if (!verification.isValid) {
      return NextResponse.json(
        { error: verification.error || 'Unauthorized' },
        { status: verification.statusCode || 401 }
      )
    }

    const body = await req.json()
    const { status, display_name } = body

    // Build update object
    const updates: Record<string, any> = {}
    if (status) updates.status = status
    if (display_name !== undefined) updates.display_name = display_name

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      )
    }

    const { data: updated, error } = await supabaseAdmin
      .from('sessions')
      .update(updates)
      .eq('id', params.id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      data: updated
    })
  } catch (error) {
    console.error('[sessions] Update error:', error)
    return NextResponse.json(
      { error: 'Failed to update session' },
      { status: 500 }
    )
  }
}
