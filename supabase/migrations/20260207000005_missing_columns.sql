-- Migration: Add columns referenced by UI but missing from schema

-- agents.is_default — used by agents page to highlight default agent
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false;

-- task_messages.metadata — used by dashboard leaderboards for skill/tool usage tracking
ALTER TABLE public.task_messages ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
