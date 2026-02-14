/**
 * Auth Logout Endpoint
 * POST /api/auth/logout - Sign out the current user
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ""

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

export async function POST(req: NextRequest) {
  try {
    // Get the session token from Authorization header
    const authHeader = req.headers.get("authorization")
    const token = authHeader?.replace("Bearer ", "")

    if (!token) {
      return NextResponse.json(
        { error: "No session token provided" },
        { status: 401 }
      )
    }

    // Sign out the user by invalidating the session
    const { error } = await supabaseAdmin.auth.admin.signOut(token)

    if (error) {
      console.error("Logout error:", error)
      return NextResponse.json(
        { error: "Failed to logout" },
        { status: 500 }
      )
    }

    // Clear auth cookie if using cookies
    const response = NextResponse.json({ success: true })
    response.cookies.delete("sb-auth-token")
    
    return response
  } catch (error) {
    console.error("[logout] error:", error)
    return NextResponse.json(
      { error: "Logout failed" },
      { status: 500 }
    )
  }
}
