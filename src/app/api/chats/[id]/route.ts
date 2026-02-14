/**
 * Chat Detail API
 * GET /api/chats/[id] - Get chat message thread
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
      requiredResource: 'chats',
      requiredAction: 'read'
    })

    if (!verification.isValid) {
      return NextResponse.json(
        { error: verification.error || 'Unauthorized' },
        { status: verification.statusCode || 401 }
      )
    }

    // Fetch message + related task
    const { data: message, error: msgError } = await supabaseAdmin
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
        channel_context,
        model,
        provider,
        token_usage,
        tasks(id, agent_slug, status, agent_id, created_at)
      `
      )
      .eq('id', params.id)
      .single()

    if (msgError || !message) {
      return NextResponse.json(
        { error: 'Message not found' },
        { status: 404 }
      )
    }

    // If parent exists, fetch thread chain
    let thread: any[] = [message]
    let currentMsg = message

    if (currentMsg.parent_message_id) {
      let parentId = currentMsg.parent_message_id
      const visited = new Set<string>()

      while (parentId && !visited.has(parentId)) {
        visited.add(parentId)
        const { data: parent } = await supabaseAdmin
          .from('task_messages')
          .select('*')
          .eq('id', parentId)
          .single()

        if (parent) {
          thread.unshift(parent)
          parentId = parent.parent_message_id
        } else {
          break
        }
      }
    }

    return NextResponse.json({
      data: {
        message,
        thread,
        thread_length: thread.length
      }
    })
  } catch (error) {
    console.error('[chats] Get error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch chat' },
      { status: 500 }
    )
  }
}
