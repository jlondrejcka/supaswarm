# Process Task Port - Testing & Deployment Guide

## Quick Start

### 1. Verify Installation
```bash
cd /Users/joe-studio/Documents/Workspace/supaswarm

# Check files exist
ls -la src/lib/engine/process-task.ts
ls -la src/lib/engine/llm-providers.ts
```

### 2. Verify Exports
```bash
# Verify all exports are present
grep "^export" src/lib/engine/process-task.ts
grep "^export" src/lib/engine/llm-providers.ts
```

### 3. Integration Tests
```bash
# Once you have test infrastructure set up:
npm test -- src/lib/engine/process-task.test.ts
npm test -- src/lib/engine/llm-providers.test.ts
```

## Implementation Checklist

### ✅ Core Agentic Loop
- [x] Task fetching from database
- [x] Status validation (pending/pending_subtask)
- [x] Atomic status update to "running"
- [x] Conversation history loading
- [x] Agent/provider/tools/skills loading
- [x] System prompt building with context
- [x] Multi-turn LLM loop (max 10 iterations)
- [x] Tool call parsing and execution
- [x] Tool result injection into message history
- [x] Loop termination (no tools or max iterations)
- [x] Task completion with token tracking
- [x] Error escalation to human review

### ✅ LLM Providers
- [x] OpenAI-compatible (OpenAI, xAI, Ollama)
- [x] Anthropic (claude-3-* models)
- [x] Google AI (Gemini models)
- [x] Tool calling for all providers
- [x] Error handling per provider

### ✅ Tool Types
- [x] load_skill (pseudo-tool)
- [x] create_parallel_task (built-in)
- [x] create_aggregator_task (built-in)
- [x] ask_session (built-in)
- [x] spawn/handoff (delegation)
- [x] MCP server tools
- [x] HTTP API tools
- [x] Supabase RPC tools
- [x] Self-management tools (Rick)

### ✅ Features
- [x] Token usage tracking
- [x] Delegation depth limiting (max 3)
- [x] Spawn result injection
- [x] Parallel task results aggregation
- [x] Approval result resumption
- [x] Full message logging
- [x] Skill instructions injection
- [x] Context variable passing
- [x] Error categorization
- [x] Human review escalation

## Test Scenarios

### Scenario 1: Simple Task (No Tools)
```typescript
// Task: "What is the capital of France?"
// Expected: Direct LLM response, no tool calls
// Verify: Response logged, task completed, no tools called
```

### Scenario 2: Single Tool Call
```typescript
// Task: Load a skill and use it
// Expected: LLM calls load_skill, receives instructions
// Verify: Skill loaded, injected into context, LLM responds
```

### Scenario 3: Multi-Turn Tool Loop
```typescript
// Task with multiple tool calls in sequence
// Expected: LLM loops, calling tools, getting results
// Verify: All tool results logged, token usage accumulates
```

### Scenario 4: Parallel Task Execution
```typescript
// Task: Create 3 parallel tasks, then aggregate
const parallel1 = create_parallel_task(agentB, "task1")
const parallel2 = create_parallel_task(agentC, "task2")
const parallel3 = create_parallel_task(agentD, "task3")
const aggregator = create_aggregator_task(
  agentE,
  [parallel1, parallel2, parallel3],
  "synthesize results"
)
// Verify: All tasks created, aggregator queued
```

### Scenario 5: Delegation with Depth Limiting
```typescript
// Task: Agent A delegates to B, B delegates to C, C delegates to D
// Expected: Depth limit error on 4th delegation (max 3)
// Verify: Error logged, task fails appropriately
```

### Scenario 6: Session Follow-ups
```typescript
// Task: Send follow-up to existing session
const result = ask_session(session_id, "follow-up question")
// Verify: New task created in session, parent suspends
```

### Scenario 7: Error Escalation
```typescript
// Task: Tool execution fails
// Expected: Error handler escalates to human review
// Verify: Task status "needs_human_review", review record created
```

### Scenario 8: Approval Result Resumption
```typescript
// Task: Resume from blocking approval
// Expected: Approval result injected into context
// Verify: Task continues, approval context present
```

### Scenario 9: MCP Tool Execution
```typescript
// Task: Call tool from MCP server
// Expected: MCP initialization, tool call, result returned
// Verify: Tool result logged, MCP session handled
```

