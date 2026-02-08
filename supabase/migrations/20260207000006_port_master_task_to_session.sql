-- Migration: Port master_task_id to session_id and drop master_task_id
-- Creates sessions for every conversation group, assigns session_id to all tasks,
-- migrates context_stories, then drops the deprecated column.

-- =============================================
-- STEP 1: Create sessions for conversation groups
-- Each unique master_task_id becomes one session.
-- =============================================
CREATE TEMP TABLE _master_session_map AS
SELECT
  groups.master_task_id,
  uuid_generate_v4() AS new_session_id,
  t_root.agent_id,
  t_root.created_at AS root_created,
  (SELECT MAX(t2.updated_at) FROM public.tasks t2
   WHERE t2.master_task_id = groups.master_task_id
      OR t2.id = groups.master_task_id) AS last_activity
FROM (
  SELECT DISTINCT master_task_id
  FROM public.tasks
  WHERE master_task_id IS NOT NULL
) groups
LEFT JOIN public.tasks t_root ON t_root.id = groups.master_task_id;

INSERT INTO public.sessions (id, agent_id, channel_type, status, created_at, last_activity_at)
SELECT
  m.new_session_id,
  m.agent_id,
  'webchat',
  'completed',
  COALESCE(m.root_created, NOW()),
  COALESCE(m.last_activity, NOW())
FROM _master_session_map m;

-- =============================================
-- STEP 2: Assign session_id on subtasks
-- =============================================
UPDATE public.tasks t
SET session_id = m.new_session_id
FROM _master_session_map m
WHERE t.master_task_id = m.master_task_id;

-- Assign session_id on root tasks (their id = master_task_id)
UPDATE public.tasks t
SET session_id = m.new_session_id
FROM _master_session_map m
WHERE t.id = m.master_task_id
  AND t.session_id IS NULL;

-- =============================================
-- STEP 3: Create individual sessions for standalone tasks
-- (no master_task_id, not a root of any group, session_id still NULL)
-- =============================================
DO $$
DECLARE
  rec RECORD;
  new_sid UUID;
BEGIN
  FOR rec IN
    SELECT t.id, t.agent_id, t.status, t.created_at, t.updated_at
    FROM public.tasks t
    WHERE t.session_id IS NULL
    ORDER BY t.created_at
  LOOP
    new_sid := uuid_generate_v4();
    INSERT INTO public.sessions (id, agent_id, channel_type, status, created_at, last_activity_at)
    VALUES (
      new_sid,
      rec.agent_id,
      'webchat',
      CASE WHEN rec.status IN ('completed', 'failed', 'cancelled') THEN 'completed' ELSE 'active' END,
      rec.created_at,
      rec.updated_at
    );
    UPDATE public.tasks SET session_id = new_sid WHERE id = rec.id;
  END LOOP;
END;
$$;

DROP TABLE IF EXISTS _master_session_map;

-- =============================================
-- STEP 4: Migrate context_stories to use session_id
-- =============================================
ALTER TABLE public.context_stories ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.sessions(id);

-- Port any existing rows (0 currently, but future-proof)
UPDATE public.context_stories cs
SET session_id = t.session_id
FROM public.tasks t
WHERE cs.master_task_id = t.id
  AND cs.session_id IS NULL;

-- Drop the old FK and column
ALTER TABLE public.context_stories DROP CONSTRAINT IF EXISTS context_stories_master_task_id_fkey;
ALTER TABLE public.context_stories DROP COLUMN IF EXISTS master_task_id;

-- =============================================
-- STEP 5: Drop master_task_id from tasks
-- =============================================
DROP INDEX IF EXISTS idx_tasks_master_task_id;
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_master_task_id_fkey;
ALTER TABLE public.tasks DROP COLUMN IF EXISTS master_task_id;

-- =============================================
-- STEP 6: Verify — every task now has a session_id
-- =============================================
DO $$
DECLARE
  orphan_count INT;
BEGIN
  SELECT COUNT(*) INTO orphan_count FROM public.tasks WHERE session_id IS NULL;
  IF orphan_count > 0 THEN
    RAISE WARNING 'Migration complete but % tasks still have NULL session_id', orphan_count;
  END IF;
END;
$$;
