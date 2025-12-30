-- Task 4: Agent Handoffs Schema Migration
-- Branch: task-4-agent-handoffs
-- Date: 2025-12-29

-- 1. Add context column to tasks table for handoff context variables
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS context jsonb DEFAULT '{}'::jsonb;

-- 2. Add 'handoff' to tool types
ALTER TABLE public.tools DROP CONSTRAINT IF EXISTS tools_type_check;
ALTER TABLE public.tools ADD CONSTRAINT tools_type_check 
  CHECK (type = ANY (ARRAY['internal'::text, 'mcp_server'::text, 'http_api'::text, 'supabase_rpc'::text, 'handoff'::text]));

-- 3. Add 'handoff' to task_messages types
ALTER TABLE public.task_messages DROP CONSTRAINT IF EXISTS task_messages_type_check;
ALTER TABLE public.task_messages ADD CONSTRAINT task_messages_type_check 
  CHECK (type = ANY (ARRAY['user_message'::text, 'assistant_message'::text, 'thinking'::text, 'tool_call'::text, 'tool_result'::text, 'skill_load'::text, 'subtask_created'::text, 'error'::text, 'status_change'::text, 'handoff'::text]));

-- 4. Create index on tasks.context for faster queries on handoff metadata
CREATE INDEX IF NOT EXISTS idx_tasks_context ON public.tasks USING gin (context);

-- Comment for documentation
COMMENT ON COLUMN public.tasks.context IS 'JSONB field storing context variables passed during agent handoffs. Includes _handoff_from, _handoff_tool, _handoff_instructions metadata.';

