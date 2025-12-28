import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './supabase-types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bgqxccmdcpegvbuxmnrf.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export const isSupabaseConfigured = Boolean(supabaseAnonKey)

export const supabase: SupabaseClient<Database> | null = supabaseAnonKey 
  ? createClient<Database>(supabaseUrl, supabaseAnonKey)
  : null
