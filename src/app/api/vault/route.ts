import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ""

function getServiceClient() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
}

// GET /api/vault — list secrets
export async function GET() {
  try {
    const supabase = getServiceClient()
    if (!supabase) {
      return NextResponse.json({ error: "Service role key not configured" }, { status: 500 })
    }

    const { data, error } = await supabase.rpc("list_vault_secrets")
    if (error) throw error

    return NextResponse.json(data || [])
  } catch (error) {
    console.error("[vault] list error:", error)
    return NextResponse.json({ error: "Failed to list secrets" }, { status: 500 })
  }
}

// POST /api/vault — upsert secret
export async function POST(req: NextRequest) {
  try {
    const supabase = getServiceClient()
    if (!supabase) {
      return NextResponse.json({ error: "Service role key not configured" }, { status: 500 })
    }

    const { secret_name, secret_value } = await req.json()
    if (!secret_name || !secret_value) {
      return NextResponse.json({ error: "secret_name and secret_value required" }, { status: 400 })
    }

    const { error } = await supabase.rpc("upsert_vault_secret", {
      secret_name,
      secret_value,
    })
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[vault] upsert error:", error)
    return NextResponse.json({ error: "Failed to save secret" }, { status: 500 })
  }
}

// DELETE /api/vault — delete secret
export async function DELETE(req: NextRequest) {
  try {
    const supabase = getServiceClient()
    if (!supabase) {
      return NextResponse.json({ error: "Service role key not configured" }, { status: 500 })
    }

    const { secret_name } = await req.json()
    if (!secret_name) {
      return NextResponse.json({ error: "secret_name required" }, { status: 400 })
    }

    const { error } = await supabase.rpc("delete_vault_secret", { secret_name })
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[vault] delete error:", error)
    return NextResponse.json({ error: "Failed to delete secret" }, { status: 500 })
  }
}
