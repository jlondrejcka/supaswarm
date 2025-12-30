-- SupaSwarm Database Schema
-- A Supabase-native multi-agent orchestration platform
-- Version: 2.0

-- =============================================
-- EXTENSIONS
-- =============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgmq";

-- =============================================
-- LLM PROVIDERS
-- =============================================
CREATE TABLE IF NOT EXISTS public.llm_providers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  base_url text,
  default_model text NOT NULL,
  requires_api_key boolean DEFAULT true,
  is_active boolean DEFAULT true
);

-- Seed default LLM providers
INSERT INTO public.llm_providers (name, display_name, base_url, default_model, requires_api_key)
VALUES
  ('xai', 'xAI (Grok)', 'https://api.x.ai/v1', 'grok-4-1', true),
  ('anthropic', 'Anthropic (Claude)', 'https://api.anthropic.com/v1', 'claude-sonnet-4-5-20250514', true),
  ('google', 'Google AI (Gemini)', 'https://generativelanguage.googleapis.com/v1beta', 'gemini-2.5-pro', true),
  ('openai', 'OpenAI (GPT)', 'https://api.openai.com/v1', 'gpt-4o', true)
ON CONFLICT (name) DO NOTHING;

-- =============================================
-- PROVIDER MODELS
-- =============================================
CREATE TABLE IF NOT EXISTS public.provider_models (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id uuid REFERENCES public.llm_providers(id) ON DELETE CASCADE,
  model_name text NOT NULL,
  display_name text,
  is_enabled boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  input_price_per_million numeric,
  output_price_per_million numeric,
  context_window integer,
  max_output_tokens integer,
  supports_vision boolean DEFAULT false,
  supports_tools boolean DEFAULT true,
  supports_streaming boolean DEFAULT true,
  model_family text,
  release_date date,
  is_latest boolean DEFAULT false,
  capabilities jsonb DEFAULT '[]'::jsonb,
  UNIQUE(provider_id, model_name)
);

ALTER TABLE public.provider_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to provider_models" ON public.provider_models FOR ALL USING (true) WITH CHECK (true);

-- xAI Grok Models
INSERT INTO public.provider_models (provider_id, model_name, display_name, is_enabled, model_family, release_date, is_latest, context_window, max_output_tokens, input_price_per_million, output_price_per_million, supports_vision, capabilities)
SELECT p.id, m.* FROM public.llm_providers p
CROSS JOIN (VALUES 
  ('grok-4-1', 'Grok 4.1', true, 'grok-4', '2025-10-01'::date, true, 2000000, 131072, 3.00, 15.00, true, '["reasoning", "coding", "analysis"]'::jsonb),
  ('grok-4-1-fast', 'Grok 4.1 Fast', true, 'grok-4', '2025-10-01'::date, true, 2000000, 131072, 0.60, 3.00, false, '["fast-inference", "coding"]'::jsonb),
  ('grok-4-1-mini', 'Grok 4.1 Mini', true, 'grok-4', '2025-10-01'::date, true, 131072, 32768, 0.10, 0.40, false, '["fast-inference", "lightweight"]'::jsonb),
  ('grok-4', 'Grok 4', true, 'grok-4', '2025-07-01'::date, false, 2000000, 131072, 3.00, 15.00, true, '["reasoning", "coding", "analysis"]'::jsonb)
) AS m(model_name, display_name, is_enabled, model_family, release_date, is_latest, context_window, max_output_tokens, input_price_per_million, output_price_per_million, supports_vision, capabilities)
WHERE p.name = 'xai'
ON CONFLICT (provider_id, model_name) DO NOTHING;

-- Anthropic Claude Models
INSERT INTO public.provider_models (provider_id, model_name, display_name, is_enabled, model_family, release_date, is_latest, context_window, max_output_tokens, input_price_per_million, output_price_per_million, supports_vision, capabilities)
SELECT p.id, m.* FROM public.llm_providers p
CROSS JOIN (VALUES 
  ('claude-opus-4-5-20251124', 'Claude Opus 4.5', true, 'claude-4.5', '2025-11-24'::date, true, 200000, 32768, 15.00, 75.00, true, '["reasoning", "coding", "analysis", "agentic"]'::jsonb),
  ('claude-sonnet-4-5-20250514', 'Claude Sonnet 4.5', true, 'claude-4.5', '2025-05-14'::date, true, 200000, 16384, 3.00, 15.00, true, '["reasoning", "coding", "balanced"]'::jsonb),
  ('claude-haiku-4-5-20251015', 'Claude Haiku 4.5', true, 'claude-4.5', '2025-10-15'::date, true, 200000, 8192, 1.00, 5.00, true, '["fast-inference", "realtime", "lightweight"]'::jsonb),
  ('claude-3-5-sonnet-20241022', 'Claude 3.5 Sonnet', false, 'claude-3.5', '2024-10-22'::date, false, 200000, 8192, 3.00, 15.00, true, '["reasoning", "coding", "balanced"]'::jsonb)
) AS m(model_name, display_name, is_enabled, model_family, release_date, is_latest, context_window, max_output_tokens, input_price_per_million, output_price_per_million, supports_vision, capabilities)
WHERE p.name = 'anthropic'
ON CONFLICT (provider_id, model_name) DO NOTHING;

