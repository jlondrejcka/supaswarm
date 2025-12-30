-- FIX FOR util.process_task_queue()
-- Current issue: Function reads PGMQ messages but never acknowledges them
-- This causes the same messages to be reprocessed every 5 seconds

CREATE OR REPLACE FUNCTION util.process_task_queue(batch_size integer DEFAULT 10, timeout_milliseconds integer DEFAULT ((5 * 60) * 1000))
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  job record;
BEGIN
  FOR job IN
    SELECT * FROM pgmq.read('task_processing', timeout_milliseconds / 1000, batch_size)
  LOOP
    -- Call the edge function
    PERFORM util.invoke_edge_function(
      function_name => 'process-task',
      body => job.message || jsonb_build_object('job_id', job.msg_id),
      timeout_milliseconds => timeout_milliseconds
    );

    -- ACKNOWLEDGE THE MESSAGE - This was missing!
    -- After successful processing, acknowledge the message so it's removed from queue
    PERFORM pgmq.delete('task_processing', job.msg_id);
  END LOOP;
END;
$function$;
