-- =============================================
-- RERUN TASK FUNCTION
-- Creates a new task with the same input/agent/session as the original.
-- Works for ANY task status (completed, failed, cancelled, etc.)
-- =============================================
CREATE OR REPLACE FUNCTION public.rerun_task(p_task_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task RECORD;
  v_new_task_id UUID;
BEGIN
  SELECT id, input, agent_id, agent_slug, session_id, context, priority
  INTO v_task
  FROM public.tasks WHERE id = p_task_id;

  IF v_task IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Task not found');
  END IF;

  INSERT INTO public.tasks (
    input, agent_id, agent_slug, session_id,
    context, priority, status
  ) VALUES (
    v_task.input,
    v_task.agent_id,
    v_task.agent_slug,
    v_task.session_id,
    COALESCE(v_task.context, '{}'::jsonb),
    COALESCE(v_task.priority, 'medium'),
    'pending'
  )
  RETURNING id INTO v_new_task_id;

  RETURN json_build_object('success', true, 'task_id', v_new_task_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rerun_task TO authenticated, service_role;

-- =============================================
-- CANCEL TASK FUNCTION
-- Stops a running/pending task by setting status to 'cancelled'.
-- =============================================
CREATE OR REPLACE FUNCTION public.cancel_task(p_task_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status
  FROM public.tasks WHERE id = p_task_id;

  IF v_status IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Task not found');
  END IF;

  IF v_status NOT IN ('pending', 'queued', 'running', 'pending_subtask') THEN
    RETURN json_build_object('success', false, 'error', format('Cannot cancel task with status: %s', v_status));
  END IF;

  UPDATE public.tasks SET
    status = 'cancelled',
    output = COALESCE(output, '{}'::jsonb) || jsonb_build_object('error', 'Cancelled by user'),
    updated_at = NOW()
  WHERE id = p_task_id;

  RETURN json_build_object('success', true, 'task_id', p_task_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_task TO authenticated, service_role;
