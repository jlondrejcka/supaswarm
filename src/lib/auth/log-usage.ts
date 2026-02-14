/**
 * Token Usage Logging
 * Tracks API token usage for analytics and monitoring
 */

import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

export interface UsageLogData {
  token_id: string
  endpoint: string
  method: string
  status_code?: number
  response_time_ms?: number
  tokens_input?: number
  tokens_output?: number
  ip_address?: string
  user_agent?: string
  referer?: string
  origin?: string
}

/**
 * Log token usage (async, non-blocking)
 */
export async function logTokenUsage(
  tokenId: string,
  req: NextRequest,
  responseTime?: number,
  statusCode?: number,
  llmTokens?: { input: number; output: number }
): Promise<void> {
  try {
    const data: UsageLogData = {
      token_id: tokenId,
      endpoint: req.nextUrl.pathname,
      method: req.method,
      status_code: statusCode,
      response_time_ms: responseTime,
      tokens_input: llmTokens?.input || 0,
      tokens_output: llmTokens?.output || 0,
      ip_address: req.ip || req.headers.get('x-forwarded-for') || undefined,
      user_agent: req.headers.get('user-agent') || undefined,
      referer: req.headers.get('referer') || undefined,
      origin: req.headers.get('origin') || undefined
    }

    await supabaseAdmin
      .from('token_usage_logs')
      .insert(data)
  } catch (error) {
    // Log error but don't throw - usage logging shouldn't break requests
    console.error('[log-usage] Failed to log token usage:', error)
  }
}

/**
 * Log token audit event
 */
export async function logTokenAudit(
  tokenId: string | null,
  userId: string | null,
  action: string,
  details?: Record<string, any>,
  ipAddress?: string
): Promise<void> {
  try {
    await supabaseAdmin
      .from('token_audit_log')
      .insert({
        token_id: tokenId,
        user_id: userId,
        action,
        details: details || {},
        ip_address: ipAddress
      })
  } catch (error) {
    console.error('[log-usage] Failed to log audit event:', error)
  }
}