### Scenario 10: HTTP API Tool
```typescript
// Task: Call HTTP API tool
// Expected: Tool makes HTTP request
// Verify: Response status and content logged
```

### Scenario 11: Supabase RPC Tool
```typescript
// Task: Call Supabase RPC function
// Expected: Function executed with args
// Verify: Result or error logged
```

### Scenario 12: Anthropic Provider
```typescript
// Task: Use Anthropic provider
// Expected: LLM call uses Anthropic API
// Verify: Tool use blocks parsed, responses correct
```

### Scenario 13: Google AI Provider
```typescript
// Task: Use Google AI provider
// Expected: LLM call uses Gemini API
// Verify: Function calls parsed, responses correct
```

### Scenario 14: Skill Loading
```typescript
// Task: Load and use a skill
// Expected: Skill instructions loaded and injected
// Verify: Instructions present in system prompt
```

### Scenario 15: Self-Management Tool (Rick)
```typescript
// Task: Rick agent calls manage_soul
// Expected: Self-management tool executed
// Verify: Result returned appropriately
```

## Database Setup Verification

Before deploying, verify these tables and functions exist:

```sql
-- Tables
SELECT 'tasks' as table_name; -- id, status, agent_id, input, output, etc.
SELECT 'agents' as table_name; -- id, slug, system_prompt, provider_id, role
SELECT 'llm_providers' as table_name; -- id, name, base_url, default_model
SELECT 'tools' as table_name; -- id, slug, type, config, credential_secret_name
SELECT 'agent_tools' as table_name; -- agent_id, tool_id
SELECT 'skills' as table_name; -- id, skill_id, instructions
SELECT 'agent_skills' as table_name; -- agent_id, skill_id
SELECT 'task_messages' as table_name; -- task_id, role, type, content
SELECT 'human_reviews' as table_name; -- task_id, response
SELECT 'sessions' as table_name; -- id, agent_id, spawn_depth

-- Functions/RPC
SELECT 'complete_task' as function_name; -- p_task_id, p_output, p_intermediate_data
SELECT 'increment_session_tokens' as function_name; -- p_session_id, p_tokens_input, p_tokens_output
SELECT 'get_vault_secret' as function_name; -- secret_name
```

## Environment Setup

### Required Environment Variables
```bash
# Supabase
export SUPABASE_URL="https://project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="xxx"
export NEXT_PUBLIC_SUPABASE_URL="https://project.supabase.co"

# Node.js
export NODE_ENV="production"
export NODE_VERSION="18+"
```

### Required Vault Secrets (Supabase Vault)
```
OPENAI_API_KEY          # For OpenAI models
ANTHROPIC_API_KEY       # For Claude models
GOOGLE_AI_API_KEY       # For Gemini models
XAI_API_KEY             # For xAI Grok
```

## Monitoring & Observability

### Logging Locations
1. **Console Logs** - `[MAIN]`, `[LLM]`, `[MCP]`, `[TASK]`, `[ERROR_HANDLER]`
2. **task_messages Table** - Full execution history with types, roles, metadata
3. **Task Output** - Final response and token usage
4. **Task Intermediate Data** - Execution log with timing

### Key Metrics to Track
```typescript
// Token usage
totalTaskTokensInput: number
totalTaskTokensOutput: number
total_tokens: number (input + output)

// Execution
iteration: number (current loop iteration)
tool_calls_count: number
total_duration_ms: number
started_at: ISO timestamp
completed_at: ISO timestamp

// Tools
tool_call_count: number
tool_success_rate: number
avg_tool_duration_ms: number

// Delegation
delegation_count: number
max_spawn_depth: number (should be ≤ 3)
avg_spawn_result_time_ms: number

// Errors
error_count: number
human_review_escalations: number
error_category_distribution: Record<string, number>
```