-- Google Gemini Models
INSERT INTO public.provider_models (provider_id, model_name, display_name, is_enabled, model_family, release_date, is_latest, context_window, max_output_tokens, input_price_per_million, output_price_per_million, supports_vision, capabilities)
SELECT p.id, m.* FROM public.llm_providers p
CROSS JOIN (VALUES 
  ('gemini-2.5-pro', 'Gemini 2.5 Pro', true, 'gemini-2.5', '2025-06-01'::date, true, 2000000, 65536, 1.25, 5.00, true, '["reasoning", "coding", "multimodal"]'::jsonb),
  ('gemini-2.5-flash', 'Gemini 2.5 Flash', true, 'gemini-2.5', '2025-06-01'::date, true, 1000000, 32768, 0.15, 0.60, true, '["fast-inference", "multimodal"]'::jsonb),
  ('gemini-2.0-flash', 'Gemini 2.0 Flash', false, 'gemini-2.0', '2024-12-01'::date, false, 1000000, 8192, 0.10, 0.40, true, '["fast-inference", "multimodal"]'::jsonb)
) AS m(model_name, display_name, is_enabled, model_family, release_date, is_latest, context_window, max_output_tokens, input_price_per_million, output_price_per_million, supports_vision, capabilities)
WHERE p.name = 'google'
ON CONFLICT (provider_id, model_name) DO NOTHING;

-- OpenAI GPT Models
INSERT INTO public.provider_models (provider_id, model_name, display_name, is_enabled, model_family, release_date, is_latest, context_window, max_output_tokens, input_price_per_million, output_price_per_million, supports_vision, capabilities)
SELECT p.id, m.* FROM public.llm_providers p
CROSS JOIN (VALUES 
  ('gpt-4o', 'GPT-4o', true, 'gpt-4', '2024-05-01'::date, true, 128000, 16384, 5.00, 15.00, true, '["reasoning", "coding", "multimodal"]'::jsonb),
  ('gpt-4o-mini', 'GPT-4o Mini', true, 'gpt-4', '2024-07-01'::date, true, 128000, 16384, 0.15, 0.60, true, '["fast-inference", "lightweight"]'::jsonb),
  ('o1', 'o1', true, 'o1', '2024-12-01'::date, true, 200000, 100000, 15.00, 60.00, true, '["reasoning", "analysis"]'::jsonb)
) AS m(model_name, display_name, is_enabled, model_family, release_date, is_latest, context_window, max_output_tokens, input_price_per_million, output_price_per_million, supports_vision, capabilities)
WHERE p.name = 'openai'
ON CONFLICT (provider_id, model_name) DO NOTHING;

