/**
 * Dashboard API - GET /api/dashboard/stats
 * Aggregate endpoint for all dashboard metrics
 * Validates API token before returning stats
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyApiRequest } from '@/lib/auth/verify-api-request'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

interface DashboardStats {
  tasks: {
    total: number
    running: number
    completed: number
    failed: number
    pending: number
  }
  agents: {
    total: number
    active: number
    inactive: number
  }
  approvals: {
    total: number
    pending: number
    approved: number
    rejected: number
  }
  sessions: {
    total: number
    active: number
    idle: number
  }
  chats: {
    total_messages: number
    active_conversations: number
  }
  tools: {
    total: number
    active: number
  }
  skills: {
    total: number
    active: number
  }
  channels: {
    total: number
    active: number
  }
}

export async function GET(req: NextRequest) {
  try {
    // Verify API token
    const verification = await verifyApiRequest({
      req,
      requiredResource: 'dashboard',
      requiredAction: 'read'
    })

    if (!verification.isValid) {
      return NextResponse.json(
        { error: verification.error || 'Unauthorized' },
        { status: verification.statusCode || 401 }
      )
    }

    // Fetch all dashboard data in parallel
    const [
      { data: tasks },
      { data: agents },
      { data: approvals },
      { data: sessions },
      { data: taskMessages },
      { data: tools },
      { data: skills },
      { data: channels }
    ] = await Promise.all([
      supabaseAdmin.from('tasks').select('status'),
      supabaseAdmin.from('agents').select('is_active'),
      supabaseAdmin.from('approval_requests').select('status'),
      supabaseAdmin.from('sessions').select('status'),
      supabaseAdmin
        .from('task_messages')
        .select('id')
        .eq('type', 'user_message'),
      supabaseAdmin.from('tools').select('is_active'),
      supabaseAdmin.from('skills').select('is_active'),
      supabaseAdmin.from('channel_connections').select('status')
    ])

    // Aggregate stats
    const stats: DashboardStats = {
      tasks: {
        total: tasks?.length || 0,
        running: tasks?.filter(t => t.status === 'running').length || 0,
        completed: tasks?.filter(t => t.status === 'completed').length || 0,
        failed: tasks?.filter(t => t.status === 'failed').length || 0,
        pending: tasks?.filter(t => t.status === 'pending').length || 0
      },
      agents: {
        total: agents?.length || 0,
        active: agents?.filter(a => a.is_active).length || 0,
        inactive: agents?.filter(a => !a.is_active).length || 0
      },
      approvals: {
        total: approvals?.length || 0,
        pending: approvals?.filter(a => a.status === 'pending').length || 0,
        approved: approvals?.filter(a => a.status === 'approved').length || 0,
        rejected: approvals?.filter(a => a.status === 'rejected').length || 0
      },
      sessions: {
        total: sessions?.length || 0,
        active: sessions?.filter(s => s.status === 'active').length || 0,
        idle: sessions?.filter(s => s.status === 'idle').length || 0
      },
      chats: {
        total_messages: taskMessages?.length || 0,
        active_conversations: sessions?.filter(s => s.status === 'active').length || 0
      },
      tools: {
        total: tools?.length || 0,
        active: tools?.filter(t => t.is_active).length || 0
      },
      skills: {
        total: skills?.length || 0,
        active: skills?.filter(s => s.is_active).length || 0
      },
      channels: {
        total: channels?.length || 0,
        active: channels?.filter(c => c.status === 'active').length || 0
      }
    }

    return NextResponse.json({
      data: stats,
      meta: {
        timestamp: new Date().toISOString(),
        token_id: verification.auth?.token_id
      }
    })
  } catch (error) {
    console.error('[dashboard] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch dashboard stats' },
      { status: 500 }
    )
  }
}
