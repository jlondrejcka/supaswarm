# SupaSwarm

## Overview

SupaSwarm is a Supabase-native multi-agent orchestration platform that enables developers to build observable and governed agentic workflows. The platform provides a dashboard interface for managing hierarchical tasks, configurable agents, tools, and skills with real-time observability. It's designed as a developer-focused monitoring and management system for AI agent workflows, built entirely on Supabase services (Postgres, Queues, Edge Functions, Storage, Realtime, Vault).

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: Next.js 14+ with App Router (pages in `src/app/`)
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS custom properties for theming (light/dark mode support)
- **State Management**: React hooks with TanStack React Query for server state
- **Typography**: Inter font for UI, JetBrains Mono for code/technical content

### Application Structure
- **Layout**: Fixed sidebar navigation (w-60) with main content area
- **Pages**: Dashboard, Tasks, Agents, Tools, Skills, Reviews, Settings
- **Components**: Reusable UI components in `src/components/ui/`, feature components in `src/components/`

### Data Layer
- **Database**: Supabase PostgreSQL with typed schema
- **ORM**: Drizzle ORM with Zod validation (drizzle-zod)
- **Type Safety**: Full TypeScript with generated Supabase types in `src/lib/supabase-types.ts`
- **Client**: Supabase JS client configured in `src/lib/supabase.ts`

### Design Patterns
- **Theming**: CSS custom properties with dark mode toggle via next-themes
- **Component Architecture**: Compound components pattern from Radix UI
- **Form Handling**: React Hook Form with Zod resolvers
- **Error States**: Graceful degradation with `SetupRequired` component when Supabase isn't configured

### Development Server
- Custom server script (`server/index.ts`) spawns Next.js dev server on port 5000
- Build process handled via custom script (`script/build.ts`)

## External Dependencies

### Supabase Services
- **PostgreSQL Database**: Primary data store with extensions (uuid-ossp, pgmq)
- **Supabase JS Client**: `@supabase/supabase-js` for database operations
- **Environment Variables Required**:
  - `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL (has default value)
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Anonymous API key (required for operation)

### Database Tables
- `tasks`: Hierarchical task tracking with status management
- `agents`: AI agent configurations with model/provider settings
- `tools`: Internal tools, MCP servers, HTTP APIs, Supabase RPCs
- `skills`: Agent skill definitions following Agent Skills standard
- `agent_tools`, `agent_skills`: Many-to-many relationships
- `human_reviews`: Human-in-the-loop review records
- `llm_providers`: LLM provider configurations

### Task Hierarchy (Three IDs)
The `tasks` table uses three IDs to track task relationships:

1. **`id`** - The unique record identifier for this task
2. **`parent_id`** - Reference to the immediate parent task (for subtasks). Used for step-by-step traversal up the task chain.
3. **`master_task_id`** - Reference to the root/original task that started the conversation. All subtasks in a chain share the same master_task_id. NULL for top-level tasks.

**Usage patterns:**
- **Chat history**: Query tasks where `master_task_id IS NULL` to get top-level conversations
- **Subtask navigation**: Use `parent_id` to traverse up one level in the hierarchy
- **Conversation grouping**: Use `master_task_id` to find all tasks belonging to the same conversation

### LLM Providers (configured via Vault)
- xAI (XAI_API_KEY)
- Anthropic (ANTHROPIC_API_KEY)
- Google AI (GOOGLE_AI_API_KEY)
- OpenAI (OPENAI_API_KEY)

## Development Requirements

### UI Testing Policy
**CRITICAL: Always test functionality in the UI before claiming it works.**

When implementing or fixing features:
1. Deploy/save code changes
2. Test the feature in the actual UI (via webview or browser)
3. Check logs and database state to verify success
4. Only then report success to the user

This applies especially to:
- Edge Function deployments - verify via actual API calls and check task status
- Form submissions - test the form actually works
- Chat/AI features - send a test message and verify response
- Database operations - query the database to confirm changes

Never assume a fix works without testing it end-to-end.

### UI Dependencies
- Radix UI primitives for accessible components
- Lucide React for icons
- date-fns for date formatting
- class-variance-authority for variant styling