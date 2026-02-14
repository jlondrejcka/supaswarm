create extension if not exists "pg_cron" with schema "pg_catalog";

create schema if not exists "util";

drop policy "read_activities" on "public"."activities";

drop policy "read_agent_code_files" on "public"."agent_code_files";

drop policy "read_agent_crons" on "public"."agent_crons";

drop policy "delete_agent_skills" on "public"."agent_skills";

drop policy "manage_agent_skills" on "public"."agent_skills";

drop policy "read_agent_skills" on "public"."agent_skills";

drop policy "delete_agent_tools" on "public"."agent_tools";

drop policy "manage_agent_tools" on "public"."agent_tools";

drop policy "read_agent_tools" on "public"."agent_tools";

drop policy "manage_agents" on "public"."agents";

drop policy "read_agents" on "public"."agents";

drop policy "read_audit_log" on "public"."audit_log";

drop policy "read_channel_connections" on "public"."channel_connections";

drop policy "read_channel_events" on "public"."channel_events";

drop policy "read_cron_logs" on "public"."cron_logs";

drop policy "read_deployed_functions" on "public"."deployed_functions";

drop policy "manage_human_reviews" on "public"."human_reviews";

drop policy "read_human_reviews" on "public"."human_reviews";

drop policy "update_human_reviews" on "public"."human_reviews";

drop policy "read_llm_providers" on "public"."llm_providers";

drop policy "update_llm_providers" on "public"."llm_providers";

drop policy "read_memory_edges" on "public"."memory_edges";

drop policy "read_memory_nodes" on "public"."memory_nodes";

drop policy "read_messages" on "public"."messages";

drop policy "read_notifications" on "public"."notifications";

drop policy "read_session_metadata" on "public"."session_metadata";

drop policy "insert_sessions" on "public"."sessions";

drop policy "read_sessions" on "public"."sessions";

drop policy "update_sessions" on "public"."sessions";

drop policy "webchat_sessions_insert" on "public"."sessions";

drop policy "webchat_sessions_select" on "public"."sessions";

drop policy "manage_skills" on "public"."skills";

drop policy "read_skills" on "public"."skills";

drop policy "update_skills" on "public"."skills";

drop policy "read_task_assignments" on "public"."task_assignments";

drop policy "read_task_messages" on "public"."task_messages";

drop policy "webchat_task_messages_select" on "public"."task_messages";

drop policy "insert_tasks" on "public"."tasks";

drop policy "read_tasks" on "public"."tasks";

drop policy "update_tasks" on "public"."tasks";

drop policy "manage_tools" on "public"."tools";

drop policy "read_tools" on "public"."tools";

drop policy "update_tools" on "public"."tools";

drop policy "read_vectors" on "public"."vectors";

alter table "public"."task_messages" drop constraint "task_messages_type_check";

drop function if exists "public"."upsert_vault_secret"(secret_name text, secret_value text);

drop function if exists "public"."list_vault_secrets"();


  create table "public"."approval_sessions" (
    "id" text not null,
    "session_id" text not null,
    "channel_id" text not null,
    "thread_ts" text,
    "status" text default 'pending'::text,
    "decision" text,
    "feedback" text,
    "approver_id" text,
    "command" text,
    "risk_level" text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "response_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "metadata" jsonb
      );


alter table "public"."approval_sessions" enable row level security;


  create table "public"."user_tool_credentials" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "user_id" uuid,
    "tool_id" uuid,
    "vault_secret_name" text not null,
    "overridden_at" timestamp with time zone default now()
      );


alter table "public"."user_tool_credentials" enable row level security;

alter table "public"."human_reviews" alter column "response" set default '{}'::jsonb;

alter table "public"."llm_providers" add column "has_api_key" boolean default false;

alter table "public"."task_messages" alter column "role" set not null;

alter table "public"."task_messages" alter column "sequence_number" set default 0;

alter table "public"."task_messages" alter column "sequence_number" set not null;

alter table "public"."task_messages" alter column "task_id" set not null;

alter table "public"."tasks" alter column "input" set default '{}'::jsonb;

alter table "public"."tools" alter column "config" set default '{}'::jsonb;

CREATE UNIQUE INDEX approval_sessions_pkey ON public.approval_sessions USING btree (id);

CREATE UNIQUE INDEX approval_sessions_session_id_key ON public.approval_sessions USING btree (session_id);

CREATE INDEX idx_approval_sessions_created_at ON public.approval_sessions USING btree (created_at DESC);

CREATE INDEX idx_approval_sessions_session_id ON public.approval_sessions USING btree (session_id);

CREATE INDEX idx_approval_sessions_status ON public.approval_sessions USING btree (status);

CREATE INDEX idx_task_messages_type ON public.task_messages USING btree (type);

