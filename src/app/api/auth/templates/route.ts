/**
 * Permission Templates
 * GET /api/auth/templates - List available permission templates
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

/**
 * GET /api/auth/templates
 * List permission templates for quick token creation
 */
export async function GET(req: NextRequest) {
  try {
    const { data: templates, error } = await supabaseAdmin
      .from('permission_templates')
      .select('*')
      .order('is_system', { ascending: false })
      .order('name', { ascending: true })

    if (error) throw error

    return NextResponse.json(templates || [])
  } catch (error) {
    console.error('[templates] List error:', error)
    return NextResponse.json(
      { error: 'Failed to list templates' },
      { status: 500 }
    )
  }
}
