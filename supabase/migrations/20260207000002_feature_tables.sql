-- Migration: Feature Tables (Channels, Code, Crons, Vectors, Memory, Dedup, Audit)
-- Part of SupaSwarm Platform Plan Phase 1

-- =============================================
-- EXTENSIONS
-- =============================================
CREATE EXTENSION IF NOT EXISTS vector;
-- pg_cron and pg_net are enabled via Supabase dashboard, not via migration

-- =============================================
-- CHANNEL MONITORING
-- =============================================
CREATE TABLE IF NOT EXISTS public.channel_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_type TEXT NOT NULL CHECK (channel_type IN ('slack', 'webchat', 'email', 'webhook')),
  channel_id TEXT NOT NULL UNIQUE,
  display_name TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
  config JSONB DEFAULT '{}',
  last_event_at TIMESTAMPTZ,
  message_count INT DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.channel_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id TEXT REFERENCES public.channel_connections(channel_id),
  event_type TEXT NOT NULL,
  event_data JSONB,
  task_id UUID REFERENCES public.tasks(id),
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channel_events_channel ON public.channel_events(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_events_created ON public.channel_events(created_at DESC);

-- =============================================
-- AGENT CODE STORAGE
-- =============================================
CREATE TABLE IF NOT EXISTS public.agent_code_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  file_path TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_type TEXT CHECK (file_type IN ('edge_function', 'script', 'config', 'other')),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'deployed', 'archived')),
  version INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_code_session ON public.agent_code_files(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_code_agent ON public.agent_code_files(agent_id);

CREATE TABLE IF NOT EXISTS public.deployed_functions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  function_slug TEXT NOT NULL UNIQUE,
  function_name TEXT NOT NULL,
  deployed_by UUID REFERENCES public.agents(id),
  session_id UUID REFERENCES public.sessions(id),
  version INT DEFAULT 1,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'failed')),
  entry_point TEXT DEFAULT 'index.ts',
  storage_path TEXT,
  deploy_log TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- CRON MANAGEMENT
-- =============================================
CREATE TABLE IF NOT EXISTS public.agent_crons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  cron_name TEXT NOT NULL UNIQUE,
  cron_schedule TEXT NOT NULL,
  cron_type TEXT NOT NULL CHECK (cron_type IN ('heartbeat', 'task_check', 'cleanup', 'custom')),
  edge_function TEXT,
  payload JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  pg_cron_jobid BIGINT,
  last_run_at TIMESTAMPTZ,
  last_status TEXT,
  error_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_crons_agent ON public.agent_crons(agent_id);

