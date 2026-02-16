-- Migration: Convert handoff tool type to spawn, add delegation message types
-- Part of the delegation-only architecture change

-- 1. Convert existing handoff tools to spawn
UPDATE public.tools
SET type = 'spawn',
    config = config || '{"instructions": ""}'::jsonb
WHERE type = 'handoff';

-- 2. Add delegation message types to task_messages
ALTER TABLE public.task_messages
DROP CONSTRAINT IF EXISTS task_messages_type_check;

ALTER TABLE public.task_messages
ADD CONSTRAINT task_messages_type_check CHECK (type IN (
  'user_message', 'assistant_message', 'thinking', 'tool_call',
  'tool_result', 'skill_load', 'subtask_created', 'error',
  'status_change', 'handoff', 'delegation_start', 'delegation_complete'
));

-- 3. Add spawn tool type to tools type check if exists
ALTER TABLE public.tools
DROP CONSTRAINT IF EXISTS tools_type_check;
-- No constraint re-add — type is free-text, enforced at app level

-- 4. Ensure check_spawn_completion trigger uses pg_net for re-invocation
CREATE OR REPLACE FUNCTION public.check_spawn_completion()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_session RECORD;
  v_parent_task_id UUID;
  v_spawn_output JSONB;
BEGIN
  IF NEW.status NOT IN ('completed', 'failed') THEN
    RETURN NEW;
  END IF;
  IF OLD.status IS NOT NULL AND OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Check if this task's session is a spawn session
  SELECT s.parent_session_id, s.spawn_parent_task_id
  INTO v_session
  FROM public.sessions s
  WHERE s.id = NEW.session_id
    AND s.spawn_parent_task_id IS NOT NULL;

  IF v_session IS NULL THEN
    RETURN NEW;
  END IF;

  -- ROOT TASK CHECK: only fire if this task's parent_id points to a task
  -- in a DIFFERENT session (the parent session)
  IF NEW.parent_id IS NOT NULL THEN
    PERFORM 1 FROM public.tasks
    WHERE id = NEW.parent_id AND session_id != NEW.session_id;
    IF NOT FOUND THEN
      RETURN NEW;
    END IF;
  END IF;

  v_parent_task_id := v_session.spawn_parent_task_id;

  -- Cap spawn result at 100KB
  v_spawn_output := jsonb_build_object(
    'status', NEW.status,
    'output', LEFT(NEW.output::text, 102400)::jsonb,
    'agent_slug', NEW.agent_slug,
    'task_id', NEW.id,
    'session_id', NEW.session_id
  );

  -- Write spawn result to parent task context + set pending
  UPDATE public.tasks SET
    context = COALESCE(context, '{}'::jsonb) || jsonb_build_object('_spawn_result', v_spawn_output),
    status = 'pending',
    updated_at = NOW()
  WHERE id = v_parent_task_id
    AND status = 'pending_subtask';

  -- Mark spawn session completed
  UPDATE public.sessions SET status = 'completed' WHERE id = NEW.session_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_check_spawn ON public.tasks;
CREATE TRIGGER trigger_check_spawn
AFTER UPDATE OF status ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.check_spawn_completion();
