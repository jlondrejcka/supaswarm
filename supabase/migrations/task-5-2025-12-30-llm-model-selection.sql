-- Provider Models table for storing available/enabled models per provider
CREATE TABLE IF NOT EXISTS provider_models (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id uuid REFERENCES llm_providers(id) ON DELETE CASCADE,
  model_name text NOT NULL,
  display_name text,
  is_enabled boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  -- Extended fields for pricing, limits, capabilities
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

-- Enable RLS
ALTER TABLE provider_models ENABLE ROW LEVEL SECURITY;

-- Allow all operations for now (public access)
CREATE POLICY "Allow all access to provider_models" ON provider_models FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- xAI GROK MODELS
-- =============================================
INSERT INTO provider_models (provider_id, model_name, display_name, is_enabled, model_family, release_date, is_latest, context_window, max_output_tokens, input_price_per_million, output_price_per_million, supports_vision, capabilities)
SELECT p.id, m.* FROM llm_providers p
CROSS JOIN (VALUES 
  -- Grok 4.1 Series (Most Recent)
  ('grok-4-1', 'Grok 4.1', true, 'grok-4', '2025-10-01'::date, true, 2000000, 131072, 3.00, 15.00, true, '["reasoning", "coding", "analysis"]'::jsonb),
  ('grok-4-1-fast', 'Grok 4.1 Fast', true, 'grok-4', '2025-10-01'::date, true, 2000000, 131072, 0.60, 3.00, false, '["fast-inference", "coding"]'::jsonb),
  ('grok-4-1-mini', 'Grok 4.1 Mini', true, 'grok-4', '2025-10-01'::date, true, 131072, 32768, 0.10, 0.40, false, '["fast-inference", "lightweight"]'::jsonb),
  -- Grok 4 Series (Second Most Recent)
  ('grok-4', 'Grok 4', true, 'grok-4', '2025-07-01'::date, false, 2000000, 131072, 3.00, 15.00, true, '["reasoning", "coding", "analysis"]'::jsonb),
  ('grok-4-fast', 'Grok 4 Fast', false, 'grok-4', '2025-09-01'::date, false, 2000000, 131072, 0.50, 2.50, false, '["fast-inference", "enterprise"]'::jsonb),
  -- Grok 3 Series (Legacy)
  ('grok-3', 'Grok 3', false, 'grok-3', '2025-02-01'::date, false, 131072, 32768, 1.00, 5.00, false, '["general", "search"]'::jsonb)
) AS m(model_name, display_name, is_enabled, model_family, release_date, is_latest, context_window, max_output_tokens, input_price_per_million, output_price_per_million, supports_vision, capabilities)
WHERE p.name = 'xai'
ON CONFLICT (provider_id, model_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  is_enabled = EXCLUDED.is_enabled,
  model_family = EXCLUDED.model_family,
  release_date = EXCLUDED.release_date,
  is_latest = EXCLUDED.is_latest,
  context_window = EXCLUDED.context_window,
  max_output_tokens = EXCLUDED.max_output_tokens,
  input_price_per_million = EXCLUDED.input_price_per_million,
  output_price_per_million = EXCLUDED.output_price_per_million,
  supports_vision = EXCLUDED.supports_vision,
  capabilities = EXCLUDED.capabilities;

-- =============================================
-- ANTHROPIC CLAUDE MODELS
-- =============================================
INSERT INTO provider_models (provider_id, model_name, display_name, is_enabled, model_family, release_date, is_latest, context_window, max_output_tokens, input_price_per_million, output_price_per_million, supports_vision, capabilities)
SELECT p.id, m.* FROM llm_providers p
CROSS JOIN (VALUES 
  -- Claude 4.5 Series (Most Recent)
  ('claude-opus-4-5-20251124', 'Claude Opus 4.5', true, 'claude-4.5', '2025-11-24'::date, true, 200000, 32768, 15.00, 75.00, true, '["reasoning", "coding", "analysis", "agentic"]'::jsonb),
  ('claude-sonnet-4-5-20250514', 'Claude Sonnet 4.5', true, 'claude-4.5', '2025-05-14'::date, true, 200000, 16384, 3.00, 15.00, true, '["reasoning", "coding", "balanced"]'::jsonb),
  ('claude-haiku-4-5-20251015', 'Claude Haiku 4.5', true, 'claude-4.5', '2025-10-15'::date, true, 200000, 8192, 1.00, 5.00, true, '["fast-inference", "realtime", "lightweight"]'::jsonb),
  -- Claude 3.5 Series (Second Most Recent)
  ('claude-3-5-sonnet-20241022', 'Claude 3.5 Sonnet', false, 'claude-3.5', '2024-10-22'::date, false, 200000, 8192, 3.00, 15.00, true, '["reasoning", "coding", "balanced"]'::jsonb),
  ('claude-3-5-haiku-20241022', 'Claude 3.5 Haiku', false, 'claude-3.5', '2024-10-22'::date, false, 200000, 8192, 0.80, 4.00, true, '["fast-inference", "lightweight"]'::jsonb),
  -- Claude 3 Series (Legacy)
  ('claude-3-opus-20240229', 'Claude 3 Opus', false, 'claude-3', '2024-02-29'::date, false, 200000, 4096, 15.00, 75.00, true, '["reasoning", "analysis"]'::jsonb)
) AS m(model_name, display_name, is_enabled, model_family, release_date, is_latest, context_window, max_output_tokens, input_price_per_million, output_price_per_million, supports_vision, capabilities)
WHERE p.name = 'anthropic'
ON CONFLICT (provider_id, model_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  is_enabled = EXCLUDED.is_enabled,
  model_family = EXCLUDED.model_family,
  release_date = EXCLUDED.release_date,
  is_latest = EXCLUDED.is_latest,
  context_window = EXCLUDED.context_window,
  max_output_tokens = EXCLUDED.max_output_tokens,
  input_price_per_million = EXCLUDED.input_price_per_million,
  output_price_per_million = EXCLUDED.output_price_per_million,
  supports_vision = EXCLUDED.supports_vision,
  capabilities = EXCLUDED.capabilities;

-- =============================================
-- GOOGLE GEMINI MODELS
-- =============================================
INSERT INTO provider_models (provider_id, model_name, display_name, is_enabled, model_family, release_date, is_latest, context_window, max_output_tokens, input_price_per_million, output_price_per_million, supports_vision, capabilities)
SELECT p.id, m.* FROM llm_providers p
CROSS JOIN (VALUES 
  -- Gemini 2.5 Series (Most Recent)
  ('gemini-2.5-pro', 'Gemini 2.5 Pro', true, 'gemini-2.5', '2025-06-01'::date, true, 2000000, 65536, 1.25, 5.00, true, '["reasoning", "coding", "multimodal"]'::jsonb),
  ('gemini-2.5-flash', 'Gemini 2.5 Flash', true, 'gemini-2.5', '2025-06-01'::date, true, 1000000, 32768, 0.15, 0.60, true, '["fast-inference", "multimodal"]'::jsonb),
  ('gemini-2.5-flash-lite', 'Gemini 2.5 Flash Lite', true, 'gemini-2.5', '2025-06-01'::date, true, 1000000, 16384, 0.02, 0.08, false, '["lightweight", "fast-inference"]'::jsonb),
  -- Gemini 2.0 Series (Second Most Recent)
  ('gemini-2.0-flash', 'Gemini 2.0 Flash', false, 'gemini-2.0', '2024-12-01'::date, false, 1000000, 8192, 0.10, 0.40, true, '["fast-inference", "multimodal"]'::jsonb),
  ('gemini-2.0-flash-thinking', 'Gemini 2.0 Flash Thinking', false, 'gemini-2.0', '2024-12-01'::date, false, 1000000, 8192, 0.10, 0.40, false, '["reasoning", "thinking"]'::jsonb),
  -- Gemini 1.5 Series (Legacy)
  ('gemini-1.5-pro', 'Gemini 1.5 Pro', false, 'gemini-1.5', '2024-05-01'::date, false, 2000000, 8192, 1.25, 5.00, true, '["reasoning", "multimodal"]'::jsonb),
  ('gemini-1.5-flash', 'Gemini 1.5 Flash', false, 'gemini-1.5', '2024-05-01'::date, false, 1000000, 8192, 0.075, 0.30, true, '["fast-inference"]'::jsonb)
) AS m(model_name, display_name, is_enabled, model_family, release_date, is_latest, context_window, max_output_tokens, input_price_per_million, output_price_per_million, supports_vision, capabilities)
WHERE p.name = 'google'
ON CONFLICT (provider_id, model_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  is_enabled = EXCLUDED.is_enabled,
  model_family = EXCLUDED.model_family,
  release_date = EXCLUDED.release_date,
  is_latest = EXCLUDED.is_latest,
  context_window = EXCLUDED.context_window,
  max_output_tokens = EXCLUDED.max_output_tokens,
  input_price_per_million = EXCLUDED.input_price_per_million,
  output_price_per_million = EXCLUDED.output_price_per_million,
  supports_vision = EXCLUDED.supports_vision,
  capabilities = EXCLUDED.capabilities;

-- Update default models for providers
UPDATE llm_providers SET default_model = 'grok-4-1' WHERE name = 'xai';
UPDATE llm_providers SET default_model = 'claude-sonnet-4-5-20250514' WHERE name = 'anthropic';
UPDATE llm_providers SET default_model = 'gemini-2.5-pro' WHERE name = 'google';
