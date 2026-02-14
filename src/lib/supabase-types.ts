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
          inherited_from_skill_id: string | null
        }
        Insert: {
          agent_id: string
          tool_id: string
          inherited_from_skill_id?: string | null
        }
        Update: {
          agent_id?: string
          tool_id?: string
          inherited_from_skill_id?: string | null
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
          daily_token_budget: number | null
          description: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          last_heartbeat: string | null
          max_tokens: number | null
          memory_mode: string | null
          model: string | null
          name: string
          provider_id: string | null
          role: string | null
          slack_app_id: string | null
          slack_bot_token_secret: string | null
          slack_signing_secret_name: string | null
          slug: string
          status: string | null
          system_prompt: string
          temperature: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          daily_token_budget?: number | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          last_heartbeat?: string | null
          max_tokens?: number | null
          memory_mode?: string | null
          model?: string | null
          name: string
          provider_id?: string | null
          role?: string | null
          slack_app_id?: string | null
          slack_bot_token_secret?: string | null
          slack_signing_secret_name?: string | null
          slug: string
          status?: string | null
          system_prompt: string
          temperature?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          daily_token_budget?: number | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          last_heartbeat?: string | null
          max_tokens?: number | null
          memory_mode?: string | null
          model?: string | null
          name?: string
          provider_id?: string | null
          role?: string | null
          slack_app_id?: string | null
          slack_bot_token_secret?: string | null
          slack_signing_secret_name?: string | null
          slug?: string
          status?: string | null
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
      approval_requests: {
        Row: {
          id: string
          agent_id: string | null
          task_id: string | null
          session_id: string | null
          action_type: string
          resource_table: string
          resource_id: string
          payload: Json
          status: string
          reviewed_by: string | null
          reviewed_at: string | null
          review_notes: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          agent_id?: string | null
          task_id?: string | null
          session_id?: string | null
          action_type: string
          resource_table: string
          resource_id: string
          payload?: Json
          status?: string
          reviewed_by?: string | null
          reviewed_at?: string | null
          review_notes?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          agent_id?: string | null
          task_id?: string | null
          session_id?: string | null
          action_type?: string
          resource_table?: string
          resource_id?: string
          payload?: Json
          status?: string
          reviewed_by?: string | null
          reviewed_at?: string | null
          review_notes?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
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
      skill_tools: {
        Row: {
          skill_id: string
          tool_id: string
        }
        Insert: {
          skill_id: string
          tool_id: string
        }
        Update: {
          skill_id?: string
          tool_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "skill_tools_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skill_tools_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
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
          mission_status: string | null
          output: Json | null
          parent_id: string | null
          priority: string | null
          session_id: string | null
          status: string
          storage_paths: string[] | null
          tokens_input: number
          tokens_output: number
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
          mission_status?: string | null
          output?: Json | null
          parent_id?: string | null
          priority?: string | null
          session_id?: string | null
          status?: string
          storage_paths?: string[] | null
          tokens_input?: number
          tokens_output?: number
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
          mission_status?: string | null
          output?: Json | null
          parent_id?: string | null
          priority?: string | null
          session_id?: string | null
          status?: string
          storage_paths?: string[] | null
          tokens_input?: number
          tokens_output?: number
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
            foreignKeyName: "tasks_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          id: string
          agent_id: string | null
          channel_type: string | null
          channel_id: string | null
          thread_id: string | null
          sender_id: string | null
          display_name: string | null
          status: string | null
          origin: Json
          delivery_context: Json
          default_model_provider: string | null
          default_model: string | null
          tokens_input: number
          tokens_output: number
          idle_timeout_min: number
          spawn_depth: number
          last_activity_at: string | null
          created_at: string | null
          parent_session_id: string | null
          spawn_parent_task_id: string | null
          max_tokens: number | null
        }
        Insert: {
          id?: string
          agent_id?: string | null
          channel_type?: string | null
          channel_id?: string | null
          thread_id?: string | null
          sender_id?: string | null
          display_name?: string | null
          status?: string | null
          origin?: Json
          delivery_context?: Json
          default_model_provider?: string | null
          default_model?: string | null
          tokens_input?: number
          tokens_output?: number
          idle_timeout_min?: number
          spawn_depth?: number
          last_activity_at?: string | null
          created_at?: string | null
          parent_session_id?: string | null
          spawn_parent_task_id?: string | null
          max_tokens?: number | null
        }
        Update: {
          id?: string
          agent_id?: string | null
          channel_type?: string | null
          channel_id?: string | null
          thread_id?: string | null
          sender_id?: string | null
          display_name?: string | null
          status?: string | null
          origin?: Json
          delivery_context?: Json
          default_model_provider?: string | null
          default_model?: string | null
          tokens_input?: number
          tokens_output?: number
          idle_timeout_min?: number
          spawn_depth?: number
          last_activity_at?: string | null
          created_at?: string | null
          parent_session_id?: string | null
          spawn_parent_task_id?: string | null
          max_tokens?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      tools: {
        Row: {
          config: Json
          created_at: string | null
          created_by: string | null
          credential_description: string | null
          credential_secret_name: string | null
          credential_type: string | null
          description: string | null
          execution_mode: string | null
          function_slug: string | null
          function_url: string | null
          id: string
          is_active: boolean | null
          name: string
          rate_limit_per_min: number | null
          requires_approval: boolean | null
          slug: string
          timeout_ms: number | null
          type: string
        }
        Insert: {
          config?: Json
          created_at?: string | null
          created_by?: string | null
          credential_description?: string | null
          credential_secret_name?: string | null
          credential_type?: string | null
          description?: string | null
          execution_mode?: string | null
          function_slug?: string | null
          function_url?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          rate_limit_per_min?: number | null
          requires_approval?: boolean | null
          slug: string
          timeout_ms?: number | null
          type: string
        }
        Update: {
          config?: Json
          created_at?: string | null
          created_by?: string | null
          credential_description?: string | null
          credential_secret_name?: string | null
          credential_type?: string | null
          description?: string | null
          execution_mode?: string | null
          function_slug?: string | null
          function_url?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          rate_limit_per_min?: number | null
          requires_approval?: boolean | null
          slug?: string
          timeout_ms?: number | null
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
      task_messages: {
        Row: {
          id: string
          task_id: string
          parent_message_id: string | null
          role: string
          type: string
          content: Json
          metadata: Json
          sequence_number: number
          created_at: string | null
          channel_context: Json | null
          model: string | null
          provider: string | null
          token_usage: Json | null
        }
        Insert: {
          id?: string
          task_id: string
          parent_message_id?: string | null
          role: string
          type: string
          content: Json
          metadata?: Json
          sequence_number?: number
          created_at?: string | null
          channel_context?: Json | null
          model?: string | null
          provider?: string | null
          token_usage?: Json | null
        }
        Update: {
          id?: string
          task_id?: string
          parent_message_id?: string | null
          role?: string
          type?: string
          content?: Json
          metadata?: Json
          sequence_number?: number
          created_at?: string | null
          channel_context?: Json | null
          model?: string | null
          provider?: string | null
          token_usage?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "task_messages_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
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
      retry_task: {
        Args: { p_task_id: string; p_clear_output?: boolean }
        Returns: Json
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
export type ApprovalRequest = Tables<'approval_requests'>
export type AgentTool = Tables<'agent_tools'>
export type AgentSkill = Tables<'agent_skills'>
export type SkillTool = Tables<'skill_tools'>
export type Session = Tables<'sessions'>

export type TaskStatus = 'pending' | 'queued' | 'running' | 'pending_subtask' | 'needs_human_review' | 'completed' | 'failed' | 'cancelled'
export type ToolType = 'internal' | 'mcp_server' | 'http_api' | 'supabase_rpc' | 'spawn'
export type CredentialType = 'api_key' | 'bearer_token' | 'oauth_refresh_token' | 'none'

export type AgentRole = 'system' | 'lead' | 'worker'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected'
export type ApprovalActionType = 'create_tool' | 'update_tool' | 'create_cron' | 'update_cron' | 'delete_cron' | 'create_agent' | 'update_agent' | 'deploy_function'

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
  | 'delegation_start'
  | 'delegation_complete'

// Spawn (sub-agent delegation) tool configuration
export interface SpawnContextVariable {
  name: string
  type: 'string' | 'number' | 'boolean' | 'object'
  required: boolean
  description: string
}

// Keep HandoffContextVariable as alias for backward compat
export type HandoffContextVariable = SpawnContextVariable

export interface SpawnToolConfig {
  target_agent_id: string
  target_agent_slug: string
  skill_id?: string
  instructions?: string
  context_variables: SpawnContextVariable[]
}

// Legacy alias
export type HandoffToolConfig = SpawnToolConfig

// Task context for delegation
export interface TaskContext {
  _delegated_from?: string
  _skill_instructions?: string
  _spawn_result?: {
    status: string
    output: Record<string, unknown> | null
    agent_slug: string
    task_id: string
    session_id: string
  }
  _handoff_from?: string
  _handoff_tool?: string
  _handoff_instructions?: string
  _handoff_chain?: string[]
  _approval_result?: string
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
