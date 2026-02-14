-- Migration: API Token System - Schema
-- Implements secure API token authentication with scoped permissions
-- Part of SupaSwarm Platform API Access Control

-- =============================================
-- USER PROFILES
-- =============================================
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text,
  role text DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email)
  VALUES (new.id, new.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- API TOKENS
-- =============================================
CREATE TYPE token_scope_type AS ENUM ('user', 'service');

CREATE TABLE IF NOT EXISTS public.api_tokens (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  token_hash text UNIQUE NOT NULL,
  prefix text UNIQUE NOT NULL,
  scope_type token_scope_type NOT NULL DEFAULT 'service',
  
  -- Service token options
  allowed_agent_ids uuid[], -- NULL = all agents
  
  -- CORS restrictions
  allowed_origins text[], -- NULL = any origin
  
  -- Metadata
  last_used_at timestamptz,
  expires_at timestamptz NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Constraints
  CONSTRAINT unique_token_name_per_user UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_api_tokens_prefix ON api_tokens(prefix);
CREATE INDEX IF NOT EXISTS idx_api_tokens_active ON api_tokens(is_active, expires_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_api_tokens_expires ON api_tokens(expires_at) WHERE is_active = true;

COMMENT ON COLUMN public.api_tokens.token_hash IS 'bcrypt hash of full token (never store plaintext)';
COMMENT ON COLUMN public.api_tokens.prefix IS 'First 16 chars of token for identification (e.g., ss_live_xxxxxxxx)';
COMMENT ON COLUMN public.api_tokens.scope_type IS 'service=full access (can be agent-scoped), user=RLS-aware';
COMMENT ON COLUMN public.api_tokens.allowed_agent_ids IS 'For service tokens: restrict to specific agents, NULL=all';
COMMENT ON COLUMN public.api_tokens.allowed_origins IS 'CORS: restrict by origin, NULL=any, [*]=any, or specific domains';

-- =============================================
-- TOKEN PERMISSIONS
-- =============================================
CREATE TABLE IF NOT EXISTS public.token_permissions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  token_id uuid NOT NULL REFERENCES api_tokens(id) ON DELETE CASCADE,
  
  -- Route pattern matching
  resource text NOT NULL, -- "agents", "tasks", "sessions", "tools", "skills", "channels"
  route_pattern text NOT NULL, -- "/api/agents", "/api/tasks/*", "/api/agents/:id"
  
  -- CRUD operations
  can_create boolean DEFAULT false,
  can_read boolean DEFAULT false,
  can_update boolean DEFAULT false,
  can_delete boolean DEFAULT false,
  
  created_at timestamptz DEFAULT now(),
  
  UNIQUE(token_id, resource, route_pattern)
);

CREATE INDEX IF NOT EXISTS idx_token_permissions_token ON token_permissions(token_id);
CREATE INDEX IF NOT EXISTS idx_token_permissions_resource ON token_permissions(resource);

COMMENT ON COLUMN public.token_permissions.route_pattern IS 'Pattern: /api/agents (exact), /api/agents/* (wildcard), /api/agents/:id (param)';

-- =============================================
-- TOKEN USAGE LOGS
-- =============================================
CREATE TABLE IF NOT EXISTS public.token_usage_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  token_id uuid NOT NULL REFERENCES api_tokens(id) ON DELETE CASCADE,
  
  -- Request details
  endpoint text NOT NULL,
  method text NOT NULL,
  status_code int,
  response_time_ms int,
  
  -- LLM token tracking
  tokens_input bigint DEFAULT 0,
  tokens_output bigint DEFAULT 0,
  
  -- Origin tracking
  ip_address inet,
  user_agent text,
  referer text,
  origin text,
  
  created_at timestamptz DEFAULT now()
);

-- Partition by month for performance (manual partitioning)
CREATE INDEX IF NOT EXISTS idx_token_usage_token_date ON token_usage_logs(token_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_usage_created ON token_usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_usage_origin ON token_usage_logs(origin) WHERE origin IS NOT NULL;

COMMENT ON COLUMN public.token_usage_logs.tokens_input IS 'LLM input tokens consumed by this API call';
COMMENT ON COLUMN public.token_usage_logs.tokens_output IS 'LLM output tokens consumed by this API call';

-- =============================================
-- PERMISSION TEMPLATES (Optional but recommended)
-- =============================================
CREATE TABLE IF NOT EXISTS public.permission_templates (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text UNIQUE NOT NULL,
  description text,
  is_system boolean DEFAULT false, -- System templates cannot be deleted
  permissions jsonb NOT NULL, -- Array of permission definitions
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_permission_templates_system ON permission_templates(is_system);

-- Seed system templates
INSERT INTO public.permission_templates (name, description, is_system, permissions) VALUES
(
  'Read Only',
  'Read access to all resources',
  true,
  '[
    {"resource": "agents", "route_pattern": "/api/agents/*", "can_read": true},
    {"resource": "tasks", "route_pattern": "/api/tasks/*", "can_read": true},
    {"resource": "sessions", "route_pattern": "/api/sessions/*", "can_read": true},
    {"resource": "tools", "route_pattern": "/api/tools/*", "can_read": true},
    {"resource": "skills", "route_pattern": "/api/skills/*", "can_read": true},
    {"resource": "channels", "route_pattern": "/api/channels/*", "can_read": true}
  ]'::jsonb
),
(
  'Full Access',
  'Complete CRUD access to all resources',
  true,
  '[
    {"resource": "agents", "route_pattern": "/api/agents/*", "can_create": true, "can_read": true, "can_update": true, "can_delete": true},
    {"resource": "tasks", "route_pattern": "/api/tasks/*", "can_create": true, "can_read": true, "can_update": true, "can_delete": true},
    {"resource": "sessions", "route_pattern": "/api/sessions/*", "can_create": true, "can_read": true, "can_update": true, "can_delete": true},
    {"resource": "tools", "route_pattern": "/api/tools/*", "can_create": true, "can_read": true, "can_update": true, "can_delete": true},
    {"resource": "skills", "route_pattern": "/api/skills/*", "can_create": true, "can_read": true, "can_update": true, "can_delete": true},
    {"resource": "channels", "route_pattern": "/api/channels/*", "can_create": true, "can_read": true, "can_update": true, "can_delete": true}
  ]'::jsonb
),
(
  'Agent Management',
  'Full access to agents, read-only for other resources',
  true,
  '[
    {"resource": "agents", "route_pattern": "/api/agents/*", "can_create": true, "can_read": true, "can_update": true, "can_delete": true},
    {"resource": "tasks", "route_pattern": "/api/tasks/*", "can_read": true},
    {"resource": "tools", "route_pattern": "/api/tools/*", "can_read": true},
    {"resource": "skills", "route_pattern": "/api/skills/*", "can_read": true}
  ]'::jsonb
),
(
  'Task Execution',
  'Create and read tasks, read agents',
  true,
  '[
    {"resource": "agents", "route_pattern": "/api/agents/*", "can_read": true},
    {"resource": "tasks", "route_pattern": "/api/tasks/*", "can_create": true, "can_read": true},
    {"resource": "sessions", "route_pattern": "/api/sessions/*", "can_create": true, "can_read": true}
  ]'::jsonb
)
ON CONFLICT (name) DO NOTHING;

