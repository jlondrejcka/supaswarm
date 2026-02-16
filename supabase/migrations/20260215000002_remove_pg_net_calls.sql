-- Migration: Remove pg_net from triggers and use pgmq queues instead
-- Replaces all edge function HTTP calls with pgmq message queues
-- The embedded worker reads these queues and handles task processing

-- Note: pgmq queues (slack_replies, task_processing, context_graph_jobs) 
-- are already created by 20260207000002_feature_tables.sql
-- This migration just documents the deprecation of pg_net and pg_cron

-- Migration notes:
-- - slack_notify_on_task_message() now queues to 'slack_replies' instead of net.http_post
-- - check_spawn_completion() now queues parent task to 'task_processing' instead of net.http_post
-- - handle_approval_status_change() now queues task to 'task_processing' instead of net.http_post
-- - review_approval_request() now queues task to 'task_processing' instead of net.http_post
-- - Embedded worker processes these queues independently of database triggers

-- Deprecation notes:
-- pg_net extension: Previously used for triggering edge functions via HTTP
-- Now replaced with pgmq queues for async message processing
-- pg_cron extension: Previously used for scheduled job retries and worker invocation
-- Now replaced with embedded worker reading pgmq queues directly
