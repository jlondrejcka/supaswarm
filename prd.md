# Product Requirements Document (PRD): SupaSwarm

**Version:** 1.8 (Final – December 28, 2025)  
**Status:** Approved for Implementation

## 1. Overview

### Product Name
SupaSwarm

### Tagline
A fully Supabase-native, secure, and extensible multi-agent orchestration platform.

### Purpose
SupaSwarm enables developers and teams to build reliable, observable, and governed agentic workflows using only Supabase services. It supports hierarchical task orchestration, explicit agent handoffs, human-in-the-loop review, deep nesting with master jobs, reusable agent configurations, external tool access via MCP servers, portable Agent Skills, and production-grade secret management.

### Key Goals
- 100% built on Supabase (Postgres, Queues, Edge Functions, Storage, Realtime, Vault).
- Full traceability, realtime observability, and auditability.
- Secure handling of all credentials (LLM keys + tool auth).
- Lean, performant worker that scales to many agents and tools.
- Full compatibility with modern agent standards (MCP protocol, Agent Skills).

### Target Users
- Developers building agentic applications.
- Internal tools and automation teams.
- Enterprises needing secure, multi-tool agent workflows.

## 2. Core Features

- **Hierarchical Master Tasks** – Unlimited-depth subtasks grouped under a master job for monitoring, aggregation, and cancellation.
- **Durable Queue & Execution** – Reliable processing via Supabase Queues and cron-triggered Edge Functions.
- **Configurable Agent Registry** – Reusable agents with prompts, models, tools, and skills.
- **Tool Integration** – Internal tools + external MCP servers + HTTP APIs.
- **Agent Skills** – Support for the Agent Skills open standard (progressive loading).
- **Explicit Handoffs & Human Review** – Built-in delegation and intervention tools.
- **Realtime Observability** – Live task, log, and job updates.
- **Secure Secret Management** – Unified Vault usage for all sensitive credentials.

## 3. Technical Architecture

### 3.1 Database Schema

```sql
-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgmq";

-- Tasks
create table public.tasks (
  id uuid primary key default uuid_generate_v4(),
  master_task_id uuid not null references public.tasks(id),
  parent_id uuid references public.tasks(id),
  
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
  config jsonb not null,                        -- e.g., { "mcp_url": "https://..." }
  credential_secret_name text,                  -- Vault reference
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

-- Per-user tool credentials (optional)
create table public.user_tool_credentials (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  tool_id uuid references public.tools(id) on delete cascade,
  vault_secret_name text not null,
  overridden_at timestamp with time zone default now(),
  unique(user_id, tool_id)
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

### 3.2 Queue & Storage

- **Queue:** agent_tasks (messages: { "task_id": "uuid" })
- **Bucket:** supaswarm-data (path: {master_task_id}/{task_id}/{filename})

### 3.3 Edge Functions

- **supaswarm-worker** – Core engine (cron-triggered every 15s, batch processing).
- **supaswarm-create-task** – Optional API for root task creation.

### 3.4 Realtime

- **Channels:** supaswarm:task:{task_id} and supaswarm:master:{master_task_id}

### 3.5 Tool & MCP Implementation Strategy (Final Decision)

- Main worker stays lean – No preloading of heavy libraries or tool code.
- MCP servers are external – Registered via URL in tools.config.
- Worker acts as lightweight MCP client proxy:
  - Lazy discovery of capabilities via /mcp endpoint.
  - Dynamic generation of function definitions.
  - Proxy tool calls over HTTP.
- Separate Edge Functions only for rare heavy/custom tools (supabase_rpc type).

## 4. Core System Tools (Always Available)

- create_subtask
- request_human_review
- save_intermediate_data
- complete_task
- load_skill

## 5. Secure Secret Management

All credentials stored exclusively in Supabase Vault:

- LLM keys (e.g., OPENAI_API_KEY, ANTHROPIC_API_KEY).
- Tool credentials referenced via tools.credential_secret_name.
- Per-user overrides via user_tool_credentials.
- Resolved at runtime with fallback chain.

**No secrets in database rows or logs.**

## 6. Task Status Flow

```
pending → running
          ├─ completed
          ├─ failed
          ├─ cancelled (master-level)
          ├─ pending_subtask → (subtasks done) → pending
          └─ needs_human_review → (human responds) → pending
```

## 7. Non-Functional Requirements

- Durability & idempotency via Postgres + queue visibility timeout.
- Concurrency-safe (multiple worker instances).
- Target latency <30s from enqueue to processing.
- Row Level Security (RLS) for data isolation.
- Cost-efficient batch processing.

## 8. Future Enhancements

- OAuth flows for per-user tool connections.
- Built-in admin dashboard.
- Parallel subtasks.
- Public skill/MCP registry integration.
- Usage analytics.

## 9. Success Criteria

Successful end-to-end workflow demonstrating:

- Multi-agent handoff with registered agents.
- Authenticated MCP tool usage (external server).
- Progressive skill loading.
- Human review intervention.
- Master job cancellation.
- Realtime reasoning trace visibility.
- Zero credential exposure.

---

**SupaSwarm is now a complete, secure, performant, and standards-aligned multi-agent platform built entirely on Supabase.**

Ready to build and ship.
