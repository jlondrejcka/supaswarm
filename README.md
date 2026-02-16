<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="SupaSwarm Dashboard" width="800" />
</p>

<h1 align="center">⚡ SupaSwarm</h1>

<p align="center">
  <strong>A Supabase-native multi-agent orchestration platform</strong>
</p>

<p align="center">
  Build observable and governed agentic workflows using only Supabase services
</p>

<p align="center">
  <a href="#why-supaswarm">Why SupaSwarm?</a> •
  <a href="#integration-patterns">Integration</a> •
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#local-development">Local Development</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#contributing">Contributing</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" />
  <img src="https://img.shields.io/badge/Supabase-Native-3ECF8E?logo=supabase" alt="Supabase Native" />
  <img src="https://img.shields.io/badge/Next.js-14+-black?logo=next.js" alt="Next.js 14+" />
  <img src="https://img.shields.io/badge/TypeScript-5.6-blue?logo=typescript" alt="TypeScript" />
</p>

---

## Why SupaSwarm?

### 🔄 **Tired of SDK Migrations?**
Agent SDKs constantly change, break compatibility, and don't work when your client has different specs. SupaSwarm moves all agent logic to the database—deploy once, no client-side SDK headaches.

### 🌐 **Real-time Multi-Device Sync**
Users work across multiple devices. SupaSwarm leverages Supabase Realtime so your agents run in the cloud with instant updates everywhere—no polling, no stale state.

### 🚀 **No Client/Server Trigger Issues**
Struggling to trigger agents from different contexts? With database-native orchestration, any system that can write a row can trigger an agent.

---

## Integration Patterns

SupaSwarm is designed to plug into your existing workflows:

### 📊 **Database Triggers → Background Agents**
Have database records trigger new task records automatically. Insert a row in your `orders` table? Fire off an agent to process it. Background agents at your fingertips.

