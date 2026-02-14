/**
 * Sessions API
 * GET /api/sessions - List sessions
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
      requiredResource: 'sessions',
      requiredAction: 'read'
    })

    if (!verification.isValid) {
      return NextResponse.json(
        { error: verification.error || 'Unauthorized' },
        { status: verification.statusCode || 401 }
      )
    }

    const url = new URL(req.url)
    const status = url.searchParams.get('status')
    const agent_id = url.searchParams.get('agent_id')
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 500)
    const offset = parseInt(url.searchParams.get('offset') || '0')

    let query = supabaseAdmin
      .from('sessions')
      .select(
        `
        id,
        agent_id,
        channel_type,
        channel_id,
        display_name,
        status,
        sender_id,
        tokens_input,
        tokens_output,
        last_activity_at,
        created_at,
        agents(name, slug)
      `
      )
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    if (agent_id) {
      query = query.eq('agent_id', agent_id)
    }

    query = query.range(offset, offset + limit - 1)

    const { data: sessions, error } = await query

    if (error) throw error

    return NextResponse.json({
      data: sessions || [],
      meta: {
        limit,
        offset,
        timestamp: new Date().toISOString()
      }
    })
  } catch (error) {
    console.error('[sessions] List error:', error)
    return NextResponse.json(
      { error: 'Failed to list sessions' },
      { status: 500 }
    )
  }
}
