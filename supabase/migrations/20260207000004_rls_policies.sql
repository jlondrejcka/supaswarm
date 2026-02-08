-- Migration: Fix RLS - enable on all tables, add UI-facing policies
-- The frontend uses the anon key. Edge functions use service_role (bypasses RLS).
-- Strategy: anon gets SELECT on all management tables, INSERT/UPDATE on tables
-- the dashboard manages directly. Write-heavy operational tables are service_role only.

-- =============================================
-- 1. ENABLE RLS ON TABLES THAT WERE MISSING IT
-- =============================================
ALTER TABLE public.agent_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.human_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llm_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 2. READ POLICIES (anon can read dashboard data)
-- =============================================

-- agents: already has read_agents SELECT true
-- tools: already has read_tools SELECT true

-- skills (newly RLS-enabled)
CREATE POLICY "read_skills" ON public.skills FOR SELECT USING (true);

-- llm_providers (newly RLS-enabled)
CREATE POLICY "read_llm_providers" ON public.llm_providers FOR SELECT USING (true);

-- agent_tools (newly RLS-enabled)
CREATE POLICY "read_agent_tools" ON public.agent_tools FOR SELECT USING (true);

-- agent_skills (newly RLS-enabled)
CREATE POLICY "read_agent_skills" ON public.agent_skills FOR SELECT USING (true);

-- human_reviews (newly RLS-enabled)
CREATE POLICY "read_human_reviews" ON public.human_reviews FOR SELECT USING (true);

-- tasks (RLS on, no read policy)
CREATE POLICY "read_tasks" ON public.tasks FOR SELECT USING (true);

-- task_messages (RLS on, only webchat policy — add general read)
CREATE POLICY "read_task_messages" ON public.task_messages FOR SELECT USING (true);

-- sessions (RLS on, only webchat policy — add general read)
CREATE POLICY "read_sessions" ON public.sessions FOR SELECT USING (true);

-- session_metadata
CREATE POLICY "read_session_metadata" ON public.session_metadata FOR SELECT USING (true);

-- task_assignments
CREATE POLICY "read_task_assignments" ON public.task_assignments FOR SELECT USING (true);

-- activities
CREATE POLICY "read_activities" ON public.activities FOR SELECT USING (true);

-- notifications
CREATE POLICY "read_notifications" ON public.notifications FOR SELECT USING (true);

-- messages (inter-agent)
CREATE POLICY "read_messages" ON public.messages FOR SELECT USING (true);

-- channel_connections
CREATE POLICY "read_channel_connections" ON public.channel_connections FOR SELECT USING (true);

-- channel_events
CREATE POLICY "read_channel_events" ON public.channel_events FOR SELECT USING (true);

-- agent_crons
CREATE POLICY "read_agent_crons" ON public.agent_crons FOR SELECT USING (true);

-- cron_logs
CREATE POLICY "read_cron_logs" ON public.cron_logs FOR SELECT USING (true);

-- agent_code_files
CREATE POLICY "read_agent_code_files" ON public.agent_code_files FOR SELECT USING (true);

-- deployed_functions
CREATE POLICY "read_deployed_functions" ON public.deployed_functions FOR SELECT USING (true);

-- vectors (read for knowledge base browser)
CREATE POLICY "read_vectors" ON public.vectors FOR SELECT USING (true);

-- memory_nodes
CREATE POLICY "read_memory_nodes" ON public.memory_nodes FOR SELECT USING (true);

-- memory_edges
CREATE POLICY "read_memory_edges" ON public.memory_edges FOR SELECT USING (true);

-- audit_log (read for audit viewer)
CREATE POLICY "read_audit_log" ON public.audit_log FOR SELECT USING (true);

-- =============================================
-- 3. WRITE POLICIES (dashboard management)
-- =============================================

-- agents: dashboard creates/edits agents
CREATE POLICY "manage_agents" ON public.agents FOR ALL USING (true) WITH CHECK (true);

-- tools: dashboard creates/edits tools
CREATE POLICY "manage_tools" ON public.tools FOR INSERT WITH CHECK (true);
CREATE POLICY "update_tools" ON public.tools FOR UPDATE USING (true) WITH CHECK (true);

-- skills: dashboard creates/edits skills
CREATE POLICY "manage_skills" ON public.skills FOR INSERT WITH CHECK (true);
CREATE POLICY "update_skills" ON public.skills FOR UPDATE USING (true) WITH CHECK (true);

-- llm_providers: settings page updates providers
CREATE POLICY "update_llm_providers" ON public.llm_providers FOR UPDATE USING (true) WITH CHECK (true);

-- provider_models: settings page toggles models
-- already has "Allow all access to provider_models" for ALL

-- agent_tools: agents page assigns tools
CREATE POLICY "manage_agent_tools" ON public.agent_tools FOR INSERT WITH CHECK (true);
CREATE POLICY "delete_agent_tools" ON public.agent_tools FOR DELETE USING (true);

-- agent_skills: agents page assigns skills
CREATE POLICY "manage_agent_skills" ON public.agent_skills FOR INSERT WITH CHECK (true);
CREATE POLICY "delete_agent_skills" ON public.agent_skills FOR DELETE USING (true);

-- human_reviews: reviews page approves/rejects
CREATE POLICY "manage_human_reviews" ON public.human_reviews FOR INSERT WITH CHECK (true);
CREATE POLICY "update_human_reviews" ON public.human_reviews FOR UPDATE USING (true) WITH CHECK (true);

-- tasks: chat dialog creates tasks, retry updates tasks
CREATE POLICY "insert_tasks" ON public.tasks FOR INSERT WITH CHECK (true);
CREATE POLICY "update_tasks" ON public.tasks FOR UPDATE USING (true) WITH CHECK (true);

-- sessions: chat dialog creates sessions
CREATE POLICY "insert_sessions" ON public.sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "update_sessions" ON public.sessions FOR UPDATE USING (true) WITH CHECK (true);

-- task_messages: read-only for UI (writes via service_role in edge functions)
-- No INSERT/UPDATE policy needed for anon

-- Vault function access: keep restricted to service_role
-- (already revoked in migration 3)
