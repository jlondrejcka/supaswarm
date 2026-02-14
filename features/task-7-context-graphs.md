# Task 7: Context Graphs Integration

## Branch: task-7-context-graphs
## Date: 2026-01-04

## Overview
Implement a Context Graphs feature for Supaswarm using a proper nodes+edges graph model, auto-triggering node creation for all entities, incremental real-time summaries per conversation, and pgvector with Supabase-native gte-small embeddings for semantic search.

## Key Design Decisions
- Graph Model: Nodes + Edges tables (extensible)
- Node Creation: Auto via Postgres trigger
- Vector Storage: pgvector (local, Supabase-native)
- Embedding Model: gte-small (384 dims, built-in)
- Summary Scope: Per master_task_id (conversation)
- Summary Strategy: Incremental (rolling, real-time)

## Tasks

### Phase 1: Schema & Data Model
- [x] Create graph_nodes table
- [x] Create graph_edges table
- [x] Add graph_node_id FK to entity tables
- [x] Create node auto-creation triggers
- [x] Create context_stories table
- [x] Enable pgvector and create HNSW index
- [x] Create context update queue and triggers
- [x] Set up pg_cron job
- [x] Create match_context_stories function

### Phase 2: Edge Functions
- [ ] Create process-context-batch Edge Function
- [ ] Implement Grok summarization logic
- [ ] Implement gte-small embedding generation
- [ ] Modify process-task for graph edge creation

### Phase 3: Agent Tools
- [ ] Add query_context built-in tool

### Phase 4: Dashboard
- [ ] Create /context-graphs page

### Phase 5: Types
- [ ] Update supabase-types.ts

## Progress Log

### 2026-01-04
- Created branch task-7-context-graphs
- Created migration file with full schema
