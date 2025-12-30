-- Fix aggregator trigger to handle failed and needs_human_review states
CREATE OR REPLACE FUNCTION public.check_aggregator_dependencies()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  agg_task RECORD;
  all_terminal boolean;
  any_completed boolean;
  any_blocked boolean;
BEGIN
  -- Only fire for parallel tasks reaching terminal or blocked state
  IF NEW.is_parallel_task = true 
     AND NEW.status IN ('completed', 'cancelled', 'failed', 'needs_human_review') 
     AND (OLD.status IS NULL OR OLD.status != NEW.status) THEN
    
    -- Find aggregator tasks depending on this task
    FOR agg_task IN 
      SELECT id, dependent_task_ids 
      FROM public.tasks 
      WHERE NEW.id = ANY(dependent_task_ids)
        AND status = 'queued'
    LOOP
      -- Check states of all dependent tasks
      SELECT 
        -- All in terminal state (completed, cancelled, failed)
        bool_and(status IN ('completed', 'cancelled', 'failed')),
        -- At least one completed
        bool_or(status = 'completed'),
        -- Any blocked waiting for human review
        bool_or(status = 'needs_human_review')
      INTO all_terminal, any_completed, any_blocked
      FROM public.tasks 
      WHERE id = ANY(agg_task.dependent_task_ids);
      
      -- If any task is blocked (needs_human_review), don't change aggregator yet
      -- The human reviewer will handle it (retry will reset to pending)
      IF any_blocked THEN
        -- Keep aggregator in queued, but add metadata about blocked tasks
        UPDATE public.tasks 
        SET 
          output = jsonb_build_object(
            'waiting_for_human_review', true,
            'blocked_task_id', NEW.id
          ),
          updated_at = now() 
        WHERE id = agg_task.id;
        
      ELSIF all_terminal THEN
        IF any_completed THEN
          -- At least one result, activate aggregator
          UPDATE public.tasks 
          SET status = 'pending', updated_at = now() 
          WHERE id = agg_task.id;
        ELSE
          -- All cancelled/failed with no completions, fail aggregator
          UPDATE public.tasks 
          SET 
            status = 'failed',
            output = jsonb_build_object(
              'error', 'All parallel tasks failed or were cancelled',
              'dependent_task_ids', agg_task.dependent_task_ids
            ),
            updated_at = now() 
          WHERE id = agg_task.id;
        END IF;
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Update the trigger to fire on status changes
DROP TRIGGER IF EXISTS trigger_check_aggregator ON public.tasks;

CREATE TRIGGER trigger_check_aggregator
AFTER UPDATE OF status ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION check_aggregator_dependencies();


-- Update retry_task to properly handle aggregator tasks when retrying parallel tasks
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
  v_aggregator_id UUID;
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
  
  -- If this is a parallel task, find and update its aggregator
  IF v_task.is_parallel_task = true THEN
    -- Find aggregator that depends on this task
    SELECT id INTO v_aggregator_id
    FROM public.tasks
    WHERE p_task_id = ANY(dependent_task_ids)
      AND status IN ('queued', 'failed')
    LIMIT 1;
    
    IF v_aggregator_id IS NOT NULL THEN
      -- Reset aggregator to queued (if it was failed) and clear blocked status
      UPDATE public.tasks
      SET 
        status = 'queued',
        output = '{}'::jsonb,
        updated_at = NOW()
      WHERE id = v_aggregator_id
        AND status IN ('queued', 'failed');
    END IF;
  END IF;
  
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
    'is_parallel_task', v_task.is_parallel_task,
    'aggregator_reset', v_aggregator_id IS NOT NULL,
    'message', 'Task queued for retry'
  );
END;
$$;

