-- Token usage tracking: tasks rollup columns
-- Message-level in task_messages.token_usage (already exists)
-- Session-level in sessions.tokens_input/output (already exists)
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS tokens_input BIGINT DEFAULT 0;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS tokens_output BIGINT DEFAULT 0;

COMMENT ON COLUMN public.tasks.tokens_input IS 'Total LLM input tokens for this task (rollup from task_messages)';
COMMENT ON COLUMN public.tasks.tokens_output IS 'Total LLM output tokens for this task (rollup from task_messages)';

CREATE INDEX IF NOT EXISTS idx_tasks_tokens ON public.tasks(tokens_input, tokens_output) WHERE tokens_input > 0 OR tokens_output > 0;

-- Atomic session token increment (used when task completes)
CREATE OR REPLACE FUNCTION public.increment_session_tokens(
  p_session_id UUID,
  p_tokens_input BIGINT DEFAULT 0,
  p_tokens_output BIGINT DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.sessions
  SET
    tokens_input = tokens_input + p_tokens_input,
    tokens_output = tokens_output + p_tokens_output,
    last_activity_at = NOW()
  WHERE id = p_session_id;
END;
$$;
