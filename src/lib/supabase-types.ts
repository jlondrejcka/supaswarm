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
        Relationships: [
          {
            foreignKeyName: "agent_skills_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "agent_tools_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tools_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "agents_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "llm_providers"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "human_reviews_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_providers: {
        Row: {
          base_url: string | null
          default_model: string
          display_name: string
          has_api_key: boolean | null
          id: string
          is_active: boolean | null
          name: string
          requires_api_key: boolean | null
        }
        Insert: {
          base_url?: string | null
          default_model: string
          display_name: string
          has_api_key?: boolean | null
          id?: string
          is_active?: boolean | null
          name: string
          requires_api_key?: boolean | null
        }
        Update: {
          base_url?: string | null
          default_model?: string
          display_name?: string
          has_api_key?: boolean | null
          id?: string
          is_active?: boolean | null
          name?: string
          requires_api_key?: boolean | null
        }
        Relationships: []
      }
      provider_models: {
        Row: {
          id: string
          provider_id: string
          model_name: string
          display_name: string | null
          is_enabled: boolean | null
          created_at: string | null
          input_price_per_million: number | null
          output_price_per_million: number | null
          context_window: number | null
          max_output_tokens: number | null
          supports_vision: boolean | null
          supports_tools: boolean | null
          supports_streaming: boolean | null
          model_family: string | null
          release_date: string | null
          is_latest: boolean | null
          capabilities: Json | null
        }
        Insert: {
          id?: string
          provider_id: string
          model_name: string
          display_name?: string | null
          is_enabled?: boolean | null
          created_at?: string | null
          input_price_per_million?: number | null
          output_price_per_million?: number | null
          context_window?: number | null
          max_output_tokens?: number | null
          supports_vision?: boolean | null
          supports_tools?: boolean | null
          supports_streaming?: boolean | null
          model_family?: string | null
          release_date?: string | null
          is_latest?: boolean | null
          capabilities?: Json | null
        }
        Update: {
          id?: string
          provider_id?: string
          model_name?: string
          display_name?: string | null
          is_enabled?: boolean | null
          created_at?: string | null
          input_price_per_million?: number | null
          output_price_per_million?: number | null
          context_window?: number | null
          max_output_tokens?: number | null
          supports_vision?: boolean | null
          supports_tools?: boolean | null
          supports_streaming?: boolean | null
          model_family?: string | null
          release_date?: string | null
          is_latest?: boolean | null
          capabilities?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_models_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "llm_providers"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: []
      }
      tasks: {
        Row: {
          agent_id: string | null
          agent_slug: string | null
          context: Json
          created_at: string | null
          dependent_task_ids: string[] | null
          id: string
          input: Json
          intermediate_data: Json | null
          is_parallel_task: boolean
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
          context?: Json
          created_at?: string | null
          dependent_task_ids?: string[] | null
          id?: string
          input?: Json
          intermediate_data?: Json | null
          is_parallel_task?: boolean
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
          context?: Json
          created_at?: string | null
          dependent_task_ids?: string[] | null
          id?: string
          input?: Json
          intermediate_data?: Json | null
          is_parallel_task?: boolean
          logs?: string[] | null
          master_task_id?: string | null
          output?: Json | null
          parent_id?: string | null
          status?: string
          storage_paths?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_master_task_id_fkey"
            columns: ["master_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: []
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
        Relationships: [
          {
            foreignKeyName: "user_tool_credentials_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_vault_secret: { Args: { secret_name: string }; Returns: boolean }
      delete_vault_secret: { Args: { secret_name: string }; Returns: boolean }
      list_vault_secrets: {
        Args: Record<string, never>
        Returns: {
          created_at: string
          description: string
          secret_name: string
        }[]
      }
      pgmq_delete: {
        Args: { msg_id: number; queue_name: string }
        Returns: boolean
      }
      upsert_vault_secret: {
        Args: {
          secret_description?: string
          secret_name: string
          secret_value: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
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
export type ProviderModel = Tables<'provider_models'>
export type HumanReview = Tables<'human_reviews'>
export type AgentTool = Tables<'agent_tools'>
export type AgentSkill = Tables<'agent_skills'>

export type TaskStatus = 'pending' | 'queued' | 'running' | 'pending_subtask' | 'needs_human_review' | 'completed' | 'failed' | 'cancelled'
export type ToolType = 'internal' | 'mcp_server' | 'http_api' | 'supabase_rpc' | 'handoff'
export type CredentialType = 'api_key' | 'bearer_token' | 'oauth_refresh_token' | 'none'

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'
export type MessageType = 
  | 'user_message' 
  | 'assistant_message' 
  | 'thinking' 
  | 'tool_call' 
  | 'tool_result' 
  | 'skill_load' 
  | 'subtask_created' 
  | 'error' 
  | 'status_change'
  | 'handoff'

// Handoff tool configuration
export interface HandoffContextVariable {
  name: string
  type: 'string' | 'number' | 'boolean' | 'object'
  required: boolean
  description: string
}

export interface HandoffToolConfig {
  target_agent_id: string
  target_agent_slug: string
  context_variables: HandoffContextVariable[]
  handoff_instructions?: string
}

// Task context for handoffs
export interface TaskContext {
  _handoff_from?: string
  _handoff_tool?: string
  _handoff_instructions?: string
  _handoff_chain?: string[]
  [key: string]: unknown
}

export interface TaskMessage {
  id: string
  task_id: string
  parent_message_id: string | null
  role: MessageRole
  type: MessageType
  content: Json
  metadata: Json
  sequence_number: number
  created_at: string | null
}

export interface TaskMessageInsert {
  id?: string
  task_id: string
  parent_message_id?: string | null
  role: MessageRole
  type: MessageType
  content: Json
  metadata?: Json
  sequence_number?: number
  created_at?: string | null
}
