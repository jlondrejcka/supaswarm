-- Context Graphs Integration for Supaswarm
-- Task 7 - 2026-01-04
-- 
-- Implements: graph_nodes, graph_edges, context_stories tables
-- Auto-triggers for node creation, incremental summaries, pgvector embeddings

-- =============================================
-- PHASE 1: GRAPH DATA MODEL
-- =============================================

-- 1.1 Central node registry
CREATE TABLE IF NOT EXISTS public.graph_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('task', 'agent', 'tool', 'skill')),
  is_strategic boolean DEFAULT false,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_graph_nodes_entity_type ON public.graph_nodes(entity_type);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_strategic ON public.graph_nodes(is_strategic);

COMMENT ON TABLE public.graph_nodes IS 'Central registry for all graph nodes (tasks, agents, tools, skills)';
COMMENT ON COLUMN public.graph_nodes.entity_type IS 'Type of entity this node represents';
COMMENT ON COLUMN public.graph_nodes.is_strategic IS 'Whether this node is part of strategic (vs ops) workflows';

-- 1.2 Edges with weights for random walk
CREATE TABLE IF NOT EXISTS public.graph_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_node_id uuid NOT NULL REFERENCES public.graph_nodes(id) ON DELETE CASCADE,
  target_node_id uuid NOT NULL REFERENCES public.graph_nodes(id) ON DELETE CASCADE,
  edge_type text NOT NULL CHECK (edge_type IN (
    'executes',      -- agent -> task
    'spawns',        -- task -> task (subtask)
    'handoff',       -- task -> task (agent handoff)
    'depends_on',    -- task -> task (aggregator)
    'uses_tool',     -- task -> tool
    'has_skill'      -- agent -> skill
  )),
  condition text,
  weight numeric DEFAULT 1.0,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON public.graph_edges(source_node_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON public.graph_edges(target_node_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_type ON public.graph_edges(edge_type);

COMMENT ON TABLE public.graph_edges IS 'Directed edges between graph nodes representing relationships';
COMMENT ON COLUMN public.graph_edges.edge_type IS 'Type of relationship: executes, spawns, handoff, depends_on, uses_tool, has_skill';
COMMENT ON COLUMN public.graph_edges.weight IS 'Edge weight for random walk probability calculations';

-- =============================================
-- PHASE 2: ADD graph_node_id FK TO ENTITY TABLES
-- =============================================

-- Add FK column to all entity tables
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS graph_node_id uuid REFERENCES public.graph_nodes(id);
ALTER TABLE public.tools ADD COLUMN IF NOT EXISTS graph_node_id uuid REFERENCES public.graph_nodes(id);
ALTER TABLE public.skills ADD COLUMN IF NOT EXISTS graph_node_id uuid REFERENCES public.graph_nodes(id);
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS graph_node_id uuid REFERENCES public.graph_nodes(id);

-- Add is_strategic to tasks for filtering
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS is_strategic boolean DEFAULT false;

-- Indexes for lookups
CREATE INDEX IF NOT EXISTS idx_agents_graph_node ON public.agents(graph_node_id);
CREATE INDEX IF NOT EXISTS idx_tools_graph_node ON public.tools(graph_node_id);
CREATE INDEX IF NOT EXISTS idx_skills_graph_node ON public.skills(graph_node_id);
CREATE INDEX IF NOT EXISTS idx_tasks_graph_node ON public.tasks(graph_node_id);

-- =============================================
-- PHASE 3: AUTO-CREATE GRAPH NODES VIA TRIGGERS
-- =============================================

-- Generic function to create graph node and link back
CREATE OR REPLACE FUNCTION public.create_graph_node_for_entity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_node_id uuid;
  entity_type_val text;
  is_strategic_val boolean;
BEGIN
  -- Determine entity type from table name
  entity_type_val := TG_TABLE_NAME;
  IF entity_type_val = 'agents' THEN 
    entity_type_val := 'agent';
    is_strategic_val := false;
  ELSIF entity_type_val = 'tools' THEN 
    entity_type_val := 'tool';
    is_strategic_val := false;
  ELSIF entity_type_val = 'skills' THEN 
    entity_type_val := 'skill';
    is_strategic_val := false;
  ELSIF entity_type_val = 'tasks' THEN 
    entity_type_val := 'task';
    is_strategic_val := COALESCE(NEW.is_strategic, false);
  ELSE
    is_strategic_val := false;
  END IF;
  
  -- Create graph node
  INSERT INTO public.graph_nodes (entity_type, is_strategic, metadata)
  VALUES (
    entity_type_val,
    is_strategic_val,
    jsonb_build_object('entity_id', NEW.id, 'created_at', now())
  )
  RETURNING id INTO new_node_id;
  
  -- Update entity with graph_node_id
  NEW.graph_node_id := new_node_id;
  
  RETURN NEW;
END;
$$;

-- Create triggers for each entity table (drop first to avoid duplicates)
DROP TRIGGER IF EXISTS create_agent_graph_node ON public.agents;
CREATE TRIGGER create_agent_graph_node
  BEFORE INSERT ON public.agents
  FOR EACH ROW EXECUTE FUNCTION public.create_graph_node_for_entity();

DROP TRIGGER IF EXISTS create_tool_graph_node ON public.tools;
CREATE TRIGGER create_tool_graph_node
  BEFORE INSERT ON public.tools
  FOR EACH ROW EXECUTE FUNCTION public.create_graph_node_for_entity();

DROP TRIGGER IF EXISTS create_skill_graph_node ON public.skills;
CREATE TRIGGER create_skill_graph_node
  BEFORE INSERT ON public.skills
  FOR EACH ROW EXECUTE FUNCTION public.create_graph_node_for_entity();

DROP TRIGGER IF EXISTS create_task_graph_node ON public.tasks;
CREATE TRIGGER create_task_graph_node
  BEFORE INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.create_graph_node_for_entity();

-- =============================================
-- PHASE 4: CONTEXT STORIES WITH INCREMENTAL SUMMARIES
-- =============================================

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Context stories with incremental summaries
CREATE TABLE IF NOT EXISTS public.context_stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_task_id uuid UNIQUE REFERENCES public.tasks(id) ON DELETE CASCADE,
  root_node_id uuid REFERENCES public.graph_nodes(id),
  is_strategic boolean DEFAULT false,
  
  -- Tiered content (updated incrementally)
  headline text,
  summary text,
  full_transcript text,
  
  -- Structured extraction
  objective text,
  current_state text,
  key_facts jsonb DEFAULT '[]',
  agents_involved text[] DEFAULT '{}',
  turn_count int DEFAULT 0,
  
  -- Vector search (gte-small = 384 dims)
  embedding extensions.vector(384),
  
  -- Metadata
  last_turn_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_context_stories_master ON public.context_stories(master_task_id);
CREATE INDEX IF NOT EXISTS idx_context_stories_strategic ON public.context_stories(is_strategic);
CREATE INDEX IF NOT EXISTS idx_context_stories_embedding ON public.context_stories 
  USING hnsw (embedding extensions.vector_cosine_ops);

COMMENT ON TABLE public.context_stories IS 'Incremental summaries of conversations, updated after each turn';
COMMENT ON COLUMN public.context_stories.headline IS 'One-line summary, updates each turn';
COMMENT ON COLUMN public.context_stories.summary IS 'Rolling ~500 word summary, compressed by Grok';
COMMENT ON COLUMN public.context_stories.full_transcript IS 'Append-only complete history of all turns';
COMMENT ON COLUMN public.context_stories.embedding IS 'gte-small 384-dim embedding of summary for semantic search';

-- =============================================
-- PHASE 5: CONTEXT UPDATE QUEUE
-- =============================================

-- Create queue for context updates (pgmq already enabled in init)
SELECT pgmq.create('context_graph_jobs');

-- Trigger to queue context update when a TURN completes
-- Only fires when ALL tasks for this master_task_id are done (no pending/running)
CREATE OR REPLACE FUNCTION public.queue_context_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_master_id uuid;
  v_has_open_tasks boolean;
BEGIN
  -- Determine master_task_id (could be self if this is the root)
  v_master_id := COALESCE(NEW.master_task_id, NEW.id);
  
  -- Check if there are other open tasks for this conversation
  SELECT EXISTS (
    SELECT 1 FROM public.tasks
    WHERE (master_task_id = v_master_id OR id = v_master_id)
      AND id != NEW.id
      AND status NOT IN ('completed', 'failed', 'cancelled')
  ) INTO v_has_open_tasks;
  
  -- Only queue if NO other tasks are still open (turn is complete)
  IF NOT v_has_open_tasks THEN
    PERFORM pgmq.send('context_graph_jobs', jsonb_build_object(
      'type', 'incremental_update',
      'master_task_id', v_master_id,
      'completed_task_id', NEW.id,
      'agent_slug', NEW.agent_slug,
      'is_strategic', COALESCE(NEW.is_strategic, false),
      'queued_at', now()
    ));
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_task_complete_queue_context ON public.tasks;
CREATE TRIGGER on_task_complete_queue_context
  AFTER UPDATE OF status ON public.tasks
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status != 'completed')
  EXECUTE FUNCTION public.queue_context_update();

-- =============================================
-- PHASE 6: VECTOR SEARCH FUNCTION
-- =============================================

-- Function to match context stories by vector similarity
CREATE OR REPLACE FUNCTION public.match_context_stories(
  query_embedding extensions.vector(384),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 3,
  strategic_filter boolean DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  master_task_id uuid,
  headline text,
  summary text,
  objective text,
  current_state text,
  turn_count int,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cs.id,
    cs.master_task_id,
    cs.headline,
    cs.summary,
    cs.objective,
    cs.current_state,
    cs.turn_count,
    1 - (cs.embedding <=> query_embedding) as similarity
  FROM public.context_stories cs
  WHERE cs.embedding IS NOT NULL
    AND (strategic_filter IS NULL OR cs.is_strategic = strategic_filter)
    AND 1 - (cs.embedding <=> query_embedding) > match_threshold
  ORDER BY cs.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_context_stories TO authenticated, service_role;

-- =============================================
-- PHASE 7: HELPER FUNCTIONS FOR EDGE CREATION
-- =============================================

-- Helper to get graph_node_id from a task
CREATE OR REPLACE FUNCTION public.get_task_graph_node_id(p_task_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_node_id uuid;
BEGIN
  SELECT graph_node_id INTO v_node_id
  FROM public.tasks
  WHERE id = p_task_id;
  
  RETURN v_node_id;
END;
$$;

-- Helper to create a graph edge
CREATE OR REPLACE FUNCTION public.create_graph_edge(
  p_source_node_id uuid,
  p_target_node_id uuid,
  p_edge_type text,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_edge_id uuid;
BEGIN
  INSERT INTO public.graph_edges (source_node_id, target_node_id, edge_type, metadata)
  VALUES (p_source_node_id, p_target_node_id, p_edge_type, p_metadata)
  RETURNING id INTO v_edge_id;
  
  RETURN v_edge_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_task_graph_node_id TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_graph_edge TO authenticated, service_role;

-- =============================================
-- PHASE 8: RLS POLICIES
-- =============================================

-- Enable RLS on new tables
ALTER TABLE public.graph_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graph_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.context_stories ENABLE ROW LEVEL SECURITY;

-- Allow all access for now (can restrict later)
CREATE POLICY "Allow all access to graph_nodes" ON public.graph_nodes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to graph_edges" ON public.graph_edges FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to context_stories" ON public.context_stories FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- PHASE 9: BACKFILL EXISTING ENTITIES (Optional)
-- =============================================

-- Backfill graph nodes for existing entities that don't have one
DO $$
DECLARE
  rec RECORD;
  new_node_id uuid;
BEGIN
  -- Backfill agents
  FOR rec IN SELECT id FROM public.agents WHERE graph_node_id IS NULL LOOP
    INSERT INTO public.graph_nodes (entity_type, is_strategic, metadata)
    VALUES ('agent', false, jsonb_build_object('entity_id', rec.id, 'backfilled', true))
    RETURNING id INTO new_node_id;
    
    UPDATE public.agents SET graph_node_id = new_node_id WHERE id = rec.id;
  END LOOP;
  
  -- Backfill tools
  FOR rec IN SELECT id FROM public.tools WHERE graph_node_id IS NULL LOOP
    INSERT INTO public.graph_nodes (entity_type, is_strategic, metadata)
    VALUES ('tool', false, jsonb_build_object('entity_id', rec.id, 'backfilled', true))
    RETURNING id INTO new_node_id;
    
    UPDATE public.tools SET graph_node_id = new_node_id WHERE id = rec.id;
  END LOOP;
  
  -- Backfill skills
  FOR rec IN SELECT id FROM public.skills WHERE graph_node_id IS NULL LOOP
    INSERT INTO public.graph_nodes (entity_type, is_strategic, metadata)
    VALUES ('skill', false, jsonb_build_object('entity_id', rec.id, 'backfilled', true))
    RETURNING id INTO new_node_id;
    
    UPDATE public.skills SET graph_node_id = new_node_id WHERE id = rec.id;
  END LOOP;
  
  -- Backfill tasks
  FOR rec IN SELECT id, is_strategic FROM public.tasks WHERE graph_node_id IS NULL LOOP
    INSERT INTO public.graph_nodes (entity_type, is_strategic, metadata)
    VALUES ('task', COALESCE(rec.is_strategic, false), jsonb_build_object('entity_id', rec.id, 'backfilled', true))
    RETURNING id INTO new_node_id;
    
    UPDATE public.tasks SET graph_node_id = new_node_id WHERE id = rec.id;
  END LOOP;
  
  RAISE NOTICE 'Backfill complete';
END;
$$;
