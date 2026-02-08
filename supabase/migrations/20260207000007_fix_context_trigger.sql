-- Migration: Fix queue_context_update trigger to use session_id instead of master_task_id
-- The old trigger referenced NEW.master_task_id which no longer exists after migration 0006.

CREATE OR REPLACE FUNCTION public.queue_context_update()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_session_id uuid;
  v_has_open_tasks boolean;
BEGIN
  -- Use session_id (replaces master_task_id)
  v_session_id := NEW.session_id;
  IF v_session_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if there are other open tasks in this session
  SELECT EXISTS (
    SELECT 1 FROM public.tasks
    WHERE session_id = v_session_id
      AND id != NEW.id
      AND status NOT IN ('completed', 'failed', 'cancelled')
  ) INTO v_has_open_tasks;

  -- Only queue if NO other tasks are still open (turn is complete)
  IF NOT v_has_open_tasks THEN
    PERFORM pgmq.send('context_graph_jobs', jsonb_build_object(
      'type', 'incremental_update',
      'session_id', v_session_id,
      'completed_task_id', NEW.id,
      'agent_slug', NEW.agent_slug,
      'is_strategic', COALESCE(NEW.is_strategic, false),
      'queued_at', now()
    ));
  END IF;

  RETURN NEW;
END;
$$;
