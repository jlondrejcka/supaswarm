-- Migration: Scheduled Jobs (Cron)
-- Allows creating recurring tasks from UI

-- =============================================
-- SCHEDULED JOBS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.scheduled_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  interval_type TEXT NOT NULL CHECK (interval_type IN (
    'minutely', 'hourly', 'daily', 'weekly', 'monthly', 'custom_cron'
  )),
  interval_config JSONB NOT NULL DEFAULT '{}',
  cron_expression TEXT,
  task_message TEXT NOT NULL,
  task_context JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ NOT NULL,
  total_runs INT DEFAULT 0,
  failed_runs INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_next_run ON public.scheduled_jobs(next_run_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_agent ON public.scheduled_jobs(agent_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_active ON public.scheduled_jobs(is_active);

COMMENT ON TABLE public.scheduled_jobs IS 'Recurring task schedules configured via UI';
COMMENT ON COLUMN public.scheduled_jobs.interval_type IS 'Simple interval type or custom_cron for complex schedules';
COMMENT ON COLUMN public.scheduled_jobs.interval_config IS 'Config like {"hour": 4, "minute": 0} for daily_at, {"day_of_week": 1} for weekly';
COMMENT ON COLUMN public.scheduled_jobs.cron_expression IS 'Standard cron expression (e.g., "0 4 * * *") when interval_type is custom_cron';
COMMENT ON COLUMN public.scheduled_jobs.task_message IS 'Message/instructions for the task';
COMMENT ON COLUMN public.scheduled_jobs.task_context IS 'Context variables to pass to task (e.g., delivery_context for Slack)';

-- =============================================
-- SCHEDULED JOB RUNS (History/Log)
-- =============================================
CREATE TABLE IF NOT EXISTS public.scheduled_job_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES public.scheduled_jobs(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_runs_job_id ON public.scheduled_job_runs(job_id);
CREATE INDEX IF NOT EXISTS idx_job_runs_task_id ON public.scheduled_job_runs(task_id);

-- =============================================
-- HELPER FUNCTION: Calculate next run time
-- =============================================
CREATE OR REPLACE FUNCTION public.calculate_next_run(
  p_interval_type TEXT,
  p_interval_config JSONB,
  p_last_run_at TIMESTAMPTZ
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
AS $$
DECLARE
  v_next_run TIMESTAMPTZ;
  v_base_time TIMESTAMPTZ;
  v_hour INT;
  v_minute INT;
  v_day_of_week INT;
BEGIN
  v_base_time := COALESCE(p_last_run_at, NOW());
  
  CASE p_interval_type
    WHEN 'minutely' THEN
      v_next_run := v_base_time + INTERVAL '1 minute';
    
    WHEN 'hourly' THEN
      v_next_run := v_base_time + INTERVAL '1 hour';
    
    WHEN 'daily' THEN
      v_hour := COALESCE((p_interval_config->>'hour')::INT, 0);
      v_minute := COALESCE((p_interval_config->>'minute')::INT, 0);
      v_next_run := date_trunc('day', v_base_time) + INTERVAL '1 day' + 
                    (v_hour || ' hours')::INTERVAL + 
                    (v_minute || ' minutes')::INTERVAL;
      -- If already past today's time, add a day
      IF v_next_run <= NOW() THEN
        v_next_run := v_next_run + INTERVAL '1 day';
      END IF;
    
    WHEN 'weekly' THEN
      v_hour := COALESCE((p_interval_config->>'hour')::INT, 0);
      v_minute := COALESCE((p_interval_config->>'minute')::INT, 0);
      v_day_of_week := COALESCE((p_interval_config->>'day_of_week')::INT, 1); -- 1=Monday
      v_next_run := date_trunc('week', v_base_time) + 
                    ((v_day_of_week - 1) || ' days')::INTERVAL +
                    (v_hour || ' hours')::INTERVAL + 
                    (v_minute || ' minutes')::INTERVAL;
      -- If already past this week's time, add a week
      IF v_next_run <= NOW() THEN
        v_next_run := v_next_run + INTERVAL '7 days';
      END IF;
    
    WHEN 'monthly' THEN
      v_hour := COALESCE((p_interval_config->>'hour')::INT, 0);
      v_minute := COALESCE((p_interval_config->>'minute')::INT, 0);
      v_next_run := date_trunc('month', v_base_time) + INTERVAL '1 month' +
                    (v_hour || ' hours')::INTERVAL + 
                    (v_minute || ' minutes')::INTERVAL;
      IF v_next_run <= NOW() THEN
        v_next_run := v_next_run + INTERVAL '1 month';
      END IF;
    
    ELSE
      -- Default: 1 hour from now
      v_next_run := v_base_time + INTERVAL '1 hour';
  END CASE;
  
  RETURN v_next_run;
END;
$$;

-- =============================================
-- RPC: Create/Update Scheduled Job
-- =============================================
CREATE OR REPLACE FUNCTION public.upsert_scheduled_job(
  p_id UUID DEFAULT NULL,
  p_name TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_agent_id UUID DEFAULT NULL,
  p_interval_type TEXT DEFAULT 'daily',
  p_interval_config JSONB DEFAULT '{}',
  p_cron_expression TEXT DEFAULT NULL,
  p_task_message TEXT DEFAULT NULL,
  p_task_context JSONB DEFAULT '{}',
  p_is_active BOOLEAN DEFAULT true
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_id UUID;
  v_next_run TIMESTAMPTZ;
BEGIN
  -- Calculate initial next_run
  v_next_run := calculate_next_run(p_interval_type, p_interval_config, NULL);
  
  IF p_id IS NOT NULL THEN
    -- Update existing job
    UPDATE public.scheduled_jobs SET
      name = COALESCE(p_name, name),
      description = COALESCE(p_description, description),
      agent_id = COALESCE(p_agent_id, agent_id),
      interval_type = COALESCE(p_interval_type, interval_type),
      interval_config = COALESCE(p_interval_config, interval_config),
      cron_expression = p_cron_expression,
      task_message = COALESCE(p_task_message, task_message),
      task_context = COALESCE(p_task_context, task_context),
      is_active = COALESCE(p_is_active, is_active),
      next_run_at = v_next_run,
      updated_at = NOW()
    WHERE id = p_id
    RETURNING id INTO v_job_id;
  ELSE
    -- Create new job
    INSERT INTO public.scheduled_jobs (
      name, description, agent_id, interval_type, interval_config,
      cron_expression, task_message, task_context, is_active, next_run_at
    ) VALUES (
      p_name, p_description, p_agent_id, p_interval_type, p_interval_config,
      p_cron_expression, p_task_message, p_task_context, p_is_active, v_next_run
    )
    RETURNING id INTO v_job_id;
  END IF;
  
  RETURN json_build_object('success', true, 'job_id', v_job_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_scheduled_job TO authenticated, service_role;

-- =============================================
-- RPC: Delete Scheduled Job
-- =============================================
CREATE OR REPLACE FUNCTION public.delete_scheduled_job(p_job_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.scheduled_jobs WHERE id = p_job_id;
  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_scheduled_job TO authenticated, service_role;
