# Product Requirements Document (PRD): SupaSwarm

**Version:** 2.0 (Final Implementation – December 29, 2025)  
**Status:** Implemented

## 1. Overview

### Product Name
SupaSwarm

### Tagline
A fully Supabase-native, secure, and extensible multi-agent orchestration platform.

### Purpose
SupaSwarm enables developers and teams to build reliable, observable, and governed agentic workflows using only Supabase services. It provides a Linear/Vercel-inspired dashboard for managing hierarchical tasks, configurable agents, external tool access, portable Agent Skills, and production-grade secret management.

### Key Goals
- 100% built on Supabase (Postgres, Queues, Edge Functions, Storage, Realtime, Vault).
- Full traceability, realtime observability, and auditability.
- Secure handling of all credentials (LLM keys + tool auth) via Supabase Vault.
- Developer-focused monitoring and management dashboard.
- Full compatibility with modern agent standards (MCP protocol, Agent Skills).

### Target Users
- Developers building agentic applications.
- Internal tools and automation teams.
- Enterprises needing secure, multi-tool agent workflows.

## 2. Core Features (Implemented)

### 2.1 Dashboard UI
- **Framework**: Next.js 14+ with App Router
- **Design**: Linear/Vercel-inspired with shadcn/ui components
- **Theming**: Light/dark mode with toggle in sidebar settings
- **Layout**: Collapsible sidebar navigation (defaults to collapsed)

### 2.2 Task Management
- **Hierarchical Tasks**: Three-ID system for task relationships
  - `id`: Unique record identifier
  - `parent_id`: Immediate parent task (for subtasks)
  - `master_task_id`: Root task that started the conversation (NULL for top-level)
- **Task Detail Page**: Dedicated route at `/tasks/[id]` showing full task hierarchy
- **Status Tracking**: pending, running, pending_subtask, needs_human_review, completed, failed, cancelled

### 2.3 Chat Interface
- **AI Chat**: Send messages to create tasks processed by Edge Functions
- **Chat History**: View past conversations (tasks without master_task_id)
- **Real-time Updates**: Live task status via Supabase Realtime subscriptions
- **Agent Selection**: Choose which agent processes the task

### 2.4 Agent Registry
- **Configurable Agents**: Name, description, system prompt, model, temperature
- **LLM Providers**: xAI, Anthropic, Google AI, OpenAI (API keys in Vault)
- **Agent-Tool Binding**: Assign tools to agents
- **Agent-Skill Binding**: Assign skills to agents

### 2.5 Tool Integration
- **Tool Types**: Internal, MCP Server, HTTP API, Supabase RPC
- **Credential Management**: Secure storage via Vault references
- **CRUD Operations**: Full management UI for tools

### 2.6 Skills (Agent Skills Standard)
- **Skill Registry**: Store and manage agent skills
- **Metadata Support**: JSON metadata, instructions, resources
- **Version Tracking**: Semantic versioning for skills

### 2.7 Human-in-the-Loop Reviews
- **Review Queue**: Tasks requiring human intervention
- **Approval Workflow**: Approve/reject with comments
- **Audit Trail**: Track who reviewed and when

### 2.8 Secret Management
- **Supabase Vault Integration**: All secrets stored securely
- **RPC Functions**: get_vault_secret, upsert_vault_secret, list_vault_secrets, delete_vault_secret
- **Settings UI**: Manage LLM provider API keys through dashboard
- **Zero Exposure**: No secrets in database rows or logs

## 3. Technical Architecture

### 3.1 Frontend Stack
- **Framework**: Next.js 14+ with App Router
- **UI Library**: shadcn/ui (Radix UI primitives)
- **Styling**: Tailwind CSS with CSS custom properties
- **State**: React hooks + TanStack React Query
- **Typography**: Inter (UI), JetBrains Mono (code)
- **Icons**: Lucide React

### 3.2 Database Schema

```sql
-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgmq";

-- Tasks (Three-ID Hierarchy)
create table public.tasks (
  id uuid primary key default uuid_generate_v4(),
  master_task_id uuid references public.tasks(id),  -- Root conversation (NULL for top-level)
  parent_id uuid references public.tasks(id),       -- Immediate parent
  
  agent_id uuid references public.agents(id),
  agent_slug text,
  
  status text not null default 'pending' check (status in (
    'pending', 'running', 'pending_subtask', 'needs_human_review',
    'completed', 'failed', 'cancelled'
  )),
  
  input jsonb not null,
  output jsonb,
  logs text[] default '{}',
  intermediate_data jsonb,
  storage_paths text[] default '{}',
  
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Agents
create table public.agents (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  slug text not null unique,
  description text,
  system_prompt text not null,
  provider_id uuid references public.llm_providers(id),
  model text,
  temperature decimal default 0.7,
  max_tokens int,
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- LLM Providers
create table public.llm_providers (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  display_name text not null,
  base_url text,
  default_model text not null,
  requires_api_key boolean default true,
  is_active boolean default true
);

-- Tools
create table public.tools (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  slug text not null unique,
  type text not null check (type in ('internal', 'mcp_server', 'http_api', 'supabase_rpc')),
  description text,
  config jsonb not null,
  credential_secret_name text,
  credential_type text check (credential_type in ('api_key', 'bearer_token', 'oauth_refresh_token', 'none')),
  credential_description text,
  is_active boolean default true,
  created_at timestamp with time zone default now()
);

-- Agent ↔ Tools
create table public.agent_tools (
  agent_id uuid references public.agents(id) on delete cascade,
  tool_id uuid references public.tools(id) on delete cascade,
  primary key (agent_id, tool_id)
);

-- Skills (Agent Skills standard)
create table public.skills (
  id uuid primary key default uuid_generate_v4(),
  skill_id text not null unique,
  name text not null,
  description text not null,
  metadata jsonb,
  instructions text,
  resources jsonb,
  version text default '1.0.0',
  is_active boolean default true,
  created_at timestamp with time zone default now()
);

-- Agent ↔ Skills
create table public.agent_skills (
  agent_id uuid references public.agents(id) on delete cascade,
  skill_id uuid references public.skills(id) on delete cascade,
  priority int default 5,
  primary key (agent_id, skill_id)
);

-- Human Reviews
create table public.human_reviews (
  id uuid primary key default uuid_generate_v4(),
  task_id uuid references public.tasks(id) on delete cascade,
  response jsonb not null,
  approved boolean,
  comments text,
  created_by uuid references auth.users(id),
  created_at timestamp with time zone default now()
);

-- Key Indexes
create index idx_tasks_master_task_id on public.tasks(master_task_id);
create index idx_tasks_status on public.tasks(status);
create index idx_agents_slug on public.agents(slug);
create index idx_tools_slug on public.tools(slug);
create index idx_skills_skill_id on public.skills(skill_id);
```

