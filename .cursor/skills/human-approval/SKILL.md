---
name: human-approval
description: Hybrid human approval architecture for Rick's self-management tools. Use when implementing approval flows, creating approval_requests, handling blocking vs async approvals, or building approval UI/Slack integration.
---

# Human Approval Architecture

All 9 self-management tools are **exclusive to Rick** (`agent.role === 'system'`). Other agents get zero self-management tools. Some of Rick's tools are self-serve, some require human approval via a hybrid pattern: blocking (task suspends) for resources Rick needs immediately, async (task continues) for background resources.

## Who is Rick

Rick is the system admin agent, seeded on fresh install. Character: Rick Sanchez from Rick and Morty. Follows Elon's 5-step optimization algorithm. Guides initial setup, handles all system changes via spawned sessions. See the self-management plan for full Rick spec.

## Tool Classification

All tools below are Rick-only. `agent.role === 'system'` is the gate in `process-task/index.ts`.

### Self-Serve (no approval)

| Tool | Reason |
|------|--------|
| `manage_soul` | Identity data in context graph, no execution risk |
| `manage_memory` | Memory nodes in context graph, no execution risk |
| `manage_skills` | Instruction sets, not executable code |
| `log_activity` | Read/write activity feed, informational only |
| `notify_agent` | Inter-agent messages, informational only |

### Blocking Approval (task suspends until human acts)

| Tool | Gated actions | Why blocking |
|------|---------------|-------------|
| `manage_tools` | create, update | Rick likely needs the tool in current task |
| `manage_agents` | create, update | Rick likely needs to delegate immediately |

### Async Approval (task continues, agent notified later)

| Tool | Gated actions | Why async |
|------|---------------|----------|
| `manage_crons` | create, update, delete | Background scheduling, never needed in-task |
| `manage_code_files` | deploy | Deployment has inherent latency, never instant |

Free actions (no approval): `list`, `get`, `read`, `assign`, `unassign`, `write` (code files draft)

---

## Database Schema

### `approval_requests` Table

```sql
CREATE TABLE approval_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'create_tool', 'update_tool', 'create_cron', 'update_cron',
    'delete_cron', 'create_agent', 'update_agent', 'deploy_function'
  )),
  resource_table TEXT NOT NULL,
  resource_id UUID NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_approval_requests_status ON approval_requests(status) WHERE status = 'pending';
CREATE INDEX idx_approval_requests_agent ON approval_requests(agent_id);
```

Key design choices:
- `task_id` is `ON DELETE SET NULL` (not CASCADE) so approvals survive task deletion
- `resource_table` + `resource_id` point to the exact resource to activate
- `status` is an enum, not a nullable boolean

### Approval Trigger

Fires when `status` changes from `pending` to `approved` or `rejected`:

```sql
CREATE FUNCTION handle_approval_status_change() RETURNS trigger AS $$
DECLARE
  allowed_tables TEXT[] := ARRAY['tools', 'agent_crons', 'agents', 'deployed_functions'];
BEGIN
  IF NEW.status IN ('approved', 'rejected') AND OLD.status = 'pending' THEN
    NEW.reviewed_at := NOW();

    IF NEW.status = 'approved' THEN
      -- Allowlist check for dynamic SQL
      IF NEW.resource_table = ANY(allowed_tables) THEN
        EXECUTE format('UPDATE public.%I SET is_active = true WHERE id = %L',
                       NEW.resource_table, NEW.resource_id);
      END IF;
    END IF;

    -- For blocking approvals: resume the suspended task
    IF NEW.task_id IS NOT NULL THEN
      UPDATE public.tasks SET
        intermediate_data = COALESCE(intermediate_data, '{}'::jsonb) ||
          jsonb_build_object('approval_result', jsonb_build_object(
            'approval_id', NEW.id,
            'action_type', NEW.action_type,
            'status', NEW.status,
            'review_notes', NEW.review_notes
          )),
        status = CASE
          WHEN status = 'needs_human_review' THEN 'pending'
          ELSE status
        END
      WHERE id = NEW.task_id;
    END IF;

    -- Notify the agent
    INSERT INTO notifications (agent_id, type, title, body, metadata)
    VALUES (
      NEW.agent_id,
      'approval_' || NEW.status,
      initcap(replace(NEW.action_type, '_', ' ')) || ' ' || NEW.status,
      COALESCE(NEW.review_notes, ''),
      jsonb_build_object('approval_id', NEW.id, 'resource_id', NEW.resource_id)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_approval_status_change
  BEFORE UPDATE ON approval_requests
  FOR EACH ROW
  EXECUTE FUNCTION handle_approval_status_change();
```

---

## Blocking Pattern (tools, agents)

Used when the agent needs the resource to continue its current workflow.

### Flow

```
1. Handler creates resource (is_active=false)
2. Handler inserts approval_requests (status=pending)
3. Handler returns { result, needsApproval: true, blocking: true }
4. index.ts stores in intermediate_data.pending_approval
5. index.ts sets task status = needs_human_review
6. index.ts exits tool loop (task suspends)
```

### Handler Example

