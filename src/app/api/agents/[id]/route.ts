/**
 * Agent Detail API
 * GET /api/agents/[id] - Get agent details
 * PATCH /api/agents/[id] - Update agent settings
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
      requiredResource: 'agents',
      requiredAction: 'read'
    })

    if (!verification.isValid) {
      return NextResponse.json(
        { error: verification.error || 'Unauthorized' },
        { status: verification.statusCode || 401 }
      )
    }

    const { data: agent, error } = await supabaseAdmin
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
        system_prompt,
        memory_mode,
        is_active,
        is_default,
        status,
        last_heartbeat,
        created_at,
        updated_at,
        agent_skills(skill_id, skills(name, description, id)),
        agent_tools(tool_id, tools(name, description, id, type))
      `
      )
      .eq('id', params.id)
      .single()

    if (error || !agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      data: agent
    })
  } catch (error) {
    console.error('[agents] Get error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch agent' },
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
      requiredResource: 'agents',
      requiredAction: 'update'
    })

    if (!verification.isValid) {
      return NextResponse.json(
        { error: verification.error || 'Unauthorized' },
        { status: verification.statusCode || 401 }
      )
    }

    const body = await req.json()
    const {
      name,
      description,
      temperature,
      max_tokens,
      daily_token_budget,
      is_active,
      memory_mode,
      system_prompt
    } = body

    const updates: Record<string, any> = {}
    if (name !== undefined) updates.name = name
    if (description !== undefined) updates.description = description
    if (temperature !== undefined) updates.temperature = temperature
    if (max_tokens !== undefined) updates.max_tokens = max_tokens
    if (daily_token_budget !== undefined) updates.daily_token_budget = daily_token_budget
    if (is_active !== undefined) updates.is_active = is_active
    if (memory_mode !== undefined) updates.memory_mode = memory_mode
    if (system_prompt !== undefined) updates.system_prompt = system_prompt

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      )
    }

    updates.updated_at = new Date().toISOString()

    const { data: updated, error } = await supabaseAdmin
      .from('agents')
      .update(updates)
      .eq('id', params.id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      data: updated
    })
  } catch (error) {
    console.error('[agents] Update error:', error)
    return NextResponse.json(
      { error: 'Failed to update agent' },
      { status: 500 }
    )
  }
}
