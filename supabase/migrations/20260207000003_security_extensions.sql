-- Migration: Security, Agent/Tool Extensions, Mission Control Tables, Helpers
-- Part of SupaSwarm Platform Plan Phase 1

-- =============================================
-- TOOLS TABLE EXTENSIONS
-- =============================================
ALTER TABLE public.tools ADD COLUMN IF NOT EXISTS execution_mode TEXT
  DEFAULT 'internal' CHECK (execution_mode IN ('internal', 'edge_function'));
ALTER TABLE public.tools ADD COLUMN IF NOT EXISTS function_slug TEXT;
ALTER TABLE public.tools ADD COLUMN IF NOT EXISTS function_url TEXT;
ALTER TABLE public.tools ADD COLUMN IF NOT EXISTS timeout_ms INT DEFAULT 30000;
ALTER TABLE public.tools ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT FALSE;
ALTER TABLE public.tools ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.agents(id);
ALTER TABLE public.tools ADD COLUMN IF NOT EXISTS rate_limit_per_min INT;

-- Agent-created tools MUST require approval
ALTER TABLE public.tools ADD CONSTRAINT tools_agent_created_approval
  CHECK (created_by IS NULL OR requires_approval = true);

-- =============================================
-- AGENTS TABLE EXTENSIONS
-- =============================================
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'idle'
  CHECK (status IN ('idle', 'active', 'blocked', 'inactive'));
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'worker'
  CHECK (role IN ('admin', 'lead', 'worker'));
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMPTZ;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS session_key TEXT;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS daily_token_budget BIGINT;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS memory_mode TEXT DEFAULT 'on_demand'
  CHECK (memory_mode IN ('off', 'on_demand', 'auto'));
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS max_spawn_depth INT DEFAULT 3;

-- Token budget on sessions
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS max_tokens BIGINT;

-- =============================================
-- MISSION CONTROL TABLES
-- =============================================
CREATE TABLE IF NOT EXISTS public.task_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(task_id, agent_id)
);

CREATE TABLE IF NOT EXISTS public.activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activities_created ON public.activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_agent ON public.activities(agent_id);

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  read BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_agent_unread ON public.notifications(agent_id) WHERE read = false;

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  sender_id TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_task ON public.messages(task_id);

-- =============================================
-- HELPER FUNCTIONS
-- =============================================
CREATE OR REPLACE FUNCTION public.increment_message_count(ch_id TEXT)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  new_count INT;
BEGIN
  UPDATE public.channel_connections SET message_count = message_count + 1
  WHERE channel_id = ch_id
  RETURNING message_count INTO new_count;
  RETURN COALESCE(new_count, 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_agent_daily_tokens(p_agent_id UUID)
RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE
  total BIGINT;
BEGIN
  SELECT COALESCE(SUM(tokens_input + tokens_output), 0) INTO total
  FROM public.sessions
  WHERE agent_id = p_agent_id
    AND created_at >= CURRENT_DATE;
  RETURN total;
END;
$$;

-- =============================================
-- CRON DEACTIVATION TRIGGER
-- =============================================
CREATE OR REPLACE FUNCTION public.deactivate_agent_crons()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'inactive' AND (OLD.status IS NULL OR OLD.status != 'inactive') THEN
    UPDATE public.agent_crons SET is_active = false WHERE agent_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_deactivate_agent_crons ON public.agents;
CREATE TRIGGER trigger_deactivate_agent_crons
AFTER UPDATE OF status ON public.agents
FOR EACH ROW EXECUTE FUNCTION public.deactivate_agent_crons();

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_code_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deployed_functions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_crons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cron_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slack_event_dedup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Service role bypass (edge functions operate via service_role)
-- All tables: service_role has full access by default (bypasses RLS)

-- Webchat users: own sessions only
CREATE POLICY "webchat_sessions_select" ON public.sessions
  FOR SELECT USING (sender_id = auth.uid()::text AND channel_type = 'webchat');
CREATE POLICY "webchat_sessions_insert" ON public.sessions
  FOR INSERT WITH CHECK (sender_id = auth.uid()::text AND channel_type = 'webchat');

-- Webchat users: own task messages (read only)
CREATE POLICY "webchat_task_messages_select" ON public.task_messages
  FOR SELECT USING (
    task_id IN (SELECT t.id FROM public.tasks t WHERE t.session_id IN (
      SELECT s.id FROM public.sessions s WHERE s.sender_id = auth.uid()::text
    ))
  );

-- Allow authenticated users to read agents and tools (public info)
CREATE POLICY "read_agents" ON public.agents FOR SELECT USING (true);
CREATE POLICY "read_tools" ON public.tools FOR SELECT USING (true);

-- Restrict vault function access
REVOKE EXECUTE ON FUNCTION public.get_vault_secret FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_vault_secret FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_vault_secret FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.list_vault_secrets FROM anon, authenticated;

-- =============================================
-- SEED BUILT-IN TOOLS
-- =============================================
INSERT INTO public.tools (name, slug, type, execution_mode, description, config) VALUES
  ('rag_search', 'rag-search', 'internal', 'internal',
   'Search knowledge base by semantic similarity with metadata filters',
   '{"parameters": {"query": "string", "filters": "object", "limit": "number", "threshold": "number"}}'),
  ('embed_content', 'embed-content', 'internal', 'edge_function',
   'Chunk and embed text into the vector store',
   '{"parameters": {"text": "string", "chunk": "boolean", "metadata": "object"}}'),
  ('memory_store', 'memory-store', 'internal', 'internal',
   'Store a new memory (fact, preference, concept, etc.) with optional edges',
   '{"parameters": {"node_type": "string", "name": "string", "content": "string", "properties": "object", "edges": "array"}}'),
  ('memory_recall', 'memory-recall', 'internal', 'internal',
   'Search memories by semantic similarity and expand via graph relationships',
   '{"parameters": {"query": "string", "node_types": "array", "expand": "boolean", "limit": "number"}}'),
  ('memory_connect', 'memory-connect', 'internal', 'internal',
   'Create a relationship between two existing memory nodes',
   '{"parameters": {"source_name": "string", "target_name": "string", "edge_type": "string", "weight": "number"}}'),
  ('spawn_session', 'spawn-session', 'internal', 'internal',
   'Spawn a subagent in an isolated session, pause parent, get result back',
   '{"parameters": {"agent_slug": "string", "message": "string", "context": "object"}}'),
  ('set_session_meta', 'set-session-meta', 'internal', 'internal',
   'Set a key-value pair in session metadata',
   '{"parameters": {"key": "string", "value": "object", "scope": "string", "expires_at": "string"}}'),
  ('get_session_meta', 'get-session-meta', 'internal', 'internal',
   'Get session metadata by key',
   '{"parameters": {"key": "string"}}'),
  ('write_code_file', 'write-code-file', 'internal', 'internal',
   'Write a code file to agent storage',
   '{"parameters": {"path": "string", "content": "string", "file_type": "string"}}'),
  ('read_code_file', 'read-code-file', 'internal', 'internal',
   'Read a code file from agent storage',
   '{"parameters": {"path": "string"}}')
ON CONFLICT (slug) DO NOTHING;

-- Set rate limits on sensitive tools
UPDATE public.tools SET rate_limit_per_min = 60 WHERE slug = 'embed-content';
UPDATE public.tools SET rate_limit_per_min = 100 WHERE slug = 'rag-search';

-- Update embed_content to reference the edge function
UPDATE public.tools SET function_slug = 'embed' WHERE slug = 'embed-content';
