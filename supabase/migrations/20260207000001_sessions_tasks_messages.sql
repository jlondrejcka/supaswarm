-- Migration: Sessions, Tasks Changes, Task Messages Changes, Session Metadata
-- Part of SupaSwarm Platform Plan Phase 1

-- =============================================
-- SESSIONS TABLE (NEW)
-- =============================================
CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  channel_type TEXT CHECK (channel_type IN ('slack', 'webchat', 'email', 'webhook', 'cron', 'spawn')),
  channel_id TEXT,
  thread_id TEXT,
  sender_id TEXT,
  display_name TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'idle', 'closed', 'completed')),
  origin JSONB DEFAULT '{}',
  delivery_context JSONB DEFAULT '{}',
  default_model_provider TEXT,
  default_model TEXT,
  tokens_input BIGINT DEFAULT 0,
  tokens_output BIGINT DEFAULT 0,
  idle_timeout_min INT DEFAULT 60,
  spawn_depth INT DEFAULT 0,
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  parent_session_id UUID REFERENCES public.sessions(id),
  spawn_parent_task_id UUID REFERENCES public.tasks(id)
);

-- Partial unique: only one active/idle TOP-LEVEL session per thread (excludes webchat + child sessions)
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_active_thread
  ON public.sessions(channel_type, COALESCE(channel_id,''), COALESCE(thread_id,''))
  WHERE status NOT IN ('closed', 'completed') AND channel_type != 'webchat' AND parent_session_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_status ON public.sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_thread ON public.sessions(channel_type, thread_id);
CREATE INDEX IF NOT EXISTS idx_sessions_agent ON public.sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_sessions_sender ON public.sessions(sender_id);
CREATE INDEX IF NOT EXISTS idx_sessions_activity ON public.sessions(last_activity_at DESC);

-- =============================================
-- TASKS TABLE CHANGES
-- =============================================
-- Add session reference
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL;

-- Drop master_task_id (replaced by session_id)
DROP INDEX IF EXISTS idx_tasks_master_task_id;
ALTER TABLE public.tasks DROP COLUMN IF EXISTS master_task_id;

-- Mission Control extensions
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS mission_status TEXT
  CHECK (mission_status IN ('inbox', 'assigned', 'in_progress', 'review', 'done', 'blocked'));
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium'
  CHECK (priority IN ('low', 'medium', 'high', 'urgent'));

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tasks_session ON public.tasks(session_id);
CREATE INDEX IF NOT EXISTS idx_tasks_session_status ON public.tasks(session_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_agent_status ON public.tasks(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_mission_status ON public.tasks(mission_status);

-- =============================================
-- TASK MESSAGES CHANGES
-- =============================================
ALTER TABLE public.task_messages ADD COLUMN IF NOT EXISTS role TEXT
  CHECK (role IN ('user', 'assistant', 'system', 'tool'));
ALTER TABLE public.task_messages ADD COLUMN IF NOT EXISTS parent_message_id UUID REFERENCES public.task_messages(id);
ALTER TABLE public.task_messages ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE public.task_messages ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE public.task_messages ADD COLUMN IF NOT EXISTS token_usage JSONB;
ALTER TABLE public.task_messages ADD COLUMN IF NOT EXISTS channel_context JSONB;
ALTER TABLE public.task_messages ADD COLUMN IF NOT EXISTS sequence_number INT;

CREATE INDEX IF NOT EXISTS idx_task_messages_role ON public.task_messages(role);
CREATE INDEX IF NOT EXISTS idx_task_messages_parent ON public.task_messages(parent_message_id);
CREATE INDEX IF NOT EXISTS idx_task_messages_sequence ON public.task_messages(task_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_task_messages_conversation ON public.task_messages(task_id, type, created_at, sequence_number);

-- Auto-generate sequence_number on insert
CREATE OR REPLACE FUNCTION public.set_message_sequence()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sequence_number IS NULL THEN
    SELECT COALESCE(MAX(sequence_number), 0) + 1
    INTO NEW.sequence_number
    FROM public.task_messages
    WHERE task_id = NEW.task_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_set_message_sequence ON public.task_messages;
CREATE TRIGGER trigger_set_message_sequence
BEFORE INSERT ON public.task_messages
FOR EACH ROW
WHEN (NEW.sequence_number IS NULL)
EXECUTE FUNCTION public.set_message_sequence();

-- =============================================
-- SESSION METADATA TABLE (NEW)
-- =============================================
CREATE TABLE IF NOT EXISTS public.session_metadata (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  scope TEXT DEFAULT 'session' CHECK (scope IN ('session', 'agent', 'global')),
  created_by UUID REFERENCES public.agents(id),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, key)
);

CREATE INDEX IF NOT EXISTS idx_session_meta_session ON public.session_metadata(session_id);
CREATE INDEX IF NOT EXISTS idx_session_meta_scope ON public.session_metadata(scope);
CREATE INDEX IF NOT EXISTS idx_session_meta_key ON public.session_metadata(key);

-- =============================================
-- SPAWN COMPLETION TRIGGER
-- =============================================
CREATE OR REPLACE FUNCTION public.check_spawn_completion()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_session RECORD;
  v_parent_task_id UUID;
  v_spawn_output JSONB;
BEGIN
  -- Only fire when a task completes or fails
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
      RETURN NEW;  -- Internal subtask, not the root spawn task
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

  -- Re-invoke process-task for parent via pg_net
  -- NOTE: pg_net may not be available locally. This works in hosted Supabase.
  -- PERFORM net.http_post(
  --   url := current_setting('app.settings.supabase_url') || '/functions/v1/process-task',
  --   headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')),
  --   body := jsonb_build_object('task_id', v_parent_task_id)
  -- );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_check_spawn ON public.tasks;
CREATE TRIGGER trigger_check_spawn
AFTER UPDATE OF status ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.check_spawn_completion();

-- Realtime needs FULL replica identity to send complete rows on UPDATE
ALTER TABLE public.tasks REPLICA IDENTITY FULL;
ALTER TABLE public.task_messages REPLICA IDENTITY FULL;
ALTER TABLE public.sessions REPLICA IDENTITY FULL;

-- Enable realtime for chat tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_messages;
