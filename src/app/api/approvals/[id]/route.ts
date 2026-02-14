/**
 * Approvals Detail API
 * GET /api/approvals/[id] - Get approval details
 * POST /api/approvals/[id]/review - Approve or reject
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
      requiredResource: 'approvals',
      requiredAction: 'read'
    })

    if (!verification.isValid) {
      return NextResponse.json(
        { error: verification.error || 'Unauthorized' },
        { status: verification.statusCode || 401 }
      )
    }

    const { data: approval, error } = await supabaseAdmin
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
        payload,
        status,
        created_at,
        reviewed_by,
        reviewed_at,
        review_notes,
        agents(name, slug, system_prompt),
        tasks(id, status, agent_slug),
        sessions(id, display_name, status)
      `
      )
      .eq('id', params.id)
      .single()

    if (error || !approval) {
      return NextResponse.json(
        { error: 'Approval not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      data: approval
    })
  } catch (error) {
    console.error('[approvals] Get error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch approval' },
      { status: 500 }
    )
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; action?: string } }
) {
  try {
    const verification = await verifyApiRequest({
      req,
      requiredResource: 'approvals',
      requiredAction: 'update'
    })

    if (!verification.isValid) {
      return NextResponse.json(
        { error: verification.error || 'Unauthorized' },
        { status: verification.statusCode || 401 }
      )
    }

    const body = await req.json()
    const { approved, review_notes } = body

    // Validate
    if (typeof approved !== 'boolean') {
      return NextResponse.json(
        { error: 'approved field is required and must be boolean' },
        { status: 400 }
      )
    }

    // Update approval
    const { data: updated, error } = await supabaseAdmin
      .from('approval_requests')
      .update({
        status: approved ? 'approved' : 'rejected',
        reviewed_by: verification.auth?.user_id || 'api',
        reviewed_at: new Date().toISOString(),
        review_notes: review_notes || null
      })
      .eq('id', params.id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      data: updated,
      meta: {
        action: approved ? 'approved' : 'rejected',
        reviewed_at: new Date().toISOString()
      }
    })
  } catch (error) {
    console.error('[approvals] Review error:', error)
    return NextResponse.json(
      { error: 'Failed to review approval' },
      { status: 500 }
    )
  }
}
