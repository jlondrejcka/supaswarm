# Task 5: LLM Model Selection

## Overview
Add model selection capability to LLM providers in settings, and use those enabled models in agent configuration.

## Database Schema
```sql
CREATE TABLE provider_models (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id uuid REFERENCES llm_providers(id) ON DELETE CASCADE,
  model_name text NOT NULL,
  display_name text,
  is_enabled boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  -- Extended fields
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
```

## Models Seeded

### xAI (Grok)
- **Grok 4.1 Series (Latest)**: grok-4-1, grok-4-1-fast, grok-4-1-mini
- **Grok 4 Series**: grok-4, grok-4-fast
- **Grok 3 (Legacy)**: grok-3

### Anthropic (Claude)
- **Claude 4.5 Series (Latest)**: claude-opus-4-5-20251124, claude-sonnet-4-5-20250514, claude-haiku-4-5-20251015
- **Claude 3.5 Series**: claude-3-5-sonnet-20241022, claude-3-5-haiku-20241022
- **Claude 3 (Legacy)**: claude-3-opus-20240229

### Google (Gemini)
- **Gemini 2.5 Series (Latest)**: gemini-2.5-pro, gemini-2.5-flash, gemini-2.5-flash-lite
- **Gemini 2.0 Series**: gemini-2.0-flash, gemini-2.0-flash-thinking
- **Gemini 1.5 (Legacy)**: gemini-1.5-pro, gemini-1.5-flash

## Progress
- [x] Created branch feature/llm-model-selection
- [x] Create migration for provider_models table with extended schema
- [x] Seed latest models with pricing, context windows, capabilities
- [x] Update settings page UI (checkboxes, Latest/Vision badges, pricing info)
- [x] Update agents page model selector (dropdown with pricing info)
- [x] Update TypeScript types
- [x] Fixed temperature `0` saving bug (using `??` instead of `||`)
- [x] Added comma formatting for max_tokens field

## Features Added
- Model checkboxes with "Latest" and "Vision" badges
- Pricing display ($input/$output per M tokens)
- Context window display (2,000K ctx, 200K ctx, etc.)
- Models sorted by "is_latest" flag
- Agent model selector shows pricing/context info