-- =============================================
-- AUDIT LOG FOR TOKEN OPERATIONS
-- =============================================
CREATE TABLE IF NOT EXISTS public.token_audit_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  token_id uuid REFERENCES api_tokens(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL, -- 'created', 'updated', 'revoked', 'regenerated', 'permission_added', 'permission_removed'
  details jsonb DEFAULT '{}'::jsonb,
  ip_address inet,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_token_audit_token ON token_audit_log(token_id);
CREATE INDEX IF NOT EXISTS idx_token_audit_user ON token_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_token_audit_created ON token_audit_log(created_at DESC);

-- =============================================
-- HELPER FUNCTIONS
-- =============================================

-- Get token usage summary
CREATE OR REPLACE FUNCTION public.get_token_usage_summary(p_token_id uuid, p_days int DEFAULT 30)
RETURNS jsonb AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_requests', COUNT(*),
    'total_llm_input_tokens', COALESCE(SUM(tokens_input), 0),
    'total_llm_output_tokens', COALESCE(SUM(tokens_output), 0),
    'avg_response_time_ms', COALESCE(AVG(response_time_ms), 0),
    'success_rate', COALESCE(AVG(CASE WHEN status_code < 400 THEN 1.0 ELSE 0.0 END), 0),
    'requests_by_endpoint', jsonb_object_agg(endpoint, endpoint_count)
  )
  INTO result
  FROM (
    SELECT 
      endpoint,
      COUNT(*) as endpoint_count,
      tokens_input,
      tokens_output,
      response_time_ms,
      status_code
    FROM public.token_usage_logs
    WHERE token_id = p_token_id
      AND created_at >= NOW() - (p_days || ' days')::interval
    GROUP BY endpoint, tokens_input, tokens_output, response_time_ms, status_code
  ) subquery;
  
  RETURN COALESCE(result, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check for expiring tokens (for email notifications)
CREATE OR REPLACE FUNCTION public.get_expiring_tokens(p_days_threshold int DEFAULT 7)
RETURNS TABLE(
  token_id uuid,
  user_id uuid,
  user_email text,
  token_name text,
  expires_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.user_id,
    up.email,
    t.name,
    t.expires_at
  FROM public.api_tokens t
  JOIN public.user_profiles up ON t.user_id = up.id
  WHERE t.is_active = true
    AND t.expires_at IS NOT NULL
    AND t.expires_at <= NOW() + (p_days_threshold || ' days')::interval
    AND t.expires_at > NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- RLS POLICIES
-- =============================================
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_audit_log ENABLE ROW LEVEL SECURITY;

-- User profiles: users can read/update own profile
CREATE POLICY "users_own_profile" ON public.user_profiles
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- API tokens: users can manage their own tokens
CREATE POLICY "users_own_tokens" ON public.api_tokens
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Token permissions: users can manage permissions for their tokens
CREATE POLICY "users_own_token_permissions" ON public.token_permissions
  FOR ALL USING (
    token_id IN (SELECT id FROM public.api_tokens WHERE user_id = auth.uid())
  ) WITH CHECK (
    token_id IN (SELECT id FROM public.api_tokens WHERE user_id = auth.uid())
  );

-- Token usage logs: users can read logs for their tokens
CREATE POLICY "users_own_token_logs" ON public.token_usage_logs
  FOR SELECT USING (
    token_id IN (SELECT id FROM public.api_tokens WHERE user_id = auth.uid())
  );

-- Permission templates: everyone can read
CREATE POLICY "read_permission_templates" ON public.permission_templates
  FOR SELECT USING (true);

-- Token audit log: users can read audit logs for their tokens
CREATE POLICY "users_own_token_audit" ON public.token_audit_log
  FOR SELECT USING (
    user_id = auth.uid() OR
    token_id IN (SELECT id FROM public.api_tokens WHERE user_id = auth.uid())
  );

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_token_usage_summary TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_expiring_tokens TO service_role;

-- =============================================
-- UPDATED_AT TRIGGER
-- =============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_api_tokens_updated_at ON public.api_tokens;
CREATE TRIGGER update_api_tokens_updated_at
  BEFORE UPDATE ON public.api_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
