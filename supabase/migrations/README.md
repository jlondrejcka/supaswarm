# Supabase Migrations - Local-First Architecture

## Overview

This directory contains all database migrations for the Supabase project. These migrations have been updated to support a **local-first architecture** where processing tasks are handled by an embedded Node.js worker instead of hosted Supabase Edge Functions.

## Architecture Changes

### Phase 6: Local-First Migration

The project has transitioned from a hosted edge function architecture to a local-first, embedded worker architecture:

#### Before (Hosted Edge Functions)
- Task processing triggered by database triggers
- `net.http_post()` calls to hosted Supabase Edge Functions
- External dependencies on cloud infrastructure
- Hardcoded URLs pointing to Supabase cloud

#### After (Embedded Worker)
- Task processing handled by embedded Node.js worker
- Application runs completely locally
- No external cloud function dependencies
- Dynamic URL resolution using PostgreSQL settings

## Key Changes in Migrations

### 1. Removed pg_cron Dependency
- **Why**: Scheduled jobs are now handled by the embedded worker
- **Status**: `pg_cron` extension still created (for backwards compatibility)
- **Location**: See `create extension if not exists "pg_cron"` in migrations

### 2. Removed pg_net Dependency
- **Why**: HTTP calls are now handled locally by the worker
- **Status**: `pg_net` extension still available (for backwards compatibility)
- **Note**: The embedded worker polls the database for pending tasks instead of using `net.http_post()`

### 3. Dynamic URL Configuration
- **Before**: Hard-coded URLs like `https://bgqxccmdcpegvbuxmnrf.supabase.co`
- **After**: Dynamic URL using `current_setting('app.supabase_url', true)`
- **Benefit**: Works seamlessly in local, staging, and production environments

Example migration snippet:
```sql
-- OLD (hard-coded)
v_base_url TEXT := 'https://bgqxccmdcpegvbuxmnrf.supabase.co';

-- NEW (dynamic)
v_base_url TEXT := current_setting('app.supabase_url', true) || '';
```

### 4. Task Queue Processing
- Tasks are stored in the `tasks` table with status tracking
- The embedded worker polls the queue at intervals defined by `WORKER_QUEUE_POLL_INTERVAL` (default: 2000ms)
- Task status transitions: `pending` → `processing` → `completed` or `failed`

## Slack Integration Changes

### Socket Mode Replaces Webhooks
- **Before**: Slack events triggered via webhook URL
- **After**: Slack Socket Mode enabled for reliable, bidirectional communication
- **Benefits**:
  - No need for public webhook URLs
  - Automatic reconnection on network disruption
  - Better event delivery reliability in local development
  - Works seamlessly with firewall/NAT

Configuration:
```env
SLACK_SOCKET_MODE_ENABLED=true
SLACK_APP_TOKEN=xapp-1-... (from Slack App)
```

## Local Development Setup

### Starting the Application

1. **Set environment variables** (.env.local):
   ```env
   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   NEXT_RUNTIME=nodejs
   OLLAMA_BASE_URL=http://localhost:11434/v1
   WORKER_QUEUE_POLL_INTERVAL=2000
   SLACK_SOCKET_MODE_ENABLED=true
   ```

2. **Start Supabase locally**:
   ```bash
   supabase start
   ```

3. **Start Ollama locally** (for LLM inference):
   ```bash
   ollama serve
   ```

4. **Run the application with embedded worker**:
   ```bash
   npm run dev
   ```

The embedded worker will:
- Poll the task queue every 2 seconds
- Process pending tasks using local LLM (Ollama)
- Update task status in the database
- Handle Slack interactions via Socket Mode

## Migration History

### Key Migration Files

- **20260214232055_remote_schema.sql**: Contains all schema, functions, and triggers
  - Updated for dynamic URL resolution
  - Task queue functions compatible with embedded worker
  - Slack integration triggers use Socket Mode

## Backwards Compatibility

These migrations maintain backwards compatibility:
- `pg_cron` extension still available for custom schedules
- `pg_net` extension still available for outbound HTTP calls
- Dynamic URL setting works with both local and cloud deployments
- Trigger-based architecture unchanged

## Future Considerations

- Custom triggers can still invoke external webhooks if needed
- Migration to fully managed queuing system (e.g., pg_queue) could replace current implementation
- Distributed worker support could be added with queue persistence

## References

- [Local-First Architecture Documentation](../README.md#local-development)
- [Environment Configuration](../.env.example)
- [Supabase Configuration](./config.toml)
