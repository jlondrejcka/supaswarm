/**
 * Chats API - List task messages (chats)
 * GET /api/chats - List all messages/chats
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
      requiredResource: 'chats',
      requiredAction: 'read'
    })

    if (!verification.isValid) {
      return NextResponse.json(
        { error: verification.error || 'Unauthorized' },
        { status: verification.statusCode || 401 }
      )
    }

    const url = new URL(req.url)
    const task_id = url.searchParams.get('task_id')
    const type = url.searchParams.get('type') // user_message, assistant_message, etc
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 500)
    const offset = parseInt(url.searchParams.get('offset') || '0')

    let query = supabaseAdmin
      .from('task_messages')
      .select(
        `
        id,
        task_id,
        parent_message_id,
        role,
        type,
        content,
        metadata,
        sequence_number,
        created_at,
        model,
        provider,
        token_usage,
        tasks(id, agent_slug, status)
      `
      )
      .order('created_at', { ascending: false })

    if (task_id) {
      query = query.eq('task_id', task_id)
    }

    if (type) {
      query = query.eq('type', type)
    }

    query = query.range(offset, offset + limit - 1)

    const { data: chats, error } = await query

    if (error) throw error

    return NextResponse.json({
      data: chats || [],
      meta: {
        limit,
        offset,
        timestamp: new Date().toISOString()
      }
    })
  } catch (error) {
    console.error('[chats] List error:', error)
    return NextResponse.json(
      { error: 'Failed to list chats' },
      { status: 500 }
    )
  }
}
