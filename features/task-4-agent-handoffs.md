# Task 4: Agent Handoffs

**Branch:** `task-4-agent-handoffs`  
**Created:** 2025-12-29  
**Status:** Planning

## Overview

Implement swarm-style agent handoffs where agents can transfer conversation control to other agents via tool calls. The handoff preserves context variables, conversation history, and creates a new task for the target agent.

## Current State Analysis

### Existing Schema
- `tasks` table has `master_task_id` and `parent_id` for hierarchy
- `tasks.input` is JSONB (stores `{message: string}`)
- `tasks.intermediate_data` is JSONB (stores execution logs)
- `agents` table has `id`, `slug`, `name`, `system_prompt`
- Task messages track conversation with types: user_message, assistant_message, tool_call, etc.

### Missing
- `tasks.context` JSONB field for context variables
- `handoff` tool type in tools table
- `handoff` message type in task_messages
- Tools page UI for creating handoff tools
- UI for "Routed to X Agent" display in chat

## Implementation Plan

### Phase 1: Schema Updates

1. **Add `context` column to tasks table**
   ```sql
   ALTER TABLE public.tasks ADD COLUMN context jsonb DEFAULT '{}'::jsonb;
   ```
   Purpose: Store context variables passed during handoffs

2. **Add `handoff` to tool types**
   ```sql
   ALTER TABLE public.tools 
   DROP CONSTRAINT tools_type_check;
   
   ALTER TABLE public.tools 
   ADD CONSTRAINT tools_type_check 
   CHECK (type = ANY (ARRAY['internal', 'mcp_server', 'http_api', 'supabase_rpc', 'handoff']));
   ```

3. **Add `handoff` message type**
   ```sql
   ALTER TABLE public.task_messages 
   DROP CONSTRAINT task_messages_type_check;
   
   ALTER TABLE public.task_messages 
   ADD CONSTRAINT task_messages_type_check 
   CHECK (type = ANY (ARRAY['user_message', 'assistant_message', 'thinking', 'tool_call', 'tool_result', 'skill_load', 'subtask_created', 'error', 'status_change', 'handoff']));
   ```

### Phase 2: Handoff Tool Type

1. **New tool type: `handoff`**
   - Users create handoff tools via Tools page
   - Each handoff tool targets a specific agent
   - Define required context variables per handoff
   - Include description/instructions for when to use

2. **Tools table config for handoff type**
   ```json
   {
     "target_agent_id": "uuid",
     "target_agent_slug": "string",
     "context_variables": [
       {
         "name": "lead_id",
         "type": "string",
         "required": true,
         "description": "The ID of the lead to hand off"
       },
       {
         "name": "campaign_type",
         "type": "string",
         "required": false,
         "description": "Which outreach campaign to add to"
       }
     ],
     "handoff_instructions": "Additional context for the target agent"
   }
   ```

3. **Example Handoff Tools**
   
   | Tool Name | Target Agent | Context Variables |
   |-----------|--------------|-------------------|
   | handoff_to_sdr | sdr-agent | lead_id (req), campaign_type (opt) |
   | handoff_to_translator | translator-agent | target_language (req), text (req) |
   | handoff_to_support | support-agent | ticket_id (req), priority (opt) |

4. **Tool appears to LLM as:**
   ```json
   {
     "type": "function",
     "function": {
       "name": "handoff_to_sdr",
       "description": "Hand off to SDR Agent for sales outreach. Use when a qualified lead needs follow-up.",
       "parameters": {
         "type": "object",
         "properties": {
           "lead_id": {
             "type": "string",
             "description": "The ID of the lead to hand off"
           },
           "campaign_type": {
             "type": "string",
             "description": "Which outreach campaign to add to"
           }
         },
         "required": ["lead_id"]
       }
     }
   }
   ```

### Phase 3: Process-Task Edge Function Updates

1. **Detect handoff tool type** when building tool definitions
   - Check `tool.type === 'handoff'`
   - Build parameters from `config.context_variables`
   - Include tool description + handoff_instructions

2. **Handle handoff tool execution**:
   - Detect tool is handoff type (tool.type === 'handoff')
   - Extract context variables from tool args
   - Validate target agent exists (from tool.config.target_agent_id)
   - Log handoff message to task_messages
   - Create new task with:
     - Same `master_task_id` (or current task.id if first in chain)
     - Current task as `parent_id`
     - Target agent's `agent_id`/`agent_slug` from tool config
     - Context variables merged into `context` field
     - Input with original message
   - Set current task status to `completed`
   - Return handoff confirmation (no synthesis needed)
   - New task triggers via queue/cron

3. **Pass context to target agent**:
   - Inject context variables into system prompt
   - Format: "Context from handoff: {key}: {value}"
   - Include handoff_instructions from tool config

### Phase 4: UI Updates

1. **Tools page - Handoff tool creation**
   - Add "handoff" to tool type dropdown
   - When type=handoff, show:
     - Target agent selector (dropdown of active agents)
     - Context variables builder (name, type, required, description)
     - Handoff instructions textarea
   - Hide MCP/HTTP config fields for handoff type

2. **New message type: handoff**
   - Icon: ArrowRightLeft (lucide)
   - Color: cyan/teal
   - Display: "Routed to {Agent Name}"
   - Show context variables passed

