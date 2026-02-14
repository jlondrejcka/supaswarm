/**
 * Channels API
 * GET /api/channels - List channels
 * POST /api/channels - Create new channel
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyApiRequest } from '@/lib/auth/verify-api-request'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

export async function GET(req: NextRequest) {
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

    const url = new URL(req.url)
    const channel_type = url.searchParams.get('type')
    const status = url.searchParams.get('status')
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 500)
    const offset = parseInt(url.searchParams.get('offset') || '0')

    let query = supabaseAdmin
      .from('channel_connections')
      .select(
        `
        id,
        channel_type,
        channel_id,
        display_name,
        status,
        config,
        message_count,
        last_event_at,
        error_message,
        created_at,
        updated_at
      `
      )
      .order('created_at', { ascending: false })

    if (channel_type) {
      query = query.eq('channel_type', channel_type)
    }

    if (status) {
      query = query.eq('status', status)
    }

    query = query.range(offset, offset + limit - 1)

    const { data: channels, error } = await query

    if (error) throw error

    return NextResponse.json({
      data: channels || [],
      meta: {
        limit,
        offset,
        timestamp: new Date().toISOString()
      }
    })
  } catch (error) {
    console.error('[channels] List error:', error)
    return NextResponse.json(
      { error: 'Failed to list channels' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const verification = await verifyApiRequest({
      req,
      requiredResource: 'channels',
      requiredAction: 'create'
    })

    if (!verification.isValid) {
      return NextResponse.json(
        { error: verification.error || 'Unauthorized' },
        { status: verification.statusCode || 401 }
      )
    }

    const body = await req.json()
    const { channel_type, channel_id, display_name, config } = body

    if (!channel_type || !channel_id) {
      return NextResponse.json(
        { error: 'channel_type and channel_id are required' },
        { status: 400 }
      )
    }

    const { data: created, error } = await supabaseAdmin
      .from('channel_connections')
      .insert({
        channel_type,
        channel_id,
        display_name: display_name || `${channel_type}:${channel_id}`,
        config: config || {},
        status: 'active'
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(
      {
        data: created,
        meta: {
          action: 'created',
          timestamp: new Date().toISOString()
        }
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[channels] Create error:', error)
    return NextResponse.json(
      { error: 'Failed to create channel' },
      { status: 500 }
    )
  }
}
