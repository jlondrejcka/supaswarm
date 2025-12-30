# Task 6: Parallel Task Coordination

**Branch:** `task-6-parallel-coordination`  
**Created:** 2025-12-30  
**Status:** Complete

## Overview

Database-driven parallel task coordination with human-in-the-loop for failures:
- Parallel tasks flagged with `is_parallel_task`
- Aggregator tasks wait via `queued` status
- Failed tasks escalate to human review with retry/abort/manual options
- DB trigger activates aggregator when all dependencies complete

## Implementation Tasks

- [x] Schema migration (columns, status, trigger, indexes)
- [x] Add create_aggregator_task built-in tool
- [x] Handle parallel task failure → needs_human_review
- [x] Aggregator fetches and injects dependent task outputs
- [x] Review UI for retry/abort/manual actions

## Changes Made

### Database Schema (`task-6-2025-12-30-parallel-coordination.sql`)
- `is_parallel_task` boolean column on tasks
- `dependent_task_ids` uuid[] column on tasks
- `queued` added to status check constraint
- GIN index on `dependent_task_ids` for lookups
- `check_aggregator_dependencies()` trigger function
- Trigger fires on task status update → activates aggregator when all deps complete

### Edge Function (`process-task`)
- Added `create_parallel_task` built-in tool
- Added `create_aggregator_task` built-in tool
- Parallel results injection for aggregator tasks
- Parallel task failure escalation to human review

### Frontend (`src/app/reviews/page.tsx`)
- Retry/Abort/Manual buttons for parallel task failures
- Error display from review response
- Manual input dialog for human override

### Types Updated
- `supabase/functions/process-task/types.ts` - Task, TaskContext, ParallelTaskResult
- `src/lib/supabase-types.ts` - TaskStatus, Task Row

## Progress Log

### 2025-12-30
- Created branch task-6-parallel-coordination
- Applied migration to Supabase
- Updated types
- Added built-in tools and handlers
- Added parallel results injection
- Added parallel task failure handling
- Updated reviews UI with retry/abort/manual
- Deployed edge function v31

