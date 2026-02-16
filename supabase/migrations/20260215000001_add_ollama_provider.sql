-- Add Ollama LLM Provider Support
-- Ollama is a local LLM provider that runs at http://localhost:11434/v1
-- This migration adds the Ollama provider and several popular open-source models

-- =============================================
-- INSERT OLLAMA PROVIDER
-- =============================================
INSERT INTO public.llm_providers (name, display_name, base_url, default_model, requires_api_key, is_active)
VALUES (
  'ollama',
  'Ollama (Local)',
  'http://localhost:11434/v1',
  'qwen3-coder:30b',
  false,
  true
)
ON CONFLICT (name) DO NOTHING;

-- =============================================
-- INSERT OLLAMA MODELS
-- =============================================
-- Ollama Models - Code Generation & General Purpose
INSERT INTO public.provider_models (provider_id, model_name, display_name, is_enabled, model_family, release_date, is_latest, context_window, max_output_tokens, input_price_per_million, output_price_per_million, supports_vision, supports_tools, supports_streaming, capabilities)
SELECT p.id, m.* FROM public.llm_providers p
CROSS JOIN (VALUES 
  ('qwen3-coder:30b', 'Qwen3 Coder 30B', true, 'qwen3-coder', '2025-01-01'::date, true, 32768, 8192, 0.00, 0.00, false, true, true, '["coding", "local"]'::jsonb),
  ('qwen3:30b', 'Qwen3 30B', true, 'qwen3', '2025-01-01'::date, true, 32768, 8192, 0.00, 0.00, false, true, true, '["general-purpose", "local"]'::jsonb),
  ('GLM-4.7-Flash', 'GLM-4.7 Flash', true, 'glm-4', '2024-12-01'::date, true, 32768, 8192, 0.00, 0.00, false, true, true, '["fast-inference", "local"]'::jsonb),
  ('nomic-embed-text', 'Nomic Embed Text', true, 'nomic-embed', '2024-01-01'::date, true, 2048, 2048, 0.00, 0.00, false, false, true, '["embeddings", "local"]'::jsonb)
) AS m(model_name, display_name, is_enabled, model_family, release_date, is_latest, context_window, max_output_tokens, input_price_per_million, output_price_per_million, supports_vision, supports_tools, supports_streaming, capabilities)
WHERE p.name = 'ollama'
ON CONFLICT (provider_id, model_name) DO NOTHING;
