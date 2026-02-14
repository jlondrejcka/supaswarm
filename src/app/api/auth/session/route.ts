/**
 * Auth Session Endpoint
 * GET /api/auth/session - Get current user session
 * POST /api/auth/session - Refresh session
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ""

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization")
    const token = authHeader?.replace("Bearer ", "")

    if (!token) {
      return NextResponse.json(
        { user: null },
        { status: 200 }
      )
    }

    // Get user from token
    const { data: { user }, error } = await supabaseAdmin.auth.admin.getUserById(token)

    if (error || !user) {
      return NextResponse.json(
        { user: null },
        { status: 200 }
      )
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        user_metadata: user.user_metadata,
      },
    })
  } catch (error) {
    console.error("[session] error:", error)
    return NextResponse.json(
      { user: null },
      { status: 200 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const { refresh_token } = await req.json()

    if (!refresh_token) {
      return NextResponse.json(
        { error: "Refresh token required" },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseAdmin.auth.refreshSession({
      refresh_token,
    })

    if (error || !data.session) {
      return NextResponse.json(
        { error: "Failed to refresh session" },
        { status: 401 }
      )
    }

    return NextResponse.json({
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_in: data.session.expires_in,
      },
    })
  } catch (error) {
    console.error("[session-refresh] error:", error)
    return NextResponse.json(
      { error: "Session refresh failed" },
      { status: 500 }
    )
  }
}
