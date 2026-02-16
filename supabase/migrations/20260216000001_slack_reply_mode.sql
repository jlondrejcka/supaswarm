-- Add reply mode configuration for Slack bots
-- all_messages: reply to all messages in channel
-- mentions_only: reply only when bot is @mentioned

ALTER TABLE agents 
ADD COLUMN IF NOT EXISTS slack_reply_mode TEXT DEFAULT 'mentions_only' 
CHECK (slack_reply_mode IN ('all_messages', 'mentions_only'));

-- Remove signing secret requirement (not needed for Socket Mode)
-- Keep column for backward compatibility but make it nullable
ALTER TABLE agents 
ALTER COLUMN slack_signing_secret_name DROP NOT NULL;

COMMENT ON COLUMN agents.slack_reply_mode IS 'Reply behavior: all_messages or mentions_only';