-- =============================================
-- AGENTS
-- =============================================
CREATE TABLE IF NOT EXISTS public.agents (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  description text,
  system_prompt text NOT NULL,
  provider_id uuid REFERENCES public.llm_providers(id),
  model text,
  temperature decimal DEFAULT 0.7,
  max_tokens int,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agents_slug ON public.agents(slug);

-- =============================================
-- TOOLS
-- =============================================
CREATE TABLE IF NOT EXISTS public.tools (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  type text NOT NULL CHECK (type IN ('internal', 'mcp_server', 'http_api', 'supabase_rpc', 'handoff')),
  description text,
  config jsonb NOT NULL,
  credential_secret_name text,
  credential_type text CHECK (credential_type IN ('api_key', 'bearer_token', 'oauth_refresh_token', 'none')),
  credential_description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tools_slug ON public.tools(slug);

-- =============================================
-- SKILLS (Agent Skills Standard)
-- =============================================
CREATE TABLE IF NOT EXISTS public.skills (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  skill_id text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL,
  metadata jsonb,
  instructions text,
  resources jsonb,
  version text DEFAULT '1.0.0',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_skills_skill_id ON public.skills(skill_id);

-- =============================================
-- AGENT RELATIONSHIPS
-- =============================================
CREATE TABLE IF NOT EXISTS public.agent_tools (
  agent_id uuid REFERENCES public.agents(id) ON DELETE CASCADE,
  tool_id uuid REFERENCES public.tools(id) ON DELETE CASCADE,
  PRIMARY KEY (agent_id, tool_id)
);

CREATE TABLE IF NOT EXISTS public.agent_skills (
  agent_id uuid REFERENCES public.agents(id) ON DELETE CASCADE,
  skill_id uuid REFERENCES public.skills(id) ON DELETE CASCADE,
  priority int DEFAULT 5,
  PRIMARY KEY (agent_id, skill_id)
);

-- =============================================
-- TASKS (Three-ID Hierarchy + Parallel Coordination)
-- =============================================
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  master_task_id uuid REFERENCES public.tasks(id),
  parent_id uuid REFERENCES public.tasks(id),
  agent_id uuid REFERENCES public.agents(id),
  agent_slug text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'queued', 'running', 'pending_subtask', 
    'needs_human_review', 'completed', 'failed', 'cancelled'
  )),
  input jsonb NOT NULL,
  output jsonb,
  context jsonb DEFAULT '{}'::jsonb,
  logs text[] DEFAULT '{}',
  intermediate_data jsonb,
  storage_paths text[] DEFAULT '{}',
  is_parallel_task boolean DEFAULT false,
  dependent_task_ids uuid[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_master_task_id ON public.tasks(master_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_context ON public.tasks USING gin (context);
CREATE INDEX IF NOT EXISTS idx_tasks_dependent_ids ON public.tasks USING GIN (dependent_task_ids);
CREATE INDEX IF NOT EXISTS idx_tasks_parallel ON public.tasks (is_parallel_task) WHERE is_parallel_task = true;

COMMENT ON COLUMN public.tasks.context IS 'JSONB field storing context variables passed during agent handoffs';
COMMENT ON COLUMN public.tasks.is_parallel_task IS 'Flag indicating this task is part of a parallel execution group';
COMMENT ON COLUMN public.tasks.dependent_task_ids IS 'Array of task IDs this aggregator task depends on';

-- =============================================
-- TASK MESSAGES (Chain of Thought)
-- =============================================
CREATE TABLE IF NOT EXISTS public.task_messages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN (
    'user_message', 'assistant_message', 'thinking', 'tool_call', 
    'tool_result', 'skill_load', 'subtask_created', 'error', 'status_change', 'handoff'
  )),
  content jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_messages_task_id ON public.task_messages(task_id);

-- =============================================
-- HUMAN REVIEWS
-- =============================================
CREATE TABLE IF NOT EXISTS public.human_reviews (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  response jsonb NOT NULL,
  approved boolean,
  comments text,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

-- =============================================
-- VAULT RPC FUNCTIONS
-- =============================================
CREATE OR REPLACE FUNCTION public.get_vault_secret(secret_name text)
RETURNS text AS $$
DECLARE
  secret_value text;
BEGIN
  SELECT decrypted_secret INTO secret_value
  FROM vault.decrypted_secrets
  WHERE name = secret_name
  LIMIT 1;
  RETURN secret_value;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.upsert_vault_secret(secret_name text, secret_value text)
RETURNS void AS $$
BEGIN
  DELETE FROM vault.secrets WHERE name = secret_name;
  INSERT INTO vault.secrets (name, secret) VALUES (secret_name, secret_value);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.list_vault_secrets()
RETURNS TABLE(name text) AS $$
BEGIN
  RETURN QUERY SELECT s.name FROM vault.secrets s;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.delete_vault_secret(secret_name text)
RETURNS void AS $$
BEGIN
  DELETE FROM vault.secrets WHERE name = secret_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- TASK RETRY FUNCTIONS
-- =============================================
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
BEGIN
  SELECT id, status, agent_slug, is_parallel_task INTO v_task
  FROM public.tasks WHERE id = p_task_id;
  
  IF v_task IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Task not found');
  END IF;
  
  IF v_task.status NOT IN ('failed', 'needs_human_review', 'cancelled') THEN
    RETURN json_build_object('success', false, 'error', format('Cannot retry task with status: %s', v_task.status));
  END IF;
  
  UPDATE public.tasks SET 
    status = 'pending',
    output = CASE WHEN p_clear_output THEN '{}'::jsonb ELSE output END,
    updated_at = NOW()
  WHERE id = p_task_id;
  
  IF v_task.is_parallel_task = true THEN
    SELECT id INTO v_aggregator_id FROM public.tasks
    WHERE p_task_id = ANY(dependent_task_ids) AND status IN ('queued', 'failed') LIMIT 1;
    
    IF v_aggregator_id IS NOT NULL THEN
      UPDATE public.tasks SET status = 'queued', output = '{}'::jsonb, updated_at = NOW()
      WHERE id = v_aggregator_id AND status IN ('queued', 'failed');
    END IF;
  END IF;
  
  UPDATE public.human_reviews SET approved = true,
    comments = COALESCE(comments, '') || ' [Retried at ' || NOW()::text || ']'
  WHERE task_id = p_task_id AND approved IS NULL;
  
  RETURN json_build_object('success', true, 'task_id', p_task_id, 'new_status', 'pending');
END;
$$;

CREATE OR REPLACE FUNCTION public.retry_parallel_group(p_aggregator_task_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_aggregator RECORD;
  v_retried_count INT := 0;
  v_failed_ids UUID[];
BEGIN
  SELECT id, dependent_task_ids, status INTO v_aggregator FROM public.tasks WHERE id = p_aggregator_task_id;
  
  IF v_aggregator IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Aggregator task not found');
  END IF;
  
  SELECT array_agg(id) INTO v_failed_ids FROM public.tasks
  WHERE id = ANY(v_aggregator.dependent_task_ids) AND status IN ('failed', 'needs_human_review', 'cancelled');
  
  IF v_failed_ids IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No failed dependent tasks found');
  END IF;
  
  UPDATE public.tasks SET status = 'pending', updated_at = NOW() WHERE id = ANY(v_failed_ids);
  GET DIAGNOSTICS v_retried_count = ROW_COUNT;
  
  IF v_aggregator.status IN ('failed', 'cancelled') THEN
    UPDATE public.tasks SET status = 'queued', updated_at = NOW() WHERE id = p_aggregator_task_id;
  END IF;
  
  RETURN json_build_object('success', true, 'retried_count', v_retried_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.retry_task TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.retry_parallel_group TO authenticated, service_role;

-- =============================================
-- AGGREGATOR DEPENDENCY TRIGGER
-- =============================================
CREATE OR REPLACE FUNCTION public.check_aggregator_dependencies()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  agg_task RECORD;
  all_terminal boolean;
  any_completed boolean;
  any_blocked boolean;
BEGIN
  IF NEW.is_parallel_task = true 
     AND NEW.status IN ('completed', 'cancelled', 'failed', 'needs_human_review') 
     AND (OLD.status IS NULL OR OLD.status != NEW.status) THEN
    
    FOR agg_task IN 
      SELECT id, dependent_task_ids FROM public.tasks 
      WHERE NEW.id = ANY(dependent_task_ids) AND status = 'queued'
    LOOP
      SELECT 
        bool_and(status IN ('completed', 'cancelled', 'failed')),
        bool_or(status = 'completed'),
        bool_or(status = 'needs_human_review')
      INTO all_terminal, any_completed, any_blocked
      FROM public.tasks WHERE id = ANY(agg_task.dependent_task_ids);
      
      IF any_blocked THEN
        UPDATE public.tasks SET 
          output = jsonb_build_object('waiting_for_human_review', true, 'blocked_task_id', NEW.id),
          updated_at = now() 
        WHERE id = agg_task.id;
      ELSIF all_terminal THEN
        IF any_completed THEN
          UPDATE public.tasks SET status = 'pending', updated_at = now() WHERE id = agg_task.id;
        ELSE
          UPDATE public.tasks SET status = 'failed', 
            output = jsonb_build_object('error', 'All parallel tasks failed'),
            updated_at = now() 
          WHERE id = agg_task.id;
        END IF;
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_check_aggregator ON public.tasks;
CREATE TRIGGER trigger_check_aggregator
AFTER UPDATE OF status ON public.tasks
FOR EACH ROW EXECUTE FUNCTION check_aggregator_dependencies();

-- =============================================
-- ROW LEVEL SECURITY (Optional - Enable as needed)
-- =============================================
-- ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.tools ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;

-- =============================================
-- DEFAULT AGENT (Optional)
-- =============================================
INSERT INTO public.agents (name, slug, description, system_prompt, model, temperature)
VALUES (
  'General Assistant',
  'general-assistant',
  'A helpful general-purpose AI assistant',
  'You are a helpful AI assistant. You help users with various tasks and questions. Be concise and accurate.',
  'gpt-4o',
  0.7
) ON CONFLICT (slug) DO NOTHING;
