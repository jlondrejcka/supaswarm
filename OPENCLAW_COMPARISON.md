# SupaSwarm vs OpenClaw: Feature Comparison & Parity Roadmap

## Executive Summary

This document compares **SupaSwarm** (a Supabase-native multi-agent orchestration platform) with **[OpenClaw](https://github.com/openclaw/openclaw)** (a self-hosted AI personal assistant with 135k+ GitHub stars). The goal is to identify features that could be added to SupaSwarm while maintaining its **headless, database-native architecture**.

---

## Architecture Comparison

| Aspect | SupaSwarm | OpenClaw |
|--------|-----------|----------|
| **Core Philosophy** | Database-native, all state in PostgreSQL | Local-first, Gateway-centric |
| **Runtime** | Supabase Edge Functions | Node.js long-running process |
| **Communication** | Supabase Realtime | WebSocket control plane (port 18789) |
| **State Management** | PostgreSQL tables | File system + in-memory |
| **Deployment** | Supabase hosted | Self-hosted on any device |
| **UI** | Next.js dashboard | Multi-channel messaging clients |

---

## Feature Gap Analysis

### Features OpenClaw Has That SupaSwarm Lacks

#### 1. **Multi-Channel Messaging Inbox** ⭐ High Priority
OpenClaw connects to 12+ messaging platforms as input/output channels:
- WhatsApp (Baileys)
- Telegram (grammY)
- Slack (Bolt)
- Discord (discord.js)
- Signal (signal-cli)
- iMessage (imsg)
- Microsoft Teams
- Google Chat
- Matrix
- Zalo
- WebChat

**Headless Implementation for SupaSwarm:**
```
┌─────────────────────────────────────────────────────────┐
│                   Channel Adapters                       │
│  (Separate Edge Functions or Workers)                    │
│                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ WhatsApp │ │ Telegram │ │  Slack   │ │ Discord  │   │
│  │ Adapter  │ │ Adapter  │ │ Adapter  │ │ Adapter  │   │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘   │
│       │            │            │            │          │
│       └────────────┴─────┬──────┴────────────┘          │
│                          ▼                              │
│              ┌─────────────────────┐                    │
│              │   channels table    │                    │
│              │   messages table    │                    │
│              └──────────┬──────────┘                    │
│                         ▼                              │
│              ┌─────────────────────┐                    │
│              │   process-task      │                    │
│              │   (existing)        │                    │
│              └─────────────────────┘                    │
└─────────────────────────────────────────────────────────┘
```

#### 2. **Gateway/WebSocket Control Plane** ⭐ High Priority
OpenClaw's Gateway provides:
- Real-time bidirectional communication
- Session management across channels
- Centralized event bus
- Remote access via Tailscale/SSH

**Headless Implementation:**
- Create a `gateway` Edge Function or separate worker
- Use Supabase Realtime channels for pub/sub
- Implement WebSocket bridge for external integrations
- Store sessions in `gateway_sessions` table

#### 3. **Cron Jobs & Webhooks** ⭐ High Priority
OpenClaw supports:
- Scheduled task execution
- Webhook triggers from external services
- Gmail Pub/Sub integration

**Headless Implementation:**
```sql
-- New tables
CREATE TABLE scheduled_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id),
  cron_expression TEXT NOT NULL,
  task_template JSONB NOT NULL,
  enabled BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id),
  endpoint_path TEXT UNIQUE NOT NULL,
  secret_hash TEXT,
  task_template JSONB NOT NULL,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```
- Use Supabase `pg_cron` extension for scheduling
- Create `webhook-receiver` Edge Function

#### 4. **Multi-Agent Routing** ⭐ Medium Priority
OpenClaw routes different channels/contacts to isolated agents (workspaces).

**Headless Implementation:**
```sql
CREATE TABLE routing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_type TEXT NOT NULL,
  channel_id TEXT,
  contact_pattern TEXT, -- regex or exact match
  agent_id UUID REFERENCES agents(id),
  workspace_id UUID,
  priority INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### 5. **Enhanced Skills Platform** ⭐ Medium Priority
OpenClaw has:
- Bundled skills (built-in)
- Managed skills (community marketplace)
- Workspace skills (project-specific)
- Install gating (approval before use)

**Headless Implementation:**
- Extend existing `skills` table with:
  - `skill_type`: bundled | managed | workspace
  - `source_url`: for managed skills
  - `requires_approval`: boolean
  - `approved_at`: timestamp
- Create `skill-registry` for fetching community skills

#### 6. **Browser Control** 🔧 Low Priority (Complex)
OpenClaw provides:
- Dedicated Chrome/Chromium instance
- Screenshot/snapshot capabilities
- Profile management

**Headless Implementation:**
- Integrate with Browserless or Playwright as a service
- Create `browser-control` tool type
- Store browser sessions in database

#### 7. **Voice Interaction** 🔧 Low Priority (Device-specific)
OpenClaw has:
- Voice wake detection
- Speech-to-text transcription
- Text-to-speech output

**Headless Implementation:**
- Create `voice-adapter` Edge Function
- Integrate with Whisper API for STT
- Integrate with ElevenLabs/OpenAI TTS
- Store voice sessions in database

#### 8. **Canvas/A2UI (Agent-to-UI)** 🔧 Low Priority
OpenClaw's visual workspace for agents to render UI components.

**Headless Implementation:**
- Store canvas state in `canvas_sessions` table
- Create `canvas-render` Edge Function
- Output structured UI JSON for frontends to render

#### 9. **Node Operations** 🔧 Low Priority (Device-specific)
OpenClaw can control device features:
- Camera
- Screen recording
- Location
- Notifications

**Headless Alternative:**
- These are inherently device-bound
- Create `node-proxy` tool type that calls external node agents
- Store node registrations in database

#### 10. **Per-Session Sandboxing** 🔧 Medium Priority
OpenClaw runs untrusted sessions in Docker containers.

**Headless Implementation:**
- Leverage Supabase Edge Function isolation (already sandboxed)
- For deeper isolation, integrate with:
  - Firecracker microVMs
  - gVisor containers
  - Deno Deploy isolates

---

## Features SupaSwarm Has That OpenClaw Lacks

| Feature | SupaSwarm | OpenClaw |
|---------|-----------|----------|
| **Chain of Thought Logging** | Full message history with 10 types | Limited session logs |
| **Human Review Queue** | Built-in approval workflow | No native support |
| **Parallel Task Execution** | Native with aggregation | Manual coordination |
| **Database-Native State** | All state in PostgreSQL | File system based |
| **Multi-Provider LLM** | 4 providers, 12+ models | Model-agnostic but less structured |
| **Task Hierarchy** | 3-ID system for parent/child | Session-based |
| **Usage Analytics** | Leaderboards and metrics | Limited |
| **Vault Integration** | Native secret management | File-based config |

---

## Implementation Roadmap for Headless Parity

### Phase 1: Core Infrastructure (High Priority)

#### 1.1 Channel Adapter System
```
New files:
├── supabase/functions/
│   ├── channel-webhook/         # Receives messages from channels
│   │   └── index.ts
│   ├── channel-sender/          # Sends messages to channels
│   │   └── index.ts
│   └── adapters/
│       ├── telegram.ts
│       ├── slack.ts
│       ├── discord.ts
│       └── whatsapp.ts
```

**Database additions:**
```sql
-- Channel configuration
CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL, -- telegram, slack, discord, whatsapp, webhook
  name TEXT NOT NULL,
  config JSONB NOT NULL, -- channel-specific config
  credentials_secret TEXT, -- vault reference
  agent_id UUID REFERENCES agents(id), -- default agent
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Inbound/outbound messages
CREATE TABLE channel_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES channels(id),
  direction TEXT NOT NULL, -- inbound | outbound
  external_id TEXT, -- platform message ID
  sender_id TEXT,
  content TEXT,
  media_urls TEXT[],
  metadata JSONB,
  task_id UUID REFERENCES tasks(id), -- linked task
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Contact-to-agent routing
CREATE TABLE channel_routing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES channels(id),
  pattern TEXT NOT NULL, -- contact pattern (regex or exact)
  agent_id UUID REFERENCES agents(id),
  priority INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### 1.2 Scheduling System
```sql
-- Enable pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Scheduled tasks
CREATE TABLE scheduled_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  agent_id UUID REFERENCES agents(id),
  cron_expression TEXT NOT NULL,
  task_input TEXT NOT NULL,
  context JSONB DEFAULT '{}',
  enabled BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  last_task_id UUID REFERENCES tasks(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Function to create task from schedule
CREATE OR REPLACE FUNCTION run_scheduled_task(schedule_id UUID)
RETURNS UUID AS $$
DECLARE
  v_task_id UUID;
  v_schedule scheduled_tasks%ROWTYPE;
BEGIN
  SELECT * INTO v_schedule FROM scheduled_tasks WHERE id = schedule_id;

  INSERT INTO tasks (agent_id, input, context, status)
  VALUES (v_schedule.agent_id, v_schedule.task_input, v_schedule.context, 'pending')
  RETURNING id INTO v_task_id;

  UPDATE scheduled_tasks
  SET last_run_at = now(), last_task_id = v_task_id
  WHERE id = schedule_id;

  RETURN v_task_id;
END;
$$ LANGUAGE plpgsql;
```

#### 1.3 Webhook System
```sql
CREATE TABLE webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  path TEXT UNIQUE NOT NULL, -- /webhooks/{path}
  agent_id UUID REFERENCES agents(id),
  secret_hash TEXT, -- for signature verification
  task_template JSONB NOT NULL,
  transform_jq TEXT, -- jq expression to transform payload
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**New Edge Function:** `supabase/functions/webhook-receiver/index.ts`

### Phase 2: Enhanced Capabilities (Medium Priority)

#### 2.1 Session Management
```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES channels(id),
  external_session_id TEXT,
  contact_id TEXT,
  agent_id UUID REFERENCES agents(id),
  context JSONB DEFAULT '{}',
  state TEXT DEFAULT 'active', -- active, paused, closed
  last_activity_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Link tasks to sessions
ALTER TABLE tasks ADD COLUMN session_id UUID REFERENCES sessions(id);
```

#### 2.2 Enhanced Skills System
```sql
ALTER TABLE skills ADD COLUMN IF NOT EXISTS skill_type TEXT DEFAULT 'workspace';
ALTER TABLE skills ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT false;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS version TEXT DEFAULT '1.0.0';

-- Skill marketplace registry
CREATE TABLE skill_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  source_url TEXT NOT NULL,
  author TEXT,
  version TEXT NOT NULL,
  downloads INT DEFAULT 0,
  rating DECIMAL(3,2),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### 2.3 Browser Tool Integration
```sql
-- Add browser as a tool type
INSERT INTO tools (name, type, config) VALUES (
  'Browser Control',
  'browser',
  '{
    "provider": "browserless",
    "endpoint": "https://chrome.browserless.io",
    "capabilities": ["screenshot", "pdf", "scrape", "navigate"]
  }'::jsonb
);
```

### Phase 3: Advanced Features (Lower Priority)

#### 3.1 Voice Adapter
```sql
CREATE TABLE voice_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id),
  stt_provider TEXT DEFAULT 'whisper',
  tts_provider TEXT DEFAULT 'elevenlabs',
  voice_id TEXT,
  audio_urls TEXT[],
  transcripts JSONB[],
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### 3.2 Canvas/A2UI Support
```sql
CREATE TABLE canvas_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id),
  state JSONB NOT NULL, -- UI component tree
  version INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