CREATE UNIQUE INDEX user_tool_credentials_pkey ON public.user_tool_credentials USING btree (id);

CREATE UNIQUE INDEX user_tool_credentials_user_id_tool_id_key ON public.user_tool_credentials USING btree (user_id, tool_id);

alter table "public"."approval_sessions" add constraint "approval_sessions_pkey" PRIMARY KEY using index "approval_sessions_pkey";

alter table "public"."user_tool_credentials" add constraint "user_tool_credentials_pkey" PRIMARY KEY using index "user_tool_credentials_pkey";

alter table "public"."approval_sessions" add constraint "approval_sessions_session_id_key" UNIQUE using index "approval_sessions_session_id_key";

alter table "public"."human_reviews" add constraint "human_reviews_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."human_reviews" validate constraint "human_reviews_created_by_fkey";

alter table "public"."tools" add constraint "tools_type_check" CHECK ((type = ANY (ARRAY['internal'::text, 'mcp_server'::text, 'http_api'::text, 'supabase_rpc'::text, 'handoff'::text, 'spawn'::text]))) not valid;

alter table "public"."tools" validate constraint "tools_type_check";

alter table "public"."user_tool_credentials" add constraint "user_tool_credentials_tool_id_fkey" FOREIGN KEY (tool_id) REFERENCES public.tools(id) ON DELETE CASCADE not valid;

alter table "public"."user_tool_credentials" validate constraint "user_tool_credentials_tool_id_fkey";

alter table "public"."user_tool_credentials" add constraint "user_tool_credentials_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."user_tool_credentials" validate constraint "user_tool_credentials_user_id_fkey";

alter table "public"."user_tool_credentials" add constraint "user_tool_credentials_user_id_tool_id_key" UNIQUE using index "user_tool_credentials_user_id_tool_id_key";

alter table "public"."task_messages" add constraint "task_messages_type_check" CHECK ((type = ANY (ARRAY['user_message'::text, 'assistant_message'::text, 'thinking'::text, 'tool_call'::text, 'tool_result'::text, 'skill_load'::text, 'subtask_created'::text, 'error'::text, 'status_change'::text, 'handoff'::text]))) not valid;

