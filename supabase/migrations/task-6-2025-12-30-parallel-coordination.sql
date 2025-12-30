-- Task 6: Parallel Task Coordination
-- Branch: task-6-parallel-coordination
-- Date: 2025-12-30

-- 1. New columns on tasks for parallel coordination
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS is_parallel_task boolean DEFAULT false;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS dependent_task_ids uuid[] DEFAULT '{}';

-- 2. Add 'queued' status (aggregator waits for dependencies)
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check CHECK (
  status = ANY (ARRAY[
    'pending'::text, 'queued'::text, 'running'::text, 'pending_subtask'::text, 
    'needs_human_review'::text, 'completed'::text, 'failed'::text, 'cancelled'::text
  ])
);

-- 3. Indexes for dependency lookups
CREATE INDEX IF NOT EXISTS idx_tasks_dependent_ids ON public.tasks USING GIN (dependent_task_ids);
CREATE INDEX IF NOT EXISTS idx_tasks_parallel ON public.tasks (is_parallel_task) WHERE is_parallel_task = true;

-- 4. Trigger function to check aggregator dependencies
CREATE OR REPLACE FUNCTION check_aggregator_dependencies()
RETURNS TRIGGER AS $$
DECLARE
  agg_task RECORD;
  all_terminal boolean;
  any_completed boolean;
BEGIN
  -- Only fire for parallel tasks reaching terminal state
  IF NEW.is_parallel_task = true 
     AND NEW.status IN ('completed', 'cancelled') 
     AND (OLD.status IS NULL OR OLD.status != NEW.status) THEN
    
    -- Find aggregator tasks depending on this task
    FOR agg_task IN 
      SELECT id, dependent_task_ids 
      FROM public.tasks 
      WHERE NEW.id = ANY(dependent_task_ids)
        AND status = 'queued'
    LOOP
      -- Check if all deps are in terminal state (completed or cancelled)
      SELECT 
        bool_and(status IN ('completed', 'cancelled')),
        bool_or(status = 'completed')
      INTO all_terminal, any_completed
      FROM public.tasks 
      WHERE id = ANY(agg_task.dependent_task_ids);
      
      IF all_terminal THEN
        IF any_completed THEN
          -- At least one result, activate aggregator
          UPDATE public.tasks SET status = 'pending', updated_at = now() WHERE id = agg_task.id;
        ELSE
          -- All cancelled/skipped, fail aggregator
          UPDATE public.tasks SET status = 'failed', updated_at = now() WHERE id = agg_task.id;
        END IF;
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Create trigger on task status updates
DROP TRIGGER IF EXISTS trigger_check_aggregator ON public.tasks;
CREATE TRIGGER trigger_check_aggregator
AFTER UPDATE OF status ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION check_aggregator_dependencies();

-- 6. Comments for documentation
COMMENT ON COLUMN public.tasks.is_parallel_task IS 'Flag indicating this task is part of a parallel execution group';
COMMENT ON COLUMN public.tasks.dependent_task_ids IS 'Array of task IDs this aggregator task depends on (waits for completion)';