### 3.3 Vault RPC Functions

```sql
-- Get secret from Vault
create or replace function get_vault_secret(secret_name text)
returns text as $$
declare
  secret_value text;
begin
  select decrypted_secret into secret_value
  from vault.decrypted_secrets
  where name = secret_name
  limit 1;
  return secret_value;
end;
$$ language plpgsql security definer;

-- Upsert secret to Vault
create or replace function upsert_vault_secret(secret_name text, secret_value text)
returns void as $$
begin
  -- Delete existing secret if present
  delete from vault.secrets where name = secret_name;
  -- Insert new secret
  insert into vault.secrets (name, secret)
  values (secret_name, secret_value);
end;
$$ language plpgsql security definer;

-- List all secrets (names only)
create or replace function list_vault_secrets()
returns table(name text) as $$
begin
  return query select s.name from vault.secrets s;
end;
$$ language plpgsql security definer;

-- Delete secret from Vault
create or replace function delete_vault_secret(secret_name text)
returns void as $$
begin
  delete from vault.secrets where name = secret_name;
end;
$$ language plpgsql security definer;
```

### 3.4 Edge Functions

- **process-task**: Main task processor triggered by chat messages
  - Retrieves LLM API keys from Vault via RPC
  - Calls configured LLM provider
  - Updates task with response
  - Supports xAI, Anthropic, Google AI, OpenAI

### 3.5 Realtime

- **Subscriptions**: postgres_changes on tasks table
- **Events**: INSERT, UPDATE for real-time task status updates
- **Filters**: By task ID for focused updates

## 4. Dashboard Pages

| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/` | Overview with stats and recent activity |
| Tasks | `/tasks` | Task list with filtering and chat interface |
| Task Detail | `/tasks/[id]` | Individual task with hierarchy navigation |
| Agents | `/agents` | Agent registry management |
| Tools | `/tools` | Tool configuration and credentials |
| Skills | `/skills` | Agent skills management |
| Reviews | `/reviews` | Human review queue |
| Settings | `/settings` | LLM provider API key configuration |

## 5. Task Hierarchy Model

```
Master Task (master_task_id = NULL)
├── Subtask A (parent_id = Master, master_task_id = Master)
│   └── Subtask A1 (parent_id = A, master_task_id = Master)
└── Subtask B (parent_id = Master, master_task_id = Master)
```

**Query Patterns:**
- Chat history: `WHERE master_task_id IS NULL`
- Subtask navigation: Use `parent_id` to traverse up
- Conversation grouping: Use `master_task_id` to find all related tasks

## 6. Task Status Flow

```
pending → running
          ├─ completed
          ├─ failed
          ├─ cancelled
          ├─ pending_subtask → (subtasks done) → pending
          └─ needs_human_review → (human responds) → pending
```

## 7. LLM Providers

| Provider | Vault Key | Default Model |
|----------|-----------|---------------|
| xAI | XAI_API_KEY | grok-beta |
| Anthropic | ANTHROPIC_API_KEY | claude-3-5-sonnet-20241022 |
| Google AI | GOOGLE_AI_API_KEY | gemini-1.5-pro |
| OpenAI | OPENAI_API_KEY | gpt-4o |

## 8. Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| NEXT_PUBLIC_SUPABASE_URL | Yes | Supabase project URL |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Yes | Anonymous API key |

## 9. Future Enhancements

- OAuth flows for per-user tool connections
- Parallel subtask execution
- Public skill/MCP registry integration
- Usage analytics and cost tracking
- Streaming responses in chat
- File attachments via Supabase Storage

## 10. Success Criteria

Demonstrated capabilities:
- [x] Dashboard with task, agent, tool, skill management
- [x] Chat interface with agent selection
- [x] Real-time task status updates
- [x] Task hierarchy with three-ID system
- [x] Chat history for past conversations
- [x] LLM provider integration via Vault secrets
- [x] Edge Function task processing
- [x] Light/dark theme support

---

**SupaSwarm v2.0 is a complete, secure, and developer-friendly multi-agent platform built entirely on Supabase.**
