-- ============================================================================
-- Slack Integration: schema changes + reply trigger
-- ============================================================================

-- 1. sessions.slack_meta — stores Slack context + posted message history
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS slack_meta JSONB DEFAULT NULL;

COMMENT ON COLUMN public.sessions.slack_meta IS
  'Slack-specific metadata: team_id, channel_id, thread_ts, user_id, channel_type, original_message_ts, posted_messages[]';

-- Index for slack-events session lookup by app channel + thread
CREATE INDEX IF NOT EXISTS idx_sessions_slack_lookup
  ON public.sessions ((slack_meta->>'channel_id'), (slack_meta->>'thread_ts'))
  WHERE channel_type = 'slack' AND slack_meta IS NOT NULL;

-- 2. agents — per-agent Slack app mapping
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS slack_app_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS slack_bot_token_secret TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS slack_signing_secret_name TEXT DEFAULT NULL;

COMMENT ON COLUMN public.agents.slack_app_id IS
  'Slack api_app_id — routes incoming events to this agent';
COMMENT ON COLUMN public.agents.slack_bot_token_secret IS
  'Vault secret name for this agent''s Slack bot token (e.g. SLACK_BOT_TOKEN_JORGE)';
COMMENT ON COLUMN public.agents.slack_signing_secret_name IS
  'Vault secret name for this agent''s Slack signing secret (e.g. SLACK_SIGNING_SECRET_JORGE)';

-- Unique constraint: one agent per Slack app
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_slack_app_id
  ON public.agents (slack_app_id)
  WHERE slack_app_id IS NOT NULL;

-- 3. task_messages — Slack delivery tracking columns
ALTER TABLE public.task_messages
  ADD COLUMN IF NOT EXISTS slack_notify BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS slack_sent BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS slack_message_ts TEXT DEFAULT NULL;

COMMENT ON COLUMN public.task_messages.slack_notify IS
  'TRUE = this message should be sent to Slack (set by trigger for Slack sessions)';
COMMENT ON COLUMN public.task_messages.slack_sent IS
  'TRUE = successfully posted to Slack by slack-reply function';
COMMENT ON COLUMN public.task_messages.slack_message_ts IS
  'Slack message ts returned after posting (for future updates/deletions)';

-- Index for slack-reply to find unsent messages
CREATE INDEX IF NOT EXISTS idx_task_messages_slack_pending
  ON public.task_messages (id)
  WHERE slack_notify = TRUE AND slack_sent = FALSE;

-- 4. App config table for trigger URL lookups (hosted Supabase restricts ALTER DATABASE SET)
CREATE TABLE IF NOT EXISTS public.app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.app_config IS 'Internal config for triggers. RLS enabled, no policies = server-only access.';

-- Seed supabase_url when configured (null in shadow db / unconfigured envs is ok)
INSERT INTO public.app_config (key, value)
SELECT 'supabase_url', v
FROM (SELECT current_setting('app.settings.supabase_url', true) AS v) s
WHERE s.v IS NOT NULL
ON CONFLICT (key) DO NOTHING;

-- 5. Trigger: auto-flag task_messages for Slack delivery + invoke slack-reply
CREATE OR REPLACE FUNCTION public.slack_notify_on_task_message()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_session_id UUID;
  v_session RECORD;
  v_url TEXT;
BEGIN
  IF NEW.type NOT IN (
    'assistant_message', 'delegation_start', 'delegation_complete', 'error'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT session_id INTO v_session_id
  FROM public.tasks
  WHERE id = NEW.task_id;

  IF v_session_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id, slack_meta, parent_session_id
  INTO v_session
  FROM public.sessions
  WHERE id = v_session_id
    AND channel_type = 'slack'
    AND slack_meta IS NOT NULL;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF v_session.parent_session_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  NEW.slack_notify := TRUE;

  -- Queue message for Slack reply processing instead of calling edge function via pg_net
  BEGIN
    PERFORM pgmq.send(
      queue_name => 'slack_replies',
      msg => jsonb_build_object(
        'task_message_id', NEW.id,
        'message_id', NEW.id
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'slack-reply queue failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_slack_notify ON public.task_messages;
CREATE TRIGGER trg_slack_notify
  BEFORE INSERT ON public.task_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.slack_notify_on_task_message();
