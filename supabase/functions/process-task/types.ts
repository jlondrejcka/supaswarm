// Tool configuration and database types

export interface Tool {
  id: string;
  name: string;
  slug: string;
  type: string;
  config: ToolConfig;
  description: string | null;
  is_active: boolean;
  credential_secret_name: string | null;
}

export interface ToolConfig {
  mcp_url?: string;
  endpoint?: string;
  transport?: "sse" | "http" | "streamable_http";
  tools?: McpToolDefinition[];
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  function_name?: string;
  parameters?: Record<string, unknown>;
  // Spawn (sub-agent delegation) tool config
  target_agent_id?: string;
  target_agent_slug?: string;
  skill_id?: string;
  instructions?: string;
  context_variables?: SpawnContextVariable[];
  // Legacy handoff fields (kept for backward compat)
  handoff_instructions?: string;
}

export interface SpawnContextVariable {
  name: string;
  type: "string" | "number" | "boolean" | "object";
  required: boolean;
  description: string;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

export interface Agent {
  id: string;
  name: string;
  slug: string;
  system_prompt: string | null;
  provider_id: string | null;
  model: string | null;
  role: string | null;
}

export interface Skill {
  id: string;
  skill_id: string;
  name: string;
  description: string;
  instructions: string | null;
  metadata: Record<string, unknown> | null;
  resources: Record<string, unknown> | null;
  version: string | null;
  is_active: boolean;
}

export interface LLMProvider {
  id: string;
  name: string;
  display_name: string;
  default_model: string;
  base_url: string | null;
}

export interface Task {
  id: string;
  status: string;
  agent_id: string | null;
  agent_slug: string | null;
  session_id: string | null;
  parent_id: string | null;
  input: { message?: string } | null;
  output: Record<string, unknown> | null;
  intermediate_data: Record<string, unknown> | null;
  context: TaskContext | null;
  // Parallel coordination fields
  is_parallel_task: boolean;
  dependent_task_ids: string[] | null;
}

export interface TaskContext {
  // Delegation (spawn) context
  _delegated_from?: string;
  _skill_instructions?: string;
  _spawn_result?: SpawnResult;
  // Legacy handoff fields
  _handoff_from?: string;
  _handoff_tool?: string;
  _handoff_instructions?: string;
  _handoff_chain?: string[];
  // Parallel coordination
  _parallel_results?: ParallelTaskResult[];
  _aggregation_instructions?: string;
  // Approval result
  _approval_result?: string;
  [key: string]: unknown;
}

export interface SpawnResult {
  status: string;
  output: Record<string, unknown> | null;
  agent_slug: string;
  task_id: string;
  session_id: string;
}

export interface ParallelTaskResult {
  task_id: string;
  agent_slug: string;
  output: Record<string, unknown> | null;
  source: "agent" | "human_review";
}

export interface ToolCall {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface LLMToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LLMMessage {
  role: string;
  content: string;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
}

export interface LLMCallResult {
  response: string;
  toolCalls: ToolCall[];
}

export interface McpResponse {
  jsonrpc: string;
  id?: number;
  result?: {
    tools?: Array<{
      name: string;
      description?: string;
      inputSchema?: Record<string, unknown>;
    }>;
    serverInfo?: Record<string, unknown>;
    capabilities?: Record<string, unknown>;
    content?: unknown;
  };
  error?: {
    code: number;
    message: string;
  };
}

