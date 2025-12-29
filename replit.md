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

### LLM Providers (configured via Vault)
- xAI (XAI_API_KEY)
- Anthropic (ANTHROPIC_API_KEY)
- Google AI (GOOGLE_AI_API_KEY)
- OpenAI (OPENAI_API_KEY)

### UI Dependencies
- Radix UI primitives for accessible components
- Lucide React for icons
- date-fns for date formatting
- class-variance-authority for variant styling