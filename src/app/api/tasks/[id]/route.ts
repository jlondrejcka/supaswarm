/**
 * Task Detail API
 * GET /api/tasks/[id] - Get task details
 * PATCH /api/tasks/[id] - Update task status
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
      requiredResource: 'tasks',
      requiredAction: 'read'
    })

    if (!verification.isValid) {
      return NextResponse.json(
        { error: verification.error || 'Unauthorized' },
        { status: verification.statusCode || 401 }
      )
    }

    const { data: task, error } = await supabaseAdmin
      .from('tasks')
      .select(
        `
        id,
        agent_id,
        agent_slug,
        status,
        priority,
        context,
        input,
        output,
        intermediate_data,
        tokens_input,
        tokens_output,
        logs,
        storage_paths,
        mission_status,
        created_at,
        updated_at,
        session_id,
        parent_id,
        is_parallel_task,
        dependent_task_ids
      `
      )
      .eq('id', params.id)
      .single()

    if (error || !task) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      data: task
    })
  } catch (error) {
    console.error('[tasks] Get error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch task' },
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
      requiredResource: 'tasks',
      requiredAction: 'update'
    })

    if (!verification.isValid) {
      return NextResponse.json(
        { error: verification.error || 'Unauthorized' },
        { status: verification.statusCode || 401 }
      )
    }

    const body = await req.json()
    const { status, priority, mission_status } = body

    const updates: Record<string, any> = {}
    if (status) updates.status = status
    if (priority) updates.priority = priority
    if (mission_status) updates.mission_status = mission_status

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      )
    }

    const { data: updated, error } = await supabaseAdmin
      .from('tasks')
      .update(updates)
      .eq('id', params.id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      data: updated
    })
  } catch (error) {
    console.error('[tasks] Update error:', error)
    return NextResponse.json(
      { error: 'Failed to update task' },
      { status: 500 }
    )
  }
}