## API Design for Headless Operations

### Channel Management API

```typescript
// POST /rest/v1/channels
{
  "type": "telegram",
  "name": "Support Bot",
  "config": {
    "bot_token_secret": "telegram_bot_token" // vault reference
  },
  "agent_id": "uuid-of-agent"
}

// POST /rest/v1/channel_routing
{
  "channel_id": "uuid",
  "pattern": "VIP-*", // route VIP contacts
  "agent_id": "uuid-of-vip-agent"
}
```

### Webhook API

```typescript
// POST /rest/v1/webhooks
{
  "name": "GitHub Events",
  "path": "github-events",
  "agent_id": "uuid",
  "task_template": {
    "input": "Process GitHub event: {{event.action}} on {{event.repository.name}}"
  }
}

// External call: POST /functions/v1/webhook-receiver/github-events
// Body: GitHub webhook payload
```

### Scheduling API

```typescript
// POST /rest/v1/scheduled_tasks
{
  "name": "Daily Report",
  "agent_id": "uuid",
  "cron_expression": "0 9 * * *", // 9 AM daily
  "task_input": "Generate daily activity report"
}
```

---

## Migration Strategy

### Step 1: Database Schema Updates
Run migrations to add new tables without breaking existing functionality.

### Step 2: Channel Adapters (Start with Telegram)
1. Create `channel-webhook` Edge Function
2. Implement Telegram adapter
3. Test with simple bot integration
4. Add routing logic

