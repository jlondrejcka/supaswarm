-- Migration: Add trigger to update scheduled_jobs stats when job runs complete
-- Updates total_runs, failed_runs, and last_run_at fields automatically

CREATE OR REPLACE FUNCTION public.update_scheduled_job_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only update on INSERT or when status changes to success/failed
  IF (TG_OP = 'INSERT' AND NEW.status IN ('success', 'failed')) OR
     (TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status IN ('success', 'failed')) THEN
    
    UPDATE public.scheduled_jobs
    SET 
      total_runs = total_runs + 1,
      failed_runs = CASE 
        WHEN NEW.status = 'failed' THEN failed_runs + 1 
        ELSE failed_runs 
      END,
      last_run_at = NEW.started_at,
      updated_at = NOW()
    WHERE id = NEW.job_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_job_stats ON public.scheduled_job_runs;
CREATE TRIGGER trg_update_job_stats
  AFTER INSERT OR UPDATE ON public.scheduled_job_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_scheduled_job_stats();

COMMENT ON FUNCTION public.update_scheduled_job_stats() IS 
  'Auto-updates scheduled_jobs stats (total_runs, failed_runs, last_run_at) when job runs complete';