CREATE TABLE IF NOT EXISTS public.cron_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cron_id UUID REFERENCES public.agent_crons(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.agents(id),
  status TEXT CHECK (status IN ('started', 'success', 'failed', 'timeout')),
  response JSONB,
  duration_ms INT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cron_logs_cron ON public.cron_logs(cron_id);
CREATE INDEX IF NOT EXISTS idx_cron_logs_started ON public.cron_logs(started_at DESC);

-- =============================================
-- VECTOR STORE
-- =============================================
CREATE TABLE IF NOT EXISTS public.vectors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content TEXT NOT NULL,
  embedding vector(512),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vectors_embedding ON public.vectors
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_vectors_metadata ON public.vectors USING gin (metadata);
CREATE INDEX IF NOT EXISTS idx_vectors_source ON public.vectors ((metadata->>'source'));
CREATE INDEX IF NOT EXISTS idx_vectors_type ON public.vectors ((metadata->>'type'));

-- Filtered vector search with mandatory agent_id
CREATE OR REPLACE FUNCTION public.match_vectors(
  query_embedding vector(512),
  p_agent_id UUID,
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5,
  filter_metadata JSONB DEFAULT '{}'
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.id,
    v.content,
    v.metadata,
    1 - (v.embedding <=> query_embedding) AS similarity
  FROM public.vectors v
  WHERE
    v.embedding <=> query_embedding < (1 - match_threshold)
    AND (filter_metadata = '{}' OR v.metadata @> filter_metadata)
    AND (
      v.metadata->>'agent_id' = p_agent_id::text
      OR v.metadata->>'visibility' = 'shared'
    )
  ORDER BY v.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- =============================================
-- MEMORY GRAPH
-- =============================================
CREATE TABLE IF NOT EXISTS public.memory_nodes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  node_type TEXT NOT NULL CHECK (node_type IN (
    'person', 'concept', 'fact', 'preference', 'event', 'tool', 'skill', 'entity', 'decision'
  )),
  name TEXT NOT NULL,
  content TEXT,
  embedding vector(512),
  properties JSONB DEFAULT '{}',
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  source_session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  source_task_id UUID REFERENCES public.tasks(id),
  strength FLOAT DEFAULT 1.0,
  access_count INT DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_nodes_type ON public.memory_nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_memory_nodes_agent ON public.memory_nodes(agent_id);
CREATE INDEX IF NOT EXISTS idx_memory_nodes_name ON public.memory_nodes(name);
CREATE INDEX IF NOT EXISTS idx_memory_nodes_embedding ON public.memory_nodes
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_memory_nodes_strength ON public.memory_nodes(strength DESC);
CREATE INDEX IF NOT EXISTS idx_memory_nodes_properties ON public.memory_nodes USING gin (properties);
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_nodes_upsert
  ON public.memory_nodes(name, node_type, COALESCE(agent_id, '00000000-0000-0000-0000-000000000000'));

CREATE TABLE IF NOT EXISTS public.memory_edges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id UUID NOT NULL REFERENCES public.memory_nodes(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES public.memory_nodes(id) ON DELETE CASCADE,
  edge_type TEXT NOT NULL CHECK (edge_type IN (
    'related_to', 'depends_on', 'contradicts', 'supports', 'caused_by',
    'part_of', 'used_by', 'created_by', 'prefers', 'knows_about',
    'happened_before', 'happened_after', 'similar_to'
  )),
  weight FLOAT DEFAULT 1.0,
  properties JSONB DEFAULT '{}',
  bidirectional BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_id, target_id, edge_type)
);

CREATE INDEX IF NOT EXISTS idx_memory_edges_source ON public.memory_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_memory_edges_target ON public.memory_edges(target_id);
CREATE INDEX IF NOT EXISTS idx_memory_edges_type ON public.memory_edges(edge_type);
CREATE INDEX IF NOT EXISTS idx_memory_edges_source_type ON public.memory_edges(source_id, edge_type);

-- Graph traversal (depth capped at 2)
CREATE OR REPLACE FUNCTION public.get_related_nodes(
  p_node_id UUID,
  p_edge_types TEXT[] DEFAULT NULL,
  p_max_depth INT DEFAULT 1,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  node_id UUID,
  node_type TEXT,
  name TEXT,
  content TEXT,
  edge_type TEXT,
  depth INT,
  path UUID[]
)
LANGUAGE plpgsql AS $$
DECLARE
  v_max_depth INT := LEAST(p_max_depth, 2);
BEGIN
  RETURN QUERY
  WITH RECURSIVE graph AS (
    SELECT
      e.target_id AS nid,
      e.edge_type,
      1 AS depth,
      ARRAY[p_node_id, e.target_id] AS path
    FROM public.memory_edges e
    WHERE e.source_id = p_node_id
      AND (p_edge_types IS NULL OR e.edge_type = ANY(p_edge_types))

    UNION ALL

    SELECT
      e.source_id AS nid,
      e.edge_type,
      1 AS depth,
      ARRAY[p_node_id, e.source_id] AS path
    FROM public.memory_edges e
    WHERE e.target_id = p_node_id
      AND e.bidirectional = true
      AND (p_edge_types IS NULL OR e.edge_type = ANY(p_edge_types))

    UNION ALL

    SELECT
      e.target_id,
      e.edge_type,
      g.depth + 1,
      g.path || e.target_id
    FROM public.memory_edges e
    JOIN graph g ON e.source_id = g.nid
    WHERE g.depth < v_max_depth
      AND NOT (e.target_id = ANY(g.path))
      AND (p_edge_types IS NULL OR e.edge_type = ANY(p_edge_types))
  )
  SELECT
    n.id, n.node_type, n.name, n.content,
    g.edge_type, g.depth, g.path
  FROM graph g
  JOIN public.memory_nodes n ON n.id = g.nid
  ORDER BY g.depth, n.strength DESC
  LIMIT p_limit;
END;
$$;

-- Semantic search over memory (mandatory agent_id)
CREATE OR REPLACE FUNCTION public.search_memory(
  query_embedding vector(512),
  p_agent_id UUID,
  p_node_types TEXT[] DEFAULT NULL,
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  node_type TEXT,
  name TEXT,
  content TEXT,
  properties JSONB,
  strength FLOAT,
  similarity FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    n.id, n.node_type, n.name, n.content, n.properties, n.strength,
    1 - (n.embedding <=> query_embedding) AS similarity
  FROM public.memory_nodes n
  WHERE
    n.embedding <=> query_embedding < (1 - match_threshold)
    AND (n.agent_id = p_agent_id OR n.agent_id IS NULL)
    AND (p_node_types IS NULL OR n.node_type = ANY(p_node_types))
  ORDER BY n.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- =============================================
-- SLACK EVENT DEDUP
-- =============================================
CREATE TABLE IF NOT EXISTS public.slack_event_dedup (
  event_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- AUDIT LOG
-- =============================================
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  resource_type TEXT,
  resource_id TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_type ON public.audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON public.audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON public.audit_log(created_at DESC);
