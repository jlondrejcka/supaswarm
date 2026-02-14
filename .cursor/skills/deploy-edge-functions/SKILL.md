---
name: deploy-edge-functions
description: Deploy Supabase Edge Functions. Use when deploying process-task or other functions, when Docker mount fails, or when updating edge function code.
---

# Deploy Edge Functions

## Project config

- **project_id**: `bgqxccmdcpegvbuxmnrf`
- **project_url**: `https://bgqxccmdcpegvbuxmnrf.supabase.co`

Schema, functions, triggers: create locally, deploy via Supabase MCP `apply_migration`.

## Deploy command

```bash
supabase functions deploy process-task --project-ref bgqxccmdcpegvbuxmnrf --use-api
```

**Always use `--use-api`** — avoids Docker mount errors (`mkdir /host_mnt/... operation not permitted`). Bundles server-side instead of locally.

## Deploy all functions

```bash
supabase functions deploy --project-ref bgqxccmdcpegvbuxmnrf --use-api
```

## Common functions

| Function | Purpose |
|----------|---------|
| `process-task` | Main task processor; LLM calls, tools, skills, delegation |
| `process-scheduled-jobs` | Cron: picks up pending tasks for job sessions |
| `process-pending-tasks` | Polls for pending tasks |
| `slack-events` | Slack event handler |
| `slack-reply` | Slack reply/thread handler |

## Verify deployment

Dashboard: https://supabase.com/dashboard/project/bgqxccmdcpegvbuxmnrf/functions

## Local serve (dev)

```bash
supabase functions serve process-task --env-file .env
```
