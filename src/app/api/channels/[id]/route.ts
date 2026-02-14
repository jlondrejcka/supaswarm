/**
 * Channel Detail API
 * GET /api/channels/[id] - Get channel details
 * PATCH /api/channels/[id] - Update channel
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
      requiredResource: 'channels',
      requiredAction: 'read'
    })

    if (!verification.isValid) {
      return NextResponse.json(
        { error: verification.error || 'Unauthorized' },
        { status: verification.statusCode || 401 }
      )
    }

    const { data: channel, error } = await supabaseAdmin
      .from('channel_connections')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error || !channel) {
      return NextResponse.json(
        { error: 'Channel not found' },
        { status: 404 }
      )
    }

    // Get recent events for this channel
    const { data: events } = await supabaseAdmin
      .from('channel_events')
      .select('*')
      .eq('channel_id', channel.channel_id)
      .order('created_at', { ascending: false })
      .limit(10)

    return NextResponse.json({
      data: channel,
      events: events || []
    })
  } catch (error) {
    console.error('[channels] Get error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch channel' },
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
      requiredResource: 'channels',
      requiredAction: 'update'
    })

    if (!verification.isValid) {
      return NextResponse.json(
        { error: verification.error || 'Unauthorized' },
        { status: verification.statusCode || 401 }
      )
    }

    const body = await req.json()
    const { status, display_name, config, error_message } = body

    const updates: Record<string, any> = {}
    if (status) updates.status = status
    if (display_name !== undefined) updates.display_name = display_name
    if (config !== undefined) updates.config = config
    if (error_message !== undefined) updates.error_message = error_message

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      )
    }

    updates.updated_at = new Date().toISOString()

    const { data: updated, error } = await supabaseAdmin
      .from('channel_connections')
      .update(updates)
      .eq('id', params.id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      data: updated
    })
  } catch (error) {
    console.error('[channels] Update error:', error)
    return NextResponse.json(
      { error: 'Failed to update channel' },
      { status: 500 }
    )
  }
}
