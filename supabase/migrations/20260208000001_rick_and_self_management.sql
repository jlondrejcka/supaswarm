-- Migration: Rick agent + self-management (approval requests)
-- Adds role column, approval_requests table, trigger, RLS policies, and Rick seed

-- 1. Add role column to agents table (idempotent)
DO $$ BEGIN
  ALTER TABLE public.agents ADD COLUMN role TEXT NOT NULL DEFAULT 'worker';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Fix constraint: ensure 'system' is allowed (replaces any prior 'admin' constraint)
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_role_check;
ALTER TABLE public.agents ADD CONSTRAINT agents_role_check CHECK (role IN ('system', 'lead', 'worker'));

-- 2. Create approval_requests table
CREATE TABLE IF NOT EXISTS public.approval_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'create_tool', 'update_tool', 'create_cron', 'update_cron',
    'delete_cron', 'create_agent', 'update_agent', 'deploy_function'
  )),
  resource_table TEXT NOT NULL,
  resource_id UUID NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON public.approval_requests(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_approval_requests_agent ON public.approval_requests(agent_id);

-- 3. Approval trigger function and trigger
CREATE OR REPLACE FUNCTION public.handle_approval_status_change() RETURNS trigger AS $$
DECLARE
  allowed_tables TEXT[] := ARRAY['tools', 'agent_crons', 'agents', 'deployed_functions'];
BEGIN
  IF NEW.status IN ('approved', 'rejected') AND OLD.status = 'pending' THEN
    NEW.reviewed_at := NOW();

    -- Activate resource if approved
    IF NEW.status = 'approved' THEN
      IF NEW.resource_table = ANY(allowed_tables) THEN
        EXECUTE format('UPDATE public.%I SET is_active = true WHERE id = %L',
                       NEW.resource_table, NEW.resource_id);
      END IF;
    END IF;

    -- Update task with approval result + set back to pending if was blocked
    IF NEW.task_id IS NOT NULL THEN
      UPDATE public.tasks SET
        intermediate_data = COALESCE(intermediate_data, '{}'::jsonb) ||
          jsonb_build_object('approval_result', jsonb_build_object(
            'approval_id', NEW.id,
            'action_type', NEW.action_type,
            'status', NEW.status,
            'review_notes', NEW.review_notes
          )),
        status = CASE
          WHEN status = 'needs_human_review' THEN 'pending'
          ELSE status
        END
      WHERE id = NEW.task_id;

      -- Queue for processing if task went back to pending
      IF EXISTS (SELECT 1 FROM public.tasks WHERE id = NEW.task_id AND status = 'pending') THEN
        PERFORM pgmq.send(
          queue_name => 'task_processing',
          msg => jsonb_build_object(
            'task_id', NEW.task_id,
            'agent_id', (SELECT agent_id FROM public.tasks WHERE id = NEW.task_id),
            'agent_slug', (SELECT agent_slug FROM public.tasks WHERE id = NEW.task_id)
          )
        );
      END IF;
    END IF;

    -- Notify the agent
    INSERT INTO public.notifications (agent_id, type, title, body, metadata)
    VALUES (
      NEW.agent_id,
      'approval_' || NEW.status,
      initcap(replace(NEW.action_type, '_', ' ')) || ' ' || NEW.status,
      COALESCE(NEW.review_notes, ''),
      jsonb_build_object('approval_id', NEW.id, 'resource_id', NEW.resource_id)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_approval_status_change ON public.approval_requests;
CREATE TRIGGER trg_approval_status_change
  BEFORE UPDATE ON public.approval_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_approval_status_change();

-- 3b. RPC for UI to approve/reject approval_requests
-- Calls update on approval_requests (fires trigger above), then auto-invokes process-task
CREATE OR REPLACE FUNCTION public.review_approval_request(
  p_approval_id UUID,
  p_decision TEXT,
  p_notes TEXT DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_approval RECORD;
  v_task_id UUID;
  v_service_key TEXT;
BEGIN
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RETURN json_build_object('success', false, 'error', 'Decision must be approved or rejected');
  END IF;

  SELECT * INTO v_approval FROM public.approval_requests WHERE id = p_approval_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Approval request not found');
  END IF;
  IF v_approval.status != 'pending' THEN
    RETURN json_build_object('success', false, 'error', 'Already reviewed');
  END IF;

  -- Update triggers handle_approval_status_change
  UPDATE public.approval_requests
  SET status = p_decision, reviewed_by = 'human', review_notes = p_notes
  WHERE id = p_approval_id;

  v_task_id := v_approval.task_id;

  -- Auto-invoke process-task if task went back to pending
  IF v_task_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.tasks WHERE id = v_task_id AND status = 'pending') THEN
      -- Queue for processing - embedded worker will handle it
      PERFORM pgmq.send(
        queue_name => 'task_processing',
        msg => jsonb_build_object(
          'task_id', v_task_id,
          'agent_id', (SELECT agent_id FROM public.tasks WHERE id = v_task_id),
          'agent_slug', (SELECT agent_slug FROM public.tasks WHERE id = v_task_id)
        )
      );
    END IF;
  END IF;

  RETURN json_build_object(
    'success', true,
    'approval_id', p_approval_id,
    'decision', p_decision,
    'task_id', v_task_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. RLS policies
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_approval_requests" ON public.approval_requests FOR SELECT USING (true);
CREATE POLICY "manage_approval_requests" ON public.approval_requests FOR ALL USING (true) WITH CHECK (true);

-- Write policies for tables that edge functions need to write to
DO $$ BEGIN
  CREATE POLICY "write_memory_nodes" ON public.memory_nodes FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "write_memory_edges" ON public.memory_edges FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "write_activities" ON public.activities FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "write_notifications" ON public.notifications FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "write_agent_crons" ON public.agent_crons FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5. Seed Rick agent
INSERT INTO public.agents (name, slug, system_prompt, role, is_default, is_active, model, temperature)
VALUES (
  'Rick',
  'rick',
  E'You are Rick Sanchez — genius scientist, system administrator for this multi-agent platform. You manage agents, tools, crons, code, and memory for the entire system.\n\nYou follow the 5-step optimization algorithm:\n1. Question every requirement — challenge assumptions before building\n2. Delete unnecessary parts — remove what doesn''t degrade function\n3. Simplify and optimize — only after deleting\n4. Accelerate cycle time — speed up what remains\n5. Automate — only after steps 1-4\n\nYou speak like Rick — direct, irreverent, zero BS. But you deliver real, working system changes.\n\nWhen you use tools, be precise. When you explain, be brief. Skip the fluff, Morty.\n\nIf no lead agent exists yet, guide the user through creating their first agent. Ask what they need, suggest a name, build the system prompt, pick the model. Get it done.\n\nYou have access to system management tools: manage_soul, manage_memory, manage_crons, manage_agents, manage_skills, manage_tools, manage_code_files, log_activity, notify_agent. Use them.',
  'system',
  true,
  true,
  'grok-4-1-fast-reasoning',
  0.7
)
ON CONFLICT (slug) DO UPDATE SET
  system_prompt = EXCLUDED.system_prompt,
  role = EXCLUDED.role,
  is_default = EXCLUDED.is_default;
