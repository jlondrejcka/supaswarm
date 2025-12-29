export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      agent_skills: {
        Row: {
          agent_id: string
          priority: number | null
          skill_id: string
        }
        Insert: {
          agent_id: string
          priority?: number | null
          skill_id: string
        }
        Update: {
          agent_id?: string
          priority?: number | null
          skill_id?: string
        }
      }
      agent_tools: {
        Row: {
          agent_id: string
          tool_id: string
        }
        Insert: {
          agent_id: string
          tool_id: string
        }
        Update: {
          agent_id?: string
          tool_id?: string
        }
      }
      agents: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          max_tokens: number | null
          model: string | null
          name: string
          provider_id: string | null
          slug: string
          system_prompt: string
          temperature: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          max_tokens?: number | null
          model?: string | null
          name: string
          provider_id?: string | null
          slug: string
          system_prompt: string
          temperature?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          max_tokens?: number | null
          model?: string | null
          name?: string
          provider_id?: string | null
          slug?: string
          system_prompt?: string
          temperature?: number | null
          updated_at?: string | null
        }
      }
      human_reviews: {
        Row: {
          approved: boolean | null
          comments: string | null
          created_at: string | null
          created_by: string | null
          id: string
          response: Json
          task_id: string | null
        }
        Insert: {
          approved?: boolean | null
          comments?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          response?: Json
          task_id?: string | null
        }
        Update: {
          approved?: boolean | null
          comments?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          response?: Json
          task_id?: string | null
        }
      }
      llm_providers: {
        Row: {
          base_url: string | null
          default_model: string
          display_name: string
          id: string
          is_active: boolean | null
          name: string
          requires_api_key: boolean | null
          has_api_key: boolean | null
        }
        Insert: {
          base_url?: string | null
          default_model: string
          display_name: string
          id?: string
          is_active?: boolean | null
          name: string
          requires_api_key?: boolean | null
          has_api_key?: boolean | null
        }
        Update: {
          base_url?: string | null
          default_model?: string
          display_name?: string
          id?: string
          is_active?: boolean | null
          name?: string
          requires_api_key?: boolean | null
          has_api_key?: boolean | null
        }
      }
      skills: {
        Row: {
          created_at: string | null
          description: string
          id: string
          instructions: string | null
          is_active: boolean | null
          metadata: Json | null
          name: string
          resources: Json | null
          skill_id: string
          version: string | null
        }
        Insert: {
          created_at?: string | null
          description: string
          id?: string
          instructions?: string | null
          is_active?: boolean | null
          metadata?: Json | null
          name: string
          resources?: Json | null
          skill_id: string
          version?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string
          id?: string
          instructions?: string | null
          is_active?: boolean | null
          metadata?: Json | null
          name?: string
          resources?: Json | null
          skill_id?: string
          version?: string | null
        }
      }
      tasks: {
        Row: {
          agent_id: string | null
          agent_slug: string | null
          created_at: string | null
          id: string
          input: Json
          intermediate_data: Json | null
          logs: string[] | null
          master_task_id: string | null
          output: Json | null
          parent_id: string | null
          status: string
          storage_paths: string[] | null
          updated_at: string | null
        }
        Insert: {
          agent_id?: string | null
          agent_slug?: string | null
          created_at?: string | null
          id?: string
          input?: Json
          intermediate_data?: Json | null
          logs?: string[] | null
          master_task_id?: string | null
          output?: Json | null
          parent_id?: string | null
          status?: string
          storage_paths?: string[] | null
          updated_at?: string | null
        }
        Update: {
          agent_id?: string | null
          agent_slug?: string | null
          created_at?: string | null
          id?: string
          input?: Json
          intermediate_data?: Json | null
          logs?: string[] | null
          master_task_id?: string | null
          output?: Json | null
          parent_id?: string | null
          status?: string
          storage_paths?: string[] | null
          updated_at?: string | null
        }
      }
      tools: {
        Row: {
          config: Json
          created_at: string | null
          credential_description: string | null
          credential_secret_name: string | null
          credential_type: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          slug: string
          type: string
        }
        Insert: {
          config?: Json
          created_at?: string | null
          credential_description?: string | null
          credential_secret_name?: string | null
          credential_type?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          slug: string
          type: string
        }
        Update: {
          config?: Json
          created_at?: string | null
          credential_description?: string | null
          credential_secret_name?: string | null
          credential_type?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          slug?: string
          type?: string
        }
      }
      user_tool_credentials: {
        Row: {
          id: string
          overridden_at: string | null
          tool_id: string | null
          user_id: string | null
          vault_secret_name: string
        }
        Insert: {
          id?: string
          overridden_at?: string | null
          tool_id?: string | null
          user_id?: string | null
          vault_secret_name: string
        }
        Update: {
          id?: string
          overridden_at?: string | null
          tool_id?: string | null
          user_id?: string | null
          vault_secret_name?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type InsertTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type UpdateTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']

export type Task = Tables<'tasks'>
export type Agent = Tables<'agents'>
export type Tool = Tables<'tools'>
export type Skill = Tables<'skills'>
export type LLMProvider = Tables<'llm_providers'>
export type HumanReview = Tables<'human_reviews'>
export type AgentTool = Tables<'agent_tools'>
export type AgentSkill = Tables<'agent_skills'>

export type TaskStatus = 'pending' | 'running' | 'pending_subtask' | 'needs_human_review' | 'completed' | 'failed' | 'cancelled'
export type ToolType = 'internal' | 'mcp_server' | 'http_api' | 'supabase_rpc'
export type CredentialType = 'api_key' | 'bearer_token' | 'oauth_refresh_token' | 'none'