### 🔗 **n8n → External System Triggers**
Use [n8n](https://n8n.io) workflows to have external systems (webhooks, CRMs, email, Slack, etc.) trigger new tasks in your Supabase database. No custom API endpoints needed.

### 🛠️ **n8n MCP Servers → Agent Tools**
Wire up [n8n MCP servers](https://n8n.io/integrations/mcp-server-trigger/) to give your agents access to 500+ integrations. Need your agent to send emails, update Notion, or query Salesforce? Just connect the MCP server.

---

## Features

### 🎯 **100% Supabase-Native**
Built entirely on Supabase services—Postgres, Edge Functions, Realtime, Storage, and Vault. No external dependencies for core orchestration.

### 🤖 **Multi-Agent Orchestration**
- **Agent Registry**: Create and configure AI agents with custom system prompts
- **Agent Handoffs**: Seamlessly transfer tasks between specialized agents
- **Parallel Execution**: Run multiple tasks concurrently with aggregation

### 🔧 **Tool Integration**
- **MCP Servers**: Connect Model Context Protocol servers
- **HTTP APIs**: Integrate external REST endpoints
- **Supabase RPCs**: Call database functions directly
- **Agent Handoffs**: Route tasks between agents

### 📊 **Full Observability**
- **Task Hierarchy**: Three-ID system for tracking parent/child relationships
- **Chain of Thought**: View reasoning traces and tool calls
- **Real-time Updates**: Live task status via Supabase Realtime
- **Human Review Queue**: Escalation for uncertain decisions

### 📈 **Usage Analytics**
- **Agent Leaderboard**: Track your most-used agents
- **Tool Usage**: Monitor which tools are called most frequently
- **Skill Analytics**: See which skills drive the most automation

### 🔐 **Secure by Design**
- **Vault Integration**: All secrets stored in Supabase Vault
- **Zero Exposure**: No credentials in database rows or logs
- **RLS Ready**: Row Level Security compatible

### 🎨 **Modern Dashboard**
- **Linear/Vercel-inspired UI**: Clean, developer-focused design
- **Dark/Light Themes**: System-aware with manual toggle
- **Responsive Layout**: Works on desktop and mobile

<p align="center">
  <img src="docs/screenshots/agents.png" alt="Agents Management" width="400" />
  <img src="docs/screenshots/tools.png" alt="Tools Configuration" width="400" />
</p>

---

## Quick Start

### Prerequisites

- Node.js 18+
- A Supabase project ([create one free](https://supabase.com/dashboard))
- API key from at least one LLM provider (xAI, Anthropic, Google AI, or OpenAI)

### 1. Clone the Repository

```bash
git clone https://github.com/jlondrejcka/supaswarm.git
cd supaswarm
npm install
```

### 2. Configure Supabase

Copy the environment example and add your Supabase credentials:

```bash
cp .env.example .env.local
```

**For Local Development** (recommended for getting started):
The `.env.example` is pre-configured to work with local Supabase. Just ensure you have:
- Supabase running locally: `supabase start`
- Ollama running locally: `ollama serve`

**For Production**:
Edit `.env.local` with your Supabase project URL and anon key:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Run Database Migration

Apply the schema to your Supabase project:

```bash
# Using Supabase CLI
supabase db push

# Or run the migration SQL directly in Supabase SQL Editor
# Copy contents from: supabase/migrations/20260214232055_remote_schema.sql
```

### 4. Start the Development Server

```bash
npm run dev
```

The application now includes an embedded worker that handles task processing locally. No need to deploy edge functions separately for local development!

### 5. Add LLM API Keys

Open [http://localhost:3000/settings](http://localhost:3000/settings) and add your LLM provider API keys. These are stored securely in Supabase Vault.

Available providers:
- **xAI (Grok)** - Fast and capable
- **Anthropic (Claude)** - Advanced reasoning
- **Google AI (Gemini)** - Multimodal
- **OpenAI (GPT-4)** - Standard choice

For local development with Ollama, no additional API keys are required!

### 6. Create Your First Agent

Navigate to [http://localhost:3000/agents](http://localhost:3000/agents) and create an agent with:
- **Name**: Your agent name
- **System Prompt**: Instructions for the agent
- **Model**: Select from available LLM models
- **Tools**: Assign tools the agent can use

---

## Local Development

### Setting Up Local Development Environment

SupaSwarm now supports a **local-first architecture** where you can run everything locally without relying on hosted Supabase Edge Functions.

#### Prerequisites for Local Development

- Node.js 18+
- Docker and Docker Compose (for Supabase)
- Ollama ([download](https://ollama.ai)) - for local LLM inference
- Supabase CLI (`npm install -g supabase`)

#### Quick Start with Local Setup

1. **Start Supabase locally**:

   ```bash
   supabase start
   ```

   This starts PostgreSQL, Realtime, and the Supabase Studio at `http://localhost:54333`.

2. **Start Ollama** (in another terminal):

   ```bash
   ollama serve
   ```

   Ollama will run on `http://localhost:11434`.

3. **Configure environment variables** (.env.local):

   ```bash
   cp .env.example .env.local
   ```

   The `.env.example` is pre-configured for local development with:
   - `NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321`
   - `OLLAMA_BASE_URL=http://localhost:11434/v1`
   - `WORKER_QUEUE_POLL_INTERVAL=2000`
   - `SLACK_SOCKET_MODE_ENABLED=true`

4. **Run the development server**:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser.

5. **Push database schema** (first time only):

   ```bash
   supabase db push
   ```

### Architecture Overview

#### Embedded Worker (Local)

The application now includes an **embedded Node.js worker** that replaces hosted Supabase Edge Functions:

- **Task Queue Polling**: Polls the database task queue every 2 seconds (configurable)
- **Local Processing**: Executes tasks using your local Ollama instance
- **Real-time Updates**: Uses Supabase Realtime to broadcast task status changes
- **Fault Tolerance**: Automatic retry logic with exponential backoff

#### Slack Integration via Socket Mode

Instead of webhook URLs:

- **Socket Mode**: Maintains persistent connection to Slack using App Token
- **Bidirectional Communication**: Receive events and send responses reliably
- **Local Development Friendly**: Works behind firewalls and NAT
- **No Public URL Required**: Perfect for development and testing

To enable Slack Socket Mode:

1. Create a Slack app at [api.slack.com/apps](https://api.slack.com/apps)
2. Enable Socket Mode and generate an App Token (xapp-...)
3. Set environment variables:
   ```env
   SLACK_APP_TOKEN=xapp-...
   SLACK_BOT_TOKEN=xoxb-...
   ```

### File Structure for Local Development

```
supabase/
├── config.toml              # Local Supabase configuration
├── functions-archived/      # Archived edge functions (reference only)
│   ├── process-task/
│   ├── slack-events/
│   └── ...
├── migrations/
│   ├── README.md            # Migration documentation
│   └── *.sql                # Database migrations
└── seed.sql                 # Optional seed data

src/
├── app/
│   └── api/
│       └── jobs/            # Embedded worker implementation
│           ├── worker.ts    # Main worker loop
│           └── queue.ts     # Queue polling logic
└── ...
```

### Debugging

#### View Worker Logs

The embedded worker logs task processing to both console and database:

```typescript
// Check worker status
SELECT * FROM cron_logs ORDER BY created_at DESC LIMIT 10;

// Check task queue
SELECT id, status, error FROM tasks ORDER BY created_at DESC LIMIT 10;
```

#### Monitor Supabase Locally

- **Supabase Studio**: [http://localhost:54333](http://localhost:54333)
- **Database**: Connect via `postgresql://postgres:postgres@localhost:54332/postgres`
- **API**: Available at `http://localhost:54321`

#### Test Ollama

```bash
curl http://localhost:11434/v1/models
```

### Environment Variables Reference

| Variable | Value | Purpose |
|----------|-------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | `http://localhost:54321` | Local Supabase API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from `.env` | Public key |
| `SUPABASE_SERVICE_ROLE_KEY` | from `.env` | Service role for auth bypass |
| `NEXT_RUNTIME` | `nodejs` | Use embedded worker |
| `OLLAMA_BASE_URL` | `http://localhost:11434/v1` | Local LLM endpoint |
| `WORKER_QUEUE_POLL_INTERVAL` | `2000` | Poll interval in ms |
| `SLACK_SOCKET_MODE_ENABLED` | `true` | Enable Socket Mode |
| `SLACK_APP_TOKEN` | `xapp-...` | Slack app token |
| `SLACK_BOT_TOKEN` | `xoxb-...` | Slack bot token |

### Migrating to Production

To deploy to production:

1. Update environment variables to use your Supabase cloud project
2. Deploy the application to Vercel or your hosting platform
3. The embedded worker will continue to work in production
4. For high-volume scenarios, consider horizontal scaling with multiple worker instances

See [supabase/migrations/README.md](supabase/migrations/README.md) for detailed migration information.

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Dashboard (Next.js)                   │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐│
│  │  Tasks  │ │ Agents  │ │  Tools  │ │ Skills  │ │Settings ││
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘│
└───────┼──────────┼──────────┼──────────┼──────────┼────────┘
        │          │          │          │          │
        ▼          ▼          ▼          ▼          ▼
┌─────────────────────────────────────────────────────────────┐
│                     Supabase Services                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   Postgres   │  │Edge Functions│  │   Realtime   │       │
│  │  - tasks     │  │- process-task│  │- subscriptions│      │
│  │  - agents    │  │              │  │              │       │
│  │  - tools     │  └──────────────┘  └──────────────┘       │
│  │  - skills    │                                           │
│  └──────────────┘  ┌──────────────┐  ┌──────────────┐       │
│                    │    Vault     │  │   Storage    │       │
│                    │- API keys    │  │- artifacts   │       │
│                    └──────────────┘  └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

### Task Hierarchy (Three-ID System)

```
Master Task (master_task_id = NULL)
├── Subtask A (parent_id = Master, master_task_id = Master)
│   └── Subtask A1 (parent_id = A, master_task_id = Master)
└── Subtask B (parent_id = Master, master_task_id = Master)
```

- **`id`**: Unique task identifier
- **`parent_id`**: Immediate parent (for subtask traversal)
- **`master_task_id`**: Root conversation task (for grouping)

### Task Status Flow

```
pending → running
          ├─→ completed
          ├─→ failed
          ├─→ cancelled
          ├─→ pending_subtask → (subtasks done) → pending
          └─→ needs_human_review → (human responds) → pending
```

---

## Usage

### Creating Tasks via Chat

1. Open the Tasks page
2. Click "New Task" to open the chat dialog
3. Select an agent from the dropdown
4. Type your message and send
5. Watch real-time updates as the agent processes

### Agent Handoffs

Configure agent-to-agent handoffs for specialized routing:

1. Create a "handoff" type tool pointing to the target agent
2. Assign the handoff tool to your router agent
3. The router can now delegate tasks to specialists

### Parallel Execution

Spawn multiple tasks to run concurrently:

1. Agent creates parallel tasks via the `spawn_parallel_tasks` tool
2. Each task runs independently
3. Aggregator task collects results when all complete

### Human-in-the-Loop

For high-stakes decisions, agents can request human review:

1. Agent calls `request_human_review` tool
2. Task moves to `needs_human_review` status
3. Human reviews and approves/rejects in the Reviews page
4. Task resumes with human feedback

---

## LLM Providers

| Provider | Vault Key | Default Model |
|----------|-----------|---------------|
| xAI (Grok) | `XAI_API_KEY` | grok-4-1 |
| Anthropic | `ANTHROPIC_API_KEY` | claude-sonnet-4-5-20250514 |
| Google AI | `GOOGLE_AI_API_KEY` | gemini-2.5-pro |
| OpenAI | `OPENAI_API_KEY` | gpt-4o |

Configure API keys in the Settings page. Keys are stored in Supabase Vault and never exposed in application code.

---

## Project Structure

```
supaswarm/
├── src/
│   ├── app/                 # Next.js App Router pages
│   │   ├── agents/          # Agent management
│   │   ├── tasks/           # Task list and detail views
│   │   ├── tools/           # Tool configuration
│   │   ├── skills/          # Skills management
│   │   ├── reviews/         # Human review queue
│   │   ├── settings/        # LLM provider config
│   │   └── api/
│   │       └── jobs/        # Embedded worker implementation
│   ├── components/          # React components
│   │   └── ui/              # shadcn/ui components
│   └── lib/                 # Utilities and types
├── supabase/
│   ├── config.toml          # Local Supabase configuration
│   ├── functions-archived/  # Reference: archived edge functions
│   │   ├── process-task/    # (no longer deployed)
│   │   ├── slack-events/    # (no longer deployed)
│   │   └── ...
│   └── migrations/          # Database schema & documentation
│       ├── README.md        # Local-first architecture guide
│       └── *.sql            # Migration files
├── docs/
│   └── screenshots/         # UI screenshots
├── .env.example             # Pre-configured for local development
└── README.md                # You are here
```

---

## Development

### Running Locally

```bash
# Install dependencies
npm install

# Start Supabase (in one terminal)
supabase start

# Start Ollama (in another terminal)
ollama serve

# Start development server (in third terminal)
npm run dev
```

Type checking and building:

```bash
# Type checking
npm run check

# Build for production
npm run build
```

### Database Changes

1. Modify the migration file or create a new one
2. Apply with Supabase CLI: `supabase db push`
3. Generate types: `supabase gen types typescript > src/lib/supabase-types.ts`

### Worker Development

The embedded worker polls the task queue and processes tasks locally:

- **Location**: `src/app/api/jobs/` (Next.js route handlers)
- **Configuration**: `WORKER_QUEUE_POLL_INTERVAL` environment variable (milliseconds)
- **Logs**: Available in `cron_logs` table in database

To modify worker behavior:

1. Edit the worker implementation in `src/app/api/jobs/`
2. Restart the development server
3. Changes take effect immediately on next poll cycle

### Archived Edge Functions

The `supabase/functions-archived/` directory contains the previous Edge Function implementations for reference. These are no longer deployed in the local-first architecture but can be useful for:

- Understanding the original workflow
- Migrating specific functionality
- Deploying to production if you prefer the hosted approach

See [supabase/migrations/README.md](supabase/migrations/README.md) for details on the migration.

---

## Roadmap

### 🔮 **Coming Soon**

- **Human Observations Agent**: An AI agent that analyzes human task patterns to:
  - Identify repetitive workflows that can be automated
  - Suggest optimizations for existing agents
  - Auto-generate new skills and tools based on observed behavior
  - Continuously improve agent performance through feedback loops

Want to contribute to the roadmap? [Open an issue](https://github.com/jlondrejcka/supaswarm/issues) with your ideas!

---

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Acknowledgments

- [Supabase](https://supabase.com) - The backend platform
- [Replit](https://replit.com) - Initial design and v1 development
- [Cursor](https://cursor.com) - Fine-tuning and iteration
- [shadcn/ui](https://ui.shadcn.com) - UI components
- [Lucide](https://lucide.dev) - Icons
- [Vercel](https://vercel.com) - Design inspiration

---

<p align="center">
  <strong>Built with ⚡ by <a href="mailto:joe@cloudbeast.io">Joe Ondrejcka</a></strong>
</p>
