-- Function to retry a failed/stuck task
-- Resets status to pending and clears error output
CREATE OR REPLACE FUNCTION public.retry_task(
  p_task_id UUID,
  p_clear_output BOOLEAN DEFAULT FALSE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task RECORD;
  v_result JSON;
BEGIN
  -- Get current task state
  SELECT id, status, agent_slug, is_parallel_task
  INTO v_task
  FROM public.tasks
  WHERE id = p_task_id;
  
  IF v_task IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Task not found'
    );
  END IF;
  
  -- Only allow retry for certain statuses
  IF v_task.status NOT IN ('failed', 'needs_human_review', 'cancelled') THEN
    RETURN json_build_object(
      'success', false,
      'error', format('Cannot retry task with status: %s', v_task.status),
      'current_status', v_task.status
    );
  END IF;
  
  -- Reset task status to pending
  UPDATE public.tasks
  SET 
    status = 'pending',
    output = CASE WHEN p_clear_output THEN '{}'::jsonb ELSE output END,
    updated_at = NOW()
  WHERE id = p_task_id;
  
  -- If there's a human review for this task, mark it as resolved
  UPDATE public.human_reviews
  SET 
    approved = true,
    comments = COALESCE(comments, '') || ' [Retried at ' || NOW()::text || ']'
  WHERE task_id = p_task_id
    AND approved IS NULL;
  
  RETURN json_build_object(
    'success', true,
    'task_id', p_task_id,
    'previous_status', v_task.status,
    'new_status', 'pending',
    'message', 'Task queued for retry'
  );
END;
$$;

-- Function to retry all failed parallel tasks for an aggregator
CREATE OR REPLACE FUNCTION public.retry_parallel_group(
  p_aggregator_task_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_aggregator RECORD;
  v_retried_count INT := 0;
  v_failed_ids UUID[];
BEGIN
  -- Get aggregator task
  SELECT id, dependent_task_ids, status
  INTO v_aggregator
  FROM public.tasks
  WHERE id = p_aggregator_task_id;
  
  IF v_aggregator IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Aggregator task not found'
    );
  END IF;
  
  IF v_aggregator.dependent_task_ids IS NULL OR array_length(v_aggregator.dependent_task_ids, 1) = 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'No dependent tasks found'
    );
  END IF;
  
  -- Find all failed/needs_review dependent tasks
  SELECT array_agg(id) INTO v_failed_ids
  FROM public.tasks
  WHERE id = ANY(v_aggregator.dependent_task_ids)
    AND status IN ('failed', 'needs_human_review', 'cancelled');
  
  IF v_failed_ids IS NULL OR array_length(v_failed_ids, 1) = 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'No failed dependent tasks found'
    );
  END IF;
  
  -- Reset all failed tasks to pending
  UPDATE public.tasks
  SET status = 'pending', updated_at = NOW()
  WHERE id = ANY(v_failed_ids);
  
  GET DIAGNOSTICS v_retried_count = ROW_COUNT;
  
  -- Mark related human reviews as resolved
  UPDATE public.human_reviews
  SET 
    approved = true,
    comments = COALESCE(comments, '') || ' [Batch retry at ' || NOW()::text || ']'
  WHERE task_id = ANY(v_failed_ids)
    AND approved IS NULL;
  
  -- Reset aggregator to queued if it was failed
  IF v_aggregator.status IN ('failed', 'cancelled') THEN
    UPDATE public.tasks
    SET status = 'queued', updated_at = NOW()
    WHERE id = p_aggregator_task_id;
  END IF;
  
  RETURN json_build_object(
    'success', true,
    'aggregator_id', p_aggregator_task_id,
    'retried_count', v_retried_count,
    'retried_task_ids', v_failed_ids,
    'message', format('Retried %s tasks', v_retried_count)
  );
END;
$$;

-- Function to bulk retry tasks by status
CREATE OR REPLACE FUNCTION public.retry_tasks_by_status(
  p_status TEXT DEFAULT 'needs_human_review',
  p_agent_slug TEXT DEFAULT NULL,
  p_limit INT DEFAULT 10
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_retried_count INT := 0;
  v_task_ids UUID[];
BEGIN
  -- Find matching tasks
  SELECT array_agg(id) INTO v_task_ids
  FROM (
    SELECT id
    FROM public.tasks
    WHERE status = p_status
      AND (p_agent_slug IS NULL OR agent_slug = p_agent_slug)
    ORDER BY created_at ASC
    LIMIT p_limit
  ) t;
  
  IF v_task_ids IS NULL OR array_length(v_task_ids, 1) = 0 THEN
    RETURN json_build_object(
      'success', true,
      'retried_count', 0,
      'message', 'No matching tasks found'
    );
  END IF;
  
  -- Reset all matching tasks
  UPDATE public.tasks
  SET status = 'pending', updated_at = NOW()
  WHERE id = ANY(v_task_ids);
  
  GET DIAGNOSTICS v_retried_count = ROW_COUNT;
  
  -- Mark related human reviews as resolved
  UPDATE public.human_reviews
  SET 
    approved = true,
    comments = COALESCE(comments, '') || ' [Bulk retry at ' || NOW()::text || ']'
  WHERE task_id = ANY(v_task_ids)
    AND approved IS NULL;
  
  RETURN json_build_object(
    'success', true,
    'retried_count', v_retried_count,
    'retried_task_ids', v_task_ids,
    'message', format('Retried %s tasks with status %s', v_retried_count, p_status)
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.retry_task TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.retry_parallel_group TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.retry_tasks_by_status TO authenticated, service_role;