### Dashboard Queries
```sql
-- Token usage by agent
SELECT agent_slug, SUM(tokens_input) as input, SUM(tokens_output) as output
FROM tasks
WHERE status = 'completed'
GROUP BY agent_slug
ORDER BY input + output DESC;

-- Average task duration
SELECT AVG(duration_ms) as avg_ms, MAX(duration_ms) as max_ms
FROM tasks
WHERE status = 'completed' AND duration_ms IS NOT NULL;

-- Tool execution success rate
SELECT 
  tool_name,
  COUNT(*) as total_calls,
  SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful
FROM task_messages
WHERE type = 'tool_result'
GROUP BY tool_name;

-- Error escalation trend
SELECT 
  DATE(created_at) as date,
  COUNT(*) as escalations
FROM human_reviews
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

## Performance Tuning

### Connection Pool
```typescript
// Consider increasing pool size for high concurrency
const supabase = createClient(url, key, {
  db: {
    schema: "public",
  },
  auth: { autoRefreshToken: false, persistSession: false },
});
```

### LLM Tuning
```typescript
// Adjust for performance vs cost
- model: "gpt-4-turbo" (faster) vs "gpt-4" (accurate)
- max_tokens: 4096 (current) - adjust per use case
- temperature: varies by provider setup
```

### Tool Caching
```typescript
// Consider caching MCP tool definitions
// Cache TTL: Tool definitions rarely change
// Key: `mcp_tools_${toolId}`
```

### Database Indexing
```sql
-- Recommended indexes
CREATE INDEX idx_tasks_session_id ON tasks(session_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_agent_id ON tasks(agent_id);
CREATE INDEX idx_task_messages_task_id ON task_messages(task_id);
CREATE INDEX idx_task_messages_created_at ON task_messages(created_at);
CREATE INDEX idx_human_reviews_task_id ON human_reviews(task_id);
```

## Deployment Checklist

- [ ] All environment variables set
- [ ] Supabase Vault secrets configured
- [ ] Database schema verified
- [ ] RPC functions deployed
- [ ] Indexes created on database
- [ ] Error monitoring configured (Sentry/DataDog)
- [ ] Logging aggregation set up (CloudWatch/ELK)
- [ ] Rate limiting in place
- [ ] Backup strategy verified
- [ ] Load testing completed
- [ ] Rollback plan documented

## Troubleshooting

### Issue: "Task not found"
- **Check**: Task ID exists in database
- **Check**: Service role key has read permissions
- **Solution**: Verify task was created before calling process-task

### Issue: "No agent found"
- **Check**: Agent exists with is_default = true OR task.agent_id is set
- **Solution**: Create default agent or assign agent to task

### Issue: "No LLM provider found"
- **Check**: Provider exists with is_active = true
- **Solution**: Create and activate an LLM provider

### Issue: "API key not found"
- **Check**: Vault secret exists with correct name
- **Solution**: Add API key to Supabase Vault

### Issue: Tool calls not working
- **Check**: Tool is active (is_active = true)
- **Check**: Tool is linked to agent (agent_tools table)
- **Solution**: Create agent_tools link record

### Issue: MCP tools not available
- **Check**: MCP server endpoint configured in tool.config.mcp_url
- **Check**: Tool config has tools array populated (run verify-mcp first)
- **Solution**: Ensure verify-mcp has run for the MCP server

### Issue: Token usage not tracked
- **Check**: complete_task RPC function is called
- **Check**: increment_session_tokens RPC function exists
- **Solution**: Verify RPC functions are deployed

### Issue: Delegation not working
- **Check**: Target agent exists
- **Check**: Spawn depth < MAX_SPAWN_DEPTH (3)
- **Solution**: Check delegation error in task output

## Success Criteria

✅ Task Processing is successful when:
1. Task status transitions: pending → running → completed
2. Final response is populated in task.output.response
3. Token usage is tracked: task.tokens_input, task.tokens_output
4. All messages logged to task_messages table
5. Total_duration_ms is recorded
6. Tool calls (if any) executed successfully
7. For delegations: child task created and invoked

## Support & Documentation

- **Code**: See inline comments throughout process-task.ts
- **Types**: See types.ts for all interfaces
- **Examples**: See PROCESS_TASK_PORT_SUMMARY.md for usage patterns
- **Original**: Reference supabase/functions/process-task/index.ts for Deno version

## What's Next After Deployment

1. **Monitor** token usage and costs
2. **Optimize** LLM model selection per agent
3. **Scale** with database indexes and connection pooling
4. **Extend** with custom tool types as needed
5. **Integrate** with your observability platform
