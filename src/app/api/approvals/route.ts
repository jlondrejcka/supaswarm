/**
 * Approvals API - List approvals
 * GET /api/approvals - List all approvals with optional filtering
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyApiRequest } from '@/lib/auth/verify-api-request'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

export async function GET(req: NextRequest) {
  try {
    // Verify token
    const verification = await verifyApiRequest({
      req,
      requiredResource: 'approvals',
      requiredAction: 'read'
    })

    if (!verification.isValid) {
      return NextResponse.json(
        { error: verification.error || 'Unauthorized' },
        { status: verification.statusCode || 401 }
      )
    }

    // Parse query params
    const url = new URL(req.url)
    const status = url.searchParams.get('status') // pending, approved, rejected
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 500)
    const offset = parseInt(url.searchParams.get('offset') || '0')

    // Build query
    let query = supabaseAdmin
      .from('approval_requests')
      .select(
        `
        id,
        agent_id,
        task_id,
        session_id,
        action_type,
        resource_table,
        resource_id,
        status,
        payload,
        created_at,
        reviewed_by,
        reviewed_at,
        review_notes,
        agents(name, slug),
        tasks(id, status),
        sessions(id, display_name)
      `
      )
      .order('created_at', { ascending: false })

    // Apply filters
    if (status) {
      query = query.eq('status', status)
    }

    // Pagination
    query = query.range(offset, offset + limit - 1)

    const { data: approvals, error } = await query

    if (error) throw error

    return NextResponse.json({
      data: approvals || [],
      meta: {
        limit,
        offset,
        timestamp: new Date().toISOString()
      }
    })
  } catch (error) {
    console.error('[approvals] List error:', error)
    return NextResponse.json(
      { error: 'Failed to list approvals' },
      { status: 500 }
    )
  }
}
