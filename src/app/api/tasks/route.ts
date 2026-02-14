/**
 * Tasks API
 * GET /api/tasks - List tasks
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
      requiredResource: 'tasks',
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
    const session_id = url.searchParams.get('session_id')
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 500)
    const offset = parseInt(url.searchParams.get('offset') || '0')

    let query = supabaseAdmin
      .from('tasks')
      .select(
        `
        id,
        agent_id,
        agent_slug,
        status,
        priority,
        tokens_input,
        tokens_output,
        mission_status,
        created_at,
        updated_at,
        session_id,
        parent_id
      `
      )
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    if (agent_id) {
      query = query.eq('agent_id', agent_id)
    }

    if (session_id) {
      query = query.eq('session_id', session_id)
    }

    query = query.range(offset, offset + limit - 1)

    const { data: tasks, error } = await query

    if (error) throw error

    return NextResponse.json({
      data: tasks || [],
      meta: {
        limit,
        offset,
        timestamp: new Date().toISOString()
      }
    })
  } catch (error) {
    console.error('[tasks] List error:', error)
    return NextResponse.json(
      { error: 'Failed to list tasks' },
      { status: 500 }
    )
  }
}