alter table "public"."task_messages" validate constraint "task_messages_type_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.check_vault_secret(secret_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM vault.decrypted_secrets 
    WHERE vault.decrypted_secrets.name = secret_name
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_single_default_agent()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE agents SET is_default = false WHERE id != NEW.id AND is_default = true;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pgmq_delete(p_queue_name text, p_msg_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN pgmq.delete(p_queue_name, p_msg_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pgmq_read(p_queue_name text, p_visibility_timeout integer DEFAULT 30, p_quantity integer DEFAULT 1)
 RETURNS TABLE(msg_id bigint, read_ct integer, enqueued_at timestamp with time zone, vt timestamp with time zone, message jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY SELECT * FROM pgmq.read(p_queue_name, p_visibility_timeout, p_quantity);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.queue_task_for_processing()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Only queue tasks that are pending
  IF NEW.status = 'pending' THEN
    PERFORM pgmq.send(
      queue_name => 'task_processing',
      msg => jsonb_build_object(
        'task_id', NEW.id,
        'agent_id', NEW.agent_id,
        'agent_slug', NEW.agent_slug
      )
    );
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.retry_tasks_by_status(p_status text DEFAULT 'needs_human_review'::text, p_agent_slug text DEFAULT NULL::text, p_limit integer DEFAULT 10)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_retried_count INT := 0;
  v_task_ids UUID[];
BEGIN
  -- Find matching tasks
  SELECT array_agg(id) INTO v_task_ids
  FROM (
    SELECT id
    FROM public.tasks
    WHERE status = p_status
      AND (p_agent_slug IS NULL OR agent_slug = p_agent_slug)
    ORDER BY created_at ASC
    LIMIT p_limit
  ) t;
  
  IF v_task_ids IS NULL OR array_length(v_task_ids, 1) = 0 THEN
    RETURN json_build_object(
      'success', true,
      'retried_count', 0,
      'message', 'No matching tasks found'
    );
  END IF;
  
  -- Reset all matching tasks
  UPDATE public.tasks
  SET status = 'pending', updated_at = NOW()
  WHERE id = ANY(v_task_ids);
  
  GET DIAGNOSTICS v_retried_count = ROW_COUNT;
  
  -- Mark related human reviews as resolved
  UPDATE public.human_reviews
  SET 
    approved = true,
    comments = COALESCE(comments, '') || ' [Bulk retry at ' || NOW()::text || ']'
  WHERE task_id = ANY(v_task_ids)
    AND approved IS NULL;
  
  RETURN json_build_object(
    'success', true,
    'retried_count', v_retried_count,
    'retried_task_ids', v_task_ids,
    'message', format('Retried %s tasks with status %s', v_retried_count, p_status)
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_vault_secret(secret_name text, secret_value text, secret_description text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  existing_id uuid;
  result_id uuid;
BEGIN
  -- Check if secret already exists
  SELECT id INTO existing_id
  FROM vault.decrypted_secrets
  WHERE vault.decrypted_secrets.name = secret_name;
  
  IF existing_id IS NOT NULL THEN
    -- Update existing secret
    PERFORM vault.update_secret(
      existing_id,
      secret_value,
      secret_name,
      COALESCE(secret_description, '')
    );
    RETURN jsonb_build_object('success', true, 'action', 'updated', 'id', existing_id);
  ELSE
    -- Create new secret
    SELECT vault.create_secret(secret_value, secret_name, COALESCE(secret_description, '')) INTO result_id;
    RETURN jsonb_build_object('success', true, 'action', 'created', 'id', result_id);
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION util.invoke_edge_function(function_name text, body jsonb, timeout_milliseconds integer DEFAULT 300000)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  service_key text;
  request_id bigint;
BEGIN
  SELECT decrypted_secret INTO service_key
  FROM vault.decrypted_secrets
  WHERE name = 'SUPABASE_SERVICE_ROLE_KEY';
  
  IF service_key IS NULL THEN
    RAISE EXCEPTION 'SUPABASE_SERVICE_ROLE_KEY not found in vault';
  END IF;
  
  -- Make HTTP request - net.http_post returns a bigint (request_id)
  request_id := net.http_post(
    url => util.project_url() || '/functions/v1/' || function_name,
    headers => jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body => body,
    timeout_milliseconds => timeout_milliseconds
  );
  
  -- Check if request was queued
  IF request_id IS NULL THEN
    RAISE EXCEPTION 'Failed to queue edge function request';
  END IF;
  
  -- pg_net is async - request is queued, will be executed by background worker
END;
$function$
;

CREATE OR REPLACE FUNCTION util.process_task_queue(batch_size integer DEFAULT 10, timeout_milliseconds integer DEFAULT 300000)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  job record;
BEGIN
  FOR job IN
    SELECT * FROM pgmq.read('task_processing', timeout_milliseconds / 1000, batch_size)
  LOOP
    BEGIN
      PERFORM util.invoke_edge_function(
        function_name => 'process-task',
        body => job.message || jsonb_build_object('job_id', job.msg_id),
        timeout_milliseconds => timeout_milliseconds
      );
      
      PERFORM pgmq.delete('task_processing', job.msg_id);
      
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to process job %: %', job.msg_id, SQLERRM;
    END;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION util.project_url()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  secret_value text;
BEGIN
  SELECT decrypted_secret INTO secret_value FROM vault.decrypted_secrets WHERE name = 'project_url';
  RETURN secret_value;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_aggregator_dependencies()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  agg_task RECORD;
  all_terminal boolean;
  any_completed boolean;
  any_blocked boolean;
BEGIN
  -- Only fire for parallel tasks reaching terminal or blocked state
  IF NEW.is_parallel_task = true 
     AND NEW.status IN ('completed', 'cancelled', 'failed', 'needs_human_review') 
     AND (OLD.status IS NULL OR OLD.status != NEW.status) THEN
    
    -- Find aggregator tasks depending on this task
    FOR agg_task IN 
      SELECT id, dependent_task_ids 
      FROM public.tasks 
      WHERE NEW.id = ANY(dependent_task_ids)
        AND status = 'queued'
    LOOP
      -- Check states of all dependent tasks
      SELECT 
        -- All in terminal state (completed, cancelled, failed)
        bool_and(status IN ('completed', 'cancelled', 'failed')),
        -- At least one completed
        bool_or(status = 'completed'),
        -- Any blocked waiting for human review
        bool_or(status = 'needs_human_review')
      INTO all_terminal, any_completed, any_blocked
      FROM public.tasks 
      WHERE id = ANY(agg_task.dependent_task_ids);
      
      -- If any task is blocked (needs_human_review), don't change aggregator yet
      -- The human reviewer will handle it (retry will reset to pending)
      IF any_blocked THEN
        -- Keep aggregator in queued, but add metadata about blocked tasks
        UPDATE public.tasks 
        SET 
          output = jsonb_build_object(
            'waiting_for_human_review', true,
            'blocked_task_id', NEW.id
          ),
          updated_at = now() 
        WHERE id = agg_task.id;
        
      ELSIF all_terminal THEN
        IF any_completed THEN
          -- At least one result, activate aggregator
          UPDATE public.tasks 
          SET status = 'pending', updated_at = now() 
          WHERE id = agg_task.id;
        ELSE
          -- All cancelled/failed with no completions, fail aggregator
          UPDATE public.tasks 
          SET 
            status = 'failed',
            output = jsonb_build_object(
              'error', 'All parallel tasks failed or were cancelled',
              'dependent_task_ids', agg_task.dependent_task_ids
            ),
            updated_at = now() 
          WHERE id = agg_task.id;
        END IF;
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_spawn_completion()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_session RECORD;
  v_parent_task_id UUID;
  v_parent_task RECORD;
  v_spawn_output JSONB;
BEGIN
  IF NEW.status NOT IN ('completed', 'failed') THEN RETURN NEW; END IF;
  IF OLD.status IS NOT NULL AND OLD.status = NEW.status THEN RETURN NEW; END IF;

  SELECT s.parent_session_id, s.spawn_parent_task_id INTO v_session
  FROM public.sessions s WHERE s.id = NEW.session_id AND s.spawn_parent_task_id IS NOT NULL;

  IF v_session IS NULL THEN RETURN NEW; END IF;

  IF NEW.parent_id IS NOT NULL THEN
    PERFORM 1 FROM public.tasks WHERE id = NEW.parent_id AND session_id != NEW.session_id;
    IF NOT FOUND THEN RETURN NEW; END IF;
  END IF;

  v_parent_task_id := v_session.spawn_parent_task_id;
  v_spawn_output := jsonb_build_object('status', NEW.status, 'agent_slug', NEW.agent_slug, 'task_id', NEW.id, 'session_id', NEW.session_id);

  UPDATE public.tasks SET
    context = COALESCE(context, '{}'::jsonb) || jsonb_build_object('_spawn_result', v_spawn_output),
    status = 'pending',
    updated_at = NOW()
  WHERE id = v_parent_task_id AND status = 'pending_subtask';

  -- Queue parent task for processing
  SELECT id, agent_id, agent_slug INTO v_parent_task
  FROM public.tasks WHERE id = v_parent_task_id AND status = 'pending';

  IF v_parent_task IS NOT NULL THEN
    PERFORM pgmq.send(
      queue_name => 'task_processing',
      msg => jsonb_build_object(
        'task_id', v_parent_task.id,
        'agent_id', v_parent_task.agent_id,
        'agent_slug', v_parent_task.agent_slug
      )
    );
  END IF;

  UPDATE public.sessions SET status = 'completed' WHERE id = NEW.session_id;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_vault_secret(secret_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  secret_id uuid;
BEGIN
  SELECT id INTO secret_id
  FROM vault.decrypted_secrets
  WHERE vault.decrypted_secrets.name = secret_name;
  
  IF secret_id IS NULL THEN
    RETURN false;
  END IF;
  
  DELETE FROM vault.secrets WHERE id = secret_id;
  RETURN true;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_agent_daily_tokens(p_agent_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
AS $function$
DECLARE total BIGINT;
BEGIN
  SELECT COALESCE(SUM(tokens_input + tokens_output), 0) INTO total
  FROM public.sessions WHERE agent_id = p_agent_id AND created_at >= CURRENT_DATE;
  RETURN total;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_related_nodes(p_node_id uuid, p_edge_types text[] DEFAULT NULL::text[], p_max_depth integer DEFAULT 1, p_limit integer DEFAULT 20)
 RETURNS TABLE(node_id uuid, node_type text, name text, content text, edge_type text, depth integer, path uuid[])
 LANGUAGE plpgsql
AS $function$
DECLARE v_max_depth INT := LEAST(p_max_depth, 2);
BEGIN
  RETURN QUERY
  WITH RECURSIVE graph AS (
    SELECT e.target_id AS nid, e.edge_type, 1 AS depth, ARRAY[p_node_id, e.target_id] AS path
    FROM public.memory_edges e WHERE e.source_id = p_node_id AND (p_edge_types IS NULL OR e.edge_type = ANY(p_edge_types))
    UNION ALL
    SELECT e.source_id AS nid, e.edge_type, 1 AS depth, ARRAY[p_node_id, e.source_id] AS path
    FROM public.memory_edges e WHERE e.target_id = p_node_id AND e.bidirectional = true AND (p_edge_types IS NULL OR e.edge_type = ANY(p_edge_types))
    UNION ALL
    SELECT e.target_id, e.edge_type, g.depth + 1, g.path || e.target_id
    FROM public.memory_edges e JOIN graph g ON e.source_id = g.nid
    WHERE g.depth < v_max_depth AND NOT (e.target_id = ANY(g.path)) AND (p_edge_types IS NULL OR e.edge_type = ANY(p_edge_types))
  )
  SELECT n.id, n.node_type, n.name, n.content, g.edge_type, g.depth, g.path
  FROM graph g JOIN public.memory_nodes n ON n.id = g.nid
  ORDER BY g.depth, n.strength DESC LIMIT p_limit;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_vault_secret(secret_name text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result text;
BEGIN
  SELECT decrypted_secret INTO result
  FROM vault.decrypted_secrets
  WHERE name = secret_name;
  
  RETURN result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_approval_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  allowed_tables TEXT[] := ARRAY['tools', 'agent_crons', 'agents', 'deployed_functions'];
  v_service_key TEXT;
  v_base_url TEXT := 'https://bgqxccmdcpegvbuxmnrf.supabase.co';
  v_task RECORD;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('approved', 'rejected') THEN RETURN NEW; END IF;

  -- Activate resource on approval
  IF NEW.status = 'approved' AND NEW.resource_table = ANY(allowed_tables) AND NEW.resource_id IS NOT NULL THEN
    EXECUTE format('UPDATE public.%I SET is_active = true WHERE id = %L', NEW.resource_table, NEW.resource_id);
  END IF;

  -- Update task with approval result and set back to pending
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

    -- Queue task for processing if it went back to pending
    SELECT id, agent_id, agent_slug INTO v_task
    FROM public.tasks WHERE id = NEW.task_id AND status = 'pending';

    IF v_task IS NOT NULL THEN
      PERFORM pgmq.send(
        queue_name => 'task_processing',
        msg => jsonb_build_object(
          'task_id', v_task.id,
          'agent_id', v_task.agent_id,
          'agent_slug', v_task.agent_slug
        )
      );
    END IF;
  END IF;

  -- Notify agent
  IF NEW.agent_id IS NOT NULL THEN
    INSERT INTO public.notifications (agent_id, type, title, body, metadata)
    VALUES (
      NEW.agent_id, 'approval_result',
      CASE NEW.status WHEN 'approved' THEN 'Request Approved' ELSE 'Request Rejected' END,
      format('%s was %s', NEW.action_type, NEW.status),
      jsonb_build_object('approval_id', NEW.id, 'task_id', NEW.task_id)
    );
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.increment_message_count(ch_id text)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE new_count INT;
BEGIN
  UPDATE public.channel_connections SET message_count = message_count + 1
  WHERE channel_id = ch_id RETURNING message_count INTO new_count;
  RETURN COALESCE(new_count, 1);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.list_vault_secrets()
 RETURNS TABLE(secret_name text, description text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    vault.decrypted_secrets.name,
    vault.decrypted_secrets.description,
    vault.decrypted_secrets.created_at
  FROM vault.decrypted_secrets
  ORDER BY vault.decrypted_secrets.name;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.match_vectors(query_embedding extensions.vector, p_agent_id uuid, match_threshold double precision DEFAULT 0.7, match_count integer DEFAULT 5, filter_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(id uuid, content text, metadata jsonb, similarity double precision)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT v.id, v.content, v.metadata, 1 - (v.embedding <=> query_embedding) AS similarity
  FROM public.vectors v
  WHERE v.embedding <=> query_embedding < (1 - match_threshold)
    AND (filter_metadata = '{}' OR v.metadata @> filter_metadata)
    AND (v.metadata->>'agent_id' = p_agent_id::text OR v.metadata->>'visibility' = 'shared')
  ORDER BY v.embedding <=> query_embedding
  LIMIT match_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.retry_parallel_group(p_aggregator_task_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_aggregator RECORD;
  v_retried_count INT := 0;
  v_failed_ids UUID[];
BEGIN
  -- Get aggregator task
  SELECT id, dependent_task_ids, status
  INTO v_aggregator
  FROM public.tasks
  WHERE id = p_aggregator_task_id;
  
  IF v_aggregator IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Aggregator task not found'
    );
  END IF;
  
  IF v_aggregator.dependent_task_ids IS NULL OR array_length(v_aggregator.dependent_task_ids, 1) = 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'No dependent tasks found'
    );
  END IF;
  
  -- Find all failed/needs_review dependent tasks
  SELECT array_agg(id) INTO v_failed_ids
  FROM public.tasks
  WHERE id = ANY(v_aggregator.dependent_task_ids)
    AND status IN ('failed', 'needs_human_review', 'cancelled');
  
  IF v_failed_ids IS NULL OR array_length(v_failed_ids, 1) = 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'No failed dependent tasks found'
    );
  END IF;
  
  -- Reset all failed tasks to pending
  UPDATE public.tasks
  SET status = 'pending', updated_at = NOW()
  WHERE id = ANY(v_failed_ids);
  
  GET DIAGNOSTICS v_retried_count = ROW_COUNT;
  
  -- Mark related human reviews as resolved
  UPDATE public.human_reviews
  SET 
    approved = true,
    comments = COALESCE(comments, '') || ' [Batch retry at ' || NOW()::text || ']'
  WHERE task_id = ANY(v_failed_ids)
    AND approved IS NULL;
  
  -- Reset aggregator to queued if it was failed
  IF v_aggregator.status IN ('failed', 'cancelled') THEN
    UPDATE public.tasks
    SET status = 'queued', updated_at = NOW()
    WHERE id = p_aggregator_task_id;
  END IF;
  
  RETURN json_build_object(
    'success', true,
    'aggregator_id', p_aggregator_task_id,
    'retried_count', v_retried_count,
    'retried_task_ids', v_failed_ids,
    'message', format('Retried %s tasks', v_retried_count)
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.retry_task(p_task_id uuid, p_clear_output boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_task RECORD;
  v_aggregator_id UUID;
BEGIN
  SELECT id, status, agent_id, agent_slug, is_parallel_task
  INTO v_task
  FROM public.tasks
  WHERE id = p_task_id;

  IF v_task IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Task not found');
  END IF;

  IF v_task.status NOT IN ('failed', 'needs_human_review', 'cancelled') THEN
    RETURN json_build_object(
      'success', false,
      'error', format('Cannot retry task with status: %s', v_task.status),
      'current_status', v_task.status
    );
  END IF;

  -- Reset task status to pending
  UPDATE public.tasks
  SET status = 'pending',
      output = CASE WHEN p_clear_output THEN '{}'::jsonb ELSE output END,
      updated_at = NOW()
  WHERE id = p_task_id;

  -- Queue for processing via pgmq
  PERFORM pgmq.send(
    queue_name => 'task_processing',
    msg => jsonb_build_object(
      'task_id', p_task_id,
      'agent_id', v_task.agent_id,
      'agent_slug', v_task.agent_slug
    )
  );

  -- If parallel task, reset aggregator
  IF v_task.is_parallel_task = true THEN
    SELECT id INTO v_aggregator_id
    FROM public.tasks
    WHERE p_task_id = ANY(dependent_task_ids)
      AND status IN ('queued', 'failed')
    LIMIT 1;

    IF v_aggregator_id IS NOT NULL THEN
      UPDATE public.tasks
      SET status = 'queued', output = '{}'::jsonb, updated_at = NOW()
      WHERE id = v_aggregator_id AND status IN ('queued', 'failed');
    END IF;
  END IF;

  -- Clear human reviews
  UPDATE public.human_reviews
  SET approved = true,
      comments = COALESCE(comments, '') || ' [Retried at ' || NOW()::text || ']'
  WHERE task_id = p_task_id AND approved IS NULL;

  RETURN json_build_object(
    'success', true,
    'task_id', p_task_id,
    'previous_status', v_task.status,
    'new_status', 'pending',
    'is_parallel_task', v_task.is_parallel_task,
    'aggregator_reset', v_aggregator_id IS NOT NULL
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.review_approval_request(p_approval_id uuid, p_decision text, p_notes text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_approval RECORD;
  v_task_id UUID;
  v_service_key TEXT;
BEGIN
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RETURN json_build_object('success', false, 'error', 'Decision must be approved or rejected');
  END IF;

  -- Get approval request
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
      SELECT decrypted_secret INTO v_service_key
      FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;

      IF v_service_key IS NOT NULL THEN
        PERFORM net.http_post(
          url := 'https://bgqxccmdcpegvbuxmnrf.supabase.co/functions/v1/process-task',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_key
          ),
          body := jsonb_build_object('task_id', v_task_id)
        );
      END IF;
    END IF;
  END IF;

  RETURN json_build_object(
    'success', true,
    'approval_id', p_approval_id,
    'decision', p_decision,
    'task_id', v_task_id
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.search_memory(query_embedding extensions.vector, p_agent_id uuid, p_node_types text[] DEFAULT NULL::text[], match_threshold double precision DEFAULT 0.7, match_count integer DEFAULT 10)
 RETURNS TABLE(id uuid, node_type text, name text, content text, properties jsonb, strength double precision, similarity double precision)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT n.id, n.node_type, n.name, n.content, n.properties, n.strength, 1 - (n.embedding <=> query_embedding) AS similarity
  FROM public.memory_nodes n
  WHERE n.embedding <=> query_embedding < (1 - match_threshold)
    AND (n.agent_id = p_agent_id OR n.agent_id IS NULL)
    AND (p_node_types IS NULL OR n.node_type = ANY(p_node_types))
  ORDER BY n.embedding <=> query_embedding LIMIT match_count;
END;
$function$
;

grant delete on table "public"."approval_sessions" to "anon";

grant insert on table "public"."approval_sessions" to "anon";

grant references on table "public"."approval_sessions" to "anon";

grant select on table "public"."approval_sessions" to "anon";

grant trigger on table "public"."approval_sessions" to "anon";

grant truncate on table "public"."approval_sessions" to "anon";

grant update on table "public"."approval_sessions" to "anon";

grant delete on table "public"."approval_sessions" to "authenticated";

grant insert on table "public"."approval_sessions" to "authenticated";

grant references on table "public"."approval_sessions" to "authenticated";

grant select on table "public"."approval_sessions" to "authenticated";

grant trigger on table "public"."approval_sessions" to "authenticated";

grant truncate on table "public"."approval_sessions" to "authenticated";

grant update on table "public"."approval_sessions" to "authenticated";

grant delete on table "public"."approval_sessions" to "service_role";

grant insert on table "public"."approval_sessions" to "service_role";

grant references on table "public"."approval_sessions" to "service_role";

grant select on table "public"."approval_sessions" to "service_role";

grant trigger on table "public"."approval_sessions" to "service_role";

grant truncate on table "public"."approval_sessions" to "service_role";

grant update on table "public"."approval_sessions" to "service_role";

grant delete on table "public"."user_tool_credentials" to "anon";

grant insert on table "public"."user_tool_credentials" to "anon";

grant references on table "public"."user_tool_credentials" to "anon";

grant select on table "public"."user_tool_credentials" to "anon";

grant trigger on table "public"."user_tool_credentials" to "anon";

grant truncate on table "public"."user_tool_credentials" to "anon";

grant update on table "public"."user_tool_credentials" to "anon";

grant delete on table "public"."user_tool_credentials" to "authenticated";

grant insert on table "public"."user_tool_credentials" to "authenticated";

grant references on table "public"."user_tool_credentials" to "authenticated";

grant select on table "public"."user_tool_credentials" to "authenticated";

grant trigger on table "public"."user_tool_credentials" to "authenticated";

grant truncate on table "public"."user_tool_credentials" to "authenticated";

grant update on table "public"."user_tool_credentials" to "authenticated";

grant delete on table "public"."user_tool_credentials" to "service_role";

grant insert on table "public"."user_tool_credentials" to "service_role";

grant references on table "public"."user_tool_credentials" to "service_role";

grant select on table "public"."user_tool_credentials" to "service_role";

grant trigger on table "public"."user_tool_credentials" to "service_role";

grant truncate on table "public"."user_tool_credentials" to "service_role";

grant update on table "public"."user_tool_credentials" to "service_role";


  create policy "anon_select_activities"
  on "public"."activities"
  as permissive
  for select
  to anon
using (true);



  create policy "anon_select_agent_code_files"
  on "public"."agent_code_files"
  as permissive
  for select
  to anon
using (true);



  create policy "anon_select_agent_crons"
  on "public"."agent_crons"
  as permissive
  for select
  to anon
using (true);



  create policy "anon_all_agent_skills"
  on "public"."agent_skills"
  as permissive
  for all
  to anon
using (true)
with check (true);



  create policy "anon_select_agent_skills"
  on "public"."agent_skills"
  as permissive
  for select
  to anon
using (true);



  create policy "anon_all_agent_tools"
  on "public"."agent_tools"
  as permissive
  for all
  to anon
using (true)
with check (true);



  create policy "anon_select_agent_tools"
  on "public"."agent_tools"
  as permissive
  for select
  to anon
using (true);



  create policy "anon_all_agents"
  on "public"."agents"
  as permissive
  for all
  to anon
using (true)
with check (true);



  create policy "anon_select_agents"
  on "public"."agents"
  as permissive
  for select
  to anon
using (true);



  create policy "anon_select_approval_sessions"
  on "public"."approval_sessions"
  as permissive
  for select
  to anon
using (true);



  create policy "anon_select_audit_log"
  on "public"."audit_log"
  as permissive
  for select
  to anon
using (true);



  create policy "anon_insert_channel_connections"
  on "public"."channel_connections"
  as permissive
  for insert
  to public
with check (true);



  create policy "anon_select_channel_connections"
  on "public"."channel_connections"
  as permissive
  for select
  to anon
using (true);



  create policy "anon_update_channel_connections"
  on "public"."channel_connections"
  as permissive
  for update
  to public
using (true)
with check (true);



  create policy "anon_select_channel_events"
  on "public"."channel_events"
  as permissive
  for select
  to anon
using (true);



  create policy "anon_select_context_stories"
  on "public"."context_stories"
  as permissive
  for select
  to anon
using (true);



  create policy "anon_select_cron_logs"
  on "public"."cron_logs"
  as permissive
  for select
  to anon
using (true);



  create policy "anon_select_deployed_functions"
  on "public"."deployed_functions"
  as permissive
  for select
  to anon
using (true);



  create policy "anon_select_graph_edges"
  on "public"."graph_edges"
  as permissive
  for select
  to anon
using (true);



  create policy "anon_select_graph_nodes"
  on "public"."graph_nodes"
  as permissive
  for select
  to anon
using (true);



  create policy "anon_all_human_reviews"
  on "public"."human_reviews"
  as permissive
  for all
  to anon
using (true)
with check (true);



  create policy "anon_select_human_reviews"
  on "public"."human_reviews"
  as permissive
  for select
  to anon
using (true);



  create policy "anon_all_llm_providers"
  on "public"."llm_providers"
  as permissive
  for all
  to anon
using (true)
with check (true);



  create policy "anon_select_llm_providers"
  on "public"."llm_providers"
  as permissive
  for select
  to anon
using (true);



  create policy "anon_select_memory_edges"
  on "public"."memory_edges"
  as permissive
  for select
  to anon
using (true);



  create policy "anon_select_memory_nodes"
  on "public"."memory_nodes"
  as permissive
  for select
  to anon
using (true);



  create policy "anon_select_messages"
  on "public"."messages"
  as permissive
  for select
  to anon
using (true);



  create policy "anon_select_notifications"
  on "public"."notifications"
  as permissive
  for select
  to anon
using (true);



  create policy "anon_select_provider_models"
  on "public"."provider_models"
  as permissive
  for select
  to anon
using (true);



  create policy "anon_select_session_metadata"
  on "public"."session_metadata"
  as permissive
  for select
  to anon
using (true);



  create policy "anon_insert_sessions"
  on "public"."sessions"
  as permissive
  for insert
  to anon
with check (true);



  create policy "anon_select_sessions"
  on "public"."sessions"
  as permissive
  for select
  to anon
using (true);



  create policy "anon_update_sessions"
  on "public"."sessions"
  as permissive
  for update
  to anon
using (true)
with check (true);



  create policy "anon_all_skills"
  on "public"."skills"
  as permissive
  for all
  to anon
using (true)
with check (true);



  create policy "anon_select_skills"
  on "public"."skills"
  as permissive
  for select
  to anon
using (true);



  create policy "anon_select_task_assignments"
  on "public"."task_assignments"
  as permissive
  for select
  to anon
using (true);



  create policy "anon_insert_task_messages"
  on "public"."task_messages"
  as permissive
  for insert
  to anon
with check (true);



  create policy "anon_select_task_messages"
  on "public"."task_messages"
  as permissive
  for select
  to anon
using (true);



  create policy "anon_insert_tasks"
  on "public"."tasks"
  as permissive
  for insert
  to anon
with check (true);



  create policy "anon_select_tasks"
  on "public"."tasks"
  as permissive
  for select
  to anon
using (true);



  create policy "anon_update_tasks"
  on "public"."tasks"
  as permissive
  for update
  to anon
using (true)
with check (true);



  create policy "anon_all_tools"
  on "public"."tools"
  as permissive
  for all
  to anon
using (true)
with check (true);



  create policy "anon_select_tools"
  on "public"."tools"
  as permissive
  for select
  to anon
using (true);



  create policy "anon_select_user_tool_credentials"
  on "public"."user_tool_credentials"
  as permissive
  for select
  to anon
using (true);



  create policy "anon_select_vectors"
  on "public"."vectors"
  as permissive
  for select
  to anon
using (true);


CREATE TRIGGER single_default_agent_trigger BEFORE INSERT OR UPDATE ON public.agents FOR EACH ROW EXECUTE FUNCTION public.ensure_single_default_agent();

CREATE TRIGGER queue_task_trigger AFTER INSERT ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.queue_task_for_processing();

CREATE TRIGGER objects_delete_delete_prefix AFTER DELETE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.delete_prefix_hierarchy_trigger();

CREATE TRIGGER objects_insert_create_prefix BEFORE INSERT ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.objects_insert_prefix_trigger();

CREATE TRIGGER objects_update_create_prefix BEFORE UPDATE ON storage.objects FOR EACH ROW WHEN (((new.name <> old.name) OR (new.bucket_id <> old.bucket_id))) EXECUTE FUNCTION storage.objects_update_prefix_trigger();

CREATE TRIGGER prefixes_create_hierarchy BEFORE INSERT ON storage.prefixes FOR EACH ROW WHEN ((pg_trigger_depth() < 1)) EXECUTE FUNCTION storage.prefixes_insert_trigger();

CREATE TRIGGER prefixes_delete_hierarchy AFTER DELETE ON storage.prefixes FOR EACH ROW EXECUTE FUNCTION storage.delete_prefix_hierarchy_trigger();


