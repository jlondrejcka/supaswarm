/**
 * Auth Password Reset Endpoint
 * POST /api/auth/forgot-password - Send password reset email
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""

const supabase = createClient(SUPABASE_URL, ANON_KEY)

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      )
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/auth/reset-password`,
    })

    if (error) {
      console.error("Password reset error:", error)
      return NextResponse.json(
        { error: "Failed to send reset email" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "Password reset email sent. Check your inbox.",
    })
  } catch (error) {
    console.error("[forgot-password] error:", error)
    return NextResponse.json(
      { error: "Password reset failed" },
      { status: 500 }
    )
  }
}