```typescript
// In self-management-tools.ts
async function handleManageTools(args, ctx) {
  if (args.action === "create") {
    const { data: tool } = await ctx.supabase.from("tools")
      .insert({ ...toolData, is_active: false, created_by: ctx.agentId })
      .select().single();

    await ctx.supabase.from("approval_requests").insert({
      agent_id: ctx.agentId,
      task_id: ctx.taskId,
      session_id: ctx.sessionId,
      action_type: "create_tool",
      resource_table: "tools",
      resource_id: tool.id,
      payload: { name: args.name, type: args.type, config: args.config }
    });

    return { result: `Tool "${args.name}" created (pending approval)`, needsApproval: true, blocking: true };
  }
  // list, get, assign, unassign — no approval
}
```

### Caller in index.ts

```typescript
if (SELF_MANAGEMENT_TOOLS.includes(toolName)) {
  const { result, needsApproval, blocking } = await handleSelfManagementTool(toolName, toolArgs, ctx);
  toolResult = result;

  if (needsApproval && blocking) {
    await logger.logToolResult(toolName, toolCall.id, result, Date.now() - toolCallStart);
    await supabase.from("tasks").update({
      status: "needs_human_review",
      intermediate_data: {
        ...task.intermediate_data,
        pending_approval: { tool: toolName, args: toolArgs }
      }
    }).eq("id", task_id);
    break; // Exit tool loop
  }
}
```

### Resumption on Approval

When human approves, the DB trigger sets task back to `pending`. On re-invocation, `process-task` checks for approval results and injects into system prompt:

```typescript
// Near top of process-task, after fetching task
const approvalResult = task.intermediate_data?.approval_result;
if (approvalResult) {
  task.context = {
    ...task.context,
    _approval_result: `Previous request (${approvalResult.action_type}) was ${approvalResult.status}.${
      approvalResult.review_notes ? ' Notes: ' + approvalResult.review_notes : ''
    } Continue with your task.`
  };
  // Clear so it doesn't re-trigger
  await supabase.from("tasks").update({
    intermediate_data: { ...task.intermediate_data, approval_result: null }
  }).eq("id", task_id);
}
```

The existing context injection in the system prompt builder handles `_approval_result` automatically since it processes all `_` prefixed context keys.

---

## Async Pattern (crons, deploys)

Used when the agent does NOT need the resource immediately.

### Flow

```
1. Handler creates resource (is_active=false)
2. Handler inserts approval_requests (status=pending)
3. Handler returns { result, needsApproval: true, blocking: false }
4. index.ts uses result as normal tool output
5. Task continues — agent sees "pending approval" in tool result
6. On approval: DB trigger activates resource + inserts notification
7. Agent learns outcome on next heartbeat or task
```

### Handler Example

```typescript
async function handleManageCrons(args, ctx) {
  if (args.action === "create") {
    const { data: cron } = await ctx.supabase.from("agent_crons")
      .insert({ ...cronData, is_active: false, agent_id: ctx.agentId })
      .select().single();

    await ctx.supabase.from("approval_requests").insert({
      agent_id: ctx.agentId,
      task_id: ctx.taskId,
      session_id: ctx.sessionId,
      action_type: "create_cron",
      resource_table: "agent_crons",
      resource_id: cron.id,
      payload: { name: args.cron_name, schedule: args.cron_schedule, type: args.cron_type }
    });

    return {
      result: `Cron "${args.cron_name}" created (inactive, pending human approval). You'll be notified when approved.`,
      needsApproval: true,
      blocking: false
    };
  }
}
```

### Caller in index.ts

No special logic — the non-blocking path just assigns the result:

```typescript
if (needsApproval && !blocking) {
  // Task continues normally — result says "pending approval"
  toolResult = result;
}
```

---

## Multi-Channel Approval

All channels perform the same DB update: `UPDATE approval_requests SET status = 'approved'`. The trigger handles everything else.

### 1. `/approvals` Page (dedicated UI)

Queries `approval_requests WHERE status = 'pending'`. Shows resource details from `payload` JSONB. Approve/reject buttons update the `status` column.

### 2. Chat Inline

When a task has `status = 'needs_human_review'` and `intermediate_data.pending_approval` exists, render an `ApprovalCard` component in the chat stream with approve/reject buttons.

### 3. Slack (phase 2)

On `approval_requests` INSERT, send a formatted message to a configured Slack channel via `pg_net.http_post()`. Phase 2 adds Slack interactive buttons that call back to a Supabase edge function to update approval status.

---

## Sequential Approvals

If the agent requests multiple gated resources in one LLM response (e.g. create tool + create agent), only the first blocking approval executes before the task suspends. After approval and resumption, the LLM naturally re-attempts the remaining actions — each one triggers its own approval cycle. This gives the human one approval at a time, which is better for oversight.

Async approvals (crons, deploys) never block, so multiple async requests in one turn all succeed immediately (all go to pending approval queue).

---

## Security Notes

- All 9 self-management tools are Rick-only (`agent.role === 'system'`). Zero self-management for other agents.
- `resource_table` in the trigger uses an allowlist (`tools`, `agent_crons`, `agents`, `deployed_functions`) before dynamic SQL execution
- All agent-created tools get `created_by = agent_id` for audit trail
- Cannot create `spawn` tools via `manage_tools` (delegation tools are admin-only)
- Rick hands off `is_default = true` after initial setup but retains `role = 'system'`