### Step 3: Scheduling System
1. Enable `pg_cron` extension
2. Create scheduled_tasks table
3. Build cron management functions
4. Test with simple scheduled tasks

### Step 4: Webhook System
1. Create `webhook-receiver` Edge Function
2. Implement signature verification
3. Test with GitHub/Stripe webhooks

### Step 5: Iterate
Add additional channels, enhance skills, browser integration.

---

## Summary: Effort Estimation

| Feature | Effort | Impact | Priority |
|---------|--------|--------|----------|
| Channel Adapters (Telegram/Slack/Discord) | High | Very High | 1 |
| Webhook System | Low | High | 2 |
| Scheduling (pg_cron) | Low | High | 3 |
| Session Management | Medium | High | 4 |
| Multi-Agent Routing | Medium | Medium | 5 |
| Enhanced Skills | Medium | Medium | 6 |
| Browser Control | High | Medium | 7 |
| Voice Adapters | High | Low | 8 |
| Canvas/A2UI | High | Low | 9 |

---

## Conclusion

SupaSwarm can achieve feature parity with OpenClaw while maintaining its headless, database-native architecture. The key additions are:

1. **Channel adapter system** - Bring messaging platform integrations
2. **Webhook/scheduling** - Enable external triggers and automation
3. **Session management** - Persistent conversation context
4. **Enhanced routing** - Multi-agent workspaces

The main architectural advantage SupaSwarm retains is its **database-native design** with full observability, human-in-the-loop, and parallel execution - features OpenClaw lacks.

---

## Sources

- [OpenClaw GitHub Repository](https://github.com/openclaw/openclaw)
- [OpenClaw Documentation](https://docs.openclaw.ai/)
- [OpenClaw MCP Support PR](https://github.com/openclaw/openclaw/pull/5121)
- [OpenClaw Wikipedia](https://en.wikipedia.org/wiki/OpenClaw)
- [Pi: The Minimal Agent Within OpenClaw](https://lucumr.pocoo.org/2026/1/31/pi/)
- [Awesome OpenClaw Skills](https://github.com/VoltAgent/awesome-openclaw-skills)
