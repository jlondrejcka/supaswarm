-- RPC function to mark a task as completed.
-- Bypasses PostgREST PATCH which silently fails when AFTER UPDATE triggers
-- (check_spawn_completion, queue_context_update) do cascading work.
CREATE OR REPLACE FUNCTION public.complete_task(
  p_task_id UUID,
  p_output JSONB DEFAULT NULL,
  p_intermediate_data JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_updated_id UUID;
BEGIN
  UPDATE public.tasks
  SET
    status = 'completed',
    output = COALESCE(p_output, output),
    intermediate_data = COALESCE(p_intermediate_data, intermediate_data),
    updated_at = NOW()
  WHERE id = p_task_id
    AND status IN ('running', 'pending', 'pending_subtask')
  RETURNING id INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Task not found or already in terminal state');
  END IF;

  RETURN jsonb_build_object('success', true, 'task_id', v_updated_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'sqlstate', SQLSTATE);
END;
$$;