3. **Chat dialog updates**:
   - Display handoff messages inline
   - Show which agent is currently processing
   - Visual indicator of agent switches in conversation

4. **Task detail page**:
   - Show handoff chain visually
   - Display context variables passed

## Data Flow

```
User Message → Task (Agent A)
    ↓
Agent A processes → calls handoff_to_sdr({lead_id: "123", campaign_type: "outreach"})
    ↓
Detect handoff tool → Extract context variables
    ↓
Log handoff message → Create new Task (SDR Agent) with context
    ↓
Current task: completed → New task: pending → triggers process-task
    ↓
SDR Agent receives: message + context + conversation history + handoff_instructions
    ↓
SDR Agent responds (or hands off again)
```

## Context Variable Handling

```typescript
interface TaskContext {
  // Handoff metadata (auto-populated)
  _handoff_from?: string;           // slug of agent that handed off
  _handoff_tool?: string;           // name of handoff tool used
  _handoff_instructions?: string;   // instructions from tool config
  _handoff_chain?: string[];        // all agents in chain
  
  // User-defined context (from handoff tool params)
  lead_id?: string;
  campaign_type?: string;
  // ... any context variables defined in tool config
  [key: string]: unknown;
}
```

### Context Merge Strategy
When a handoff occurs, context is merged:
1. Previous task context (if any)
2. New context variables from handoff tool call
3. Handoff metadata (_handoff_from, _handoff_tool, etc.)

## Files to Modify

1. **Schema Migration** - `supabase/migrations/task-4-*.sql`
2. **Edge Function** - `supabase/functions/process-task/index.ts`
3. **Edge Function Types** - `supabase/functions/process-task/types.ts`
4. **Task Logger** - `supabase/functions/process-task/task-logger.ts`
5. **Frontend Types** - `src/lib/supabase-types.ts`
6. **Tools Page** - `src/app/tools/page.tsx` (handoff tool creation UI)
7. **Chat Dialog** - `src/components/chat-dialog.tsx`
8. **Task Message Thread** - `src/components/task-message-thread.tsx`

## Task Checklist

- [x] Add `context` column to tasks table
- [x] Add `handoff` to tool types constraint
- [x] Add `handoff` message type constraint
- [x] Update tools page UI for handoff type
- [x] Build handoff tool definitions in process-task
- [x] Handle handoff tool execution in process-task
- [x] Create child task on handoff
- [x] Pass context to target agent
- [x] Update task-logger for handoff messages
- [x] Update chat-dialog UI for handoffs
- [x] Update task-message-thread for handoffs
- [x] Update TypeScript types
- [ ] Test end-to-end handoff flow

## Unresolved Questions

1. max handoff depth? prevent infinite loops?
2. should prev context merge with new or replace?
3. pass original user message as-is or reformat with context?

## Notes

- Handoff is a user-defined tool type (not auto-injected)
- Each handoff tool targets a specific agent
- Context variables defined per handoff tool
- Context accumulates across handoffs (merge strategy)
- Conversation history already works via master_task_id

---

## Progress Log

### 2025-12-29

- Created branch task-4-agent-handoffs
- Analyzed existing schema and codebase
- Created implementation plan
- Revised plan: user-defined handoff tools instead of auto-injected
  - Users create handoff tools with target agent + context variables
  - Example: handoff_to_sdr requires lead_id, optional campaign_type

**Implementation completed:**
- Applied migration: added `context` column, `handoff` tool type, `handoff` message type
- Updated Tools page: full UI for creating handoff tools w/ target agent & context vars
- Updated process-task Edge Function:
  - Build handoff tool definitions from context_variables
  - Execute handoff: create child task, log handoff, trigger new task
  - Inject handoff context into target agent's system prompt
- Updated task-logger: added `logHandoff` method
- Updated chat-dialog & task-message-thread: display handoff messages w/ teal styling
- Updated TypeScript types: HandoffToolConfig, TaskContext, MessageType
- Deployed Edge Function v28

**Bug fix:**
- Fixed: Chat UI now subscribes to new task INSERTs for handoff tasks via master_task_id match
  - Previously, handoff tasks were created server-side but UI didn't track them
  - Now UI automatically picks up new tasks in same conversation and displays their messages

### 2025-12-30

**Bug investigation & fix:**
- Issue: Handoff tasks stuck in `pending` status
- Root cause analysis:
  1. `invokeProcessTask()` function calling itself via fetch with service role key was failing 401
  2. This duplicate invocation was unnecessary - queue trigger + cron already handles new tasks
- Fix: Removed `invokeProcessTask()` function and all calls to it
  - Parallel tasks now rely on queue trigger + cron (correct behavior)
  - Handoff tasks now rely on queue trigger + cron (correct behavior)
- Changes made to `supabase/functions/process-task/index.ts`:
  - Removed `invokeProcessTask()` function definition (lines 17-37)
  - Removed call in parallel task creation (line 647)  
  - Removed call in handoff task creation (line 811)

**DEPLOYMENT NEEDED:**
- Edge Function changes are local only - need to deploy via:
  - Supabase CLI: `npx supabase functions deploy process-task --project-ref bgqxccmdcpegvbuxmnrf`
  - Or via Supabase Dashboard: Edge Functions > process-task > Deploy

