/**
 * Agents API
 * GET /api/agents - List agents
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
      requiredResource: 'agents',
      requiredAction: 'read'
    })

    if (!verification.isValid) {
      return NextResponse.json(
        { error: verification.error || 'Unauthorized' },
        { status: verification.statusCode || 401 }
      )
    }

    const url = new URL(req.url)
    const role = url.searchParams.get('role')
    const is_active = url.searchParams.get('is_active')
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 500)
    const offset = parseInt(url.searchParams.get('offset') || '0')

    let query = supabaseAdmin
      .from('agents')
      .select(
        `
        id,
        name,
        slug,
        description,
        role,
        model,
        temperature,
        max_tokens,
        daily_token_budget,
        is_active,
        is_default,
        status,
        last_heartbeat,
        created_at,
        updated_at,
        agent_skills(skill_id),
        agent_tools(tool_id)
      `
      )
      .order('created_at', { ascending: false })

    if (role) {
      query = query.eq('role', role)
    }

    if (is_active !== null) {
      query = query.eq('is_active', is_active === 'true')
    }

    query = query.range(offset, offset + limit - 1)

    const { data: agents, error } = await query

    if (error) throw error

    return NextResponse.json({
      data: agents || [],
      meta: {
        limit,
        offset,
        timestamp: new Date().toISOString()
      }
    })
  } catch (error) {
    console.error('[agents] List error:', error)
    return NextResponse.json(
      { error: 'Failed to list agents' },
      { status: 500 }
    )
  }
}
