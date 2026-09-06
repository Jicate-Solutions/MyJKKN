-- P0.3 — Sync hostel_wardens assignments into user_block_access.
--
-- WHY: RLS block-scoping uses role_has_block_access() which reads
-- user_block_access, but NOTHING populated that table — so every real warden
-- saw nothing. This trigger mirrors a warden's block assignment into a
-- user_block_access grant (and revokes it on relieve/reassign), making
-- warden-scoped visibility actually work for the upcoming approval workflow.

CREATE OR REPLACE FUNCTION public.trg_hostel_warden_block_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Revoke the old block grant on reassignment.
  IF TG_OP = 'UPDATE'
     AND OLD.block_id IS NOT NULL
     AND OLD.block_id IS DISTINCT FROM NEW.block_id THEN
    UPDATE user_block_access
      SET revoked_at = now()
      WHERE user_id = OLD.user_id AND block_id = OLD.block_id AND revoked_at IS NULL;
  END IF;

  IF NEW.block_id IS NOT NULL AND NEW.is_active AND NEW.relieved_at IS NULL THEN
    -- Active assignment → grant (or re-activate) access.
    INSERT INTO user_block_access (user_id, block_id, granted_at, notes)
    VALUES (NEW.user_id, NEW.block_id, now(), 'auto: hostel_wardens assignment')
    ON CONFLICT (user_id, block_id)
      DO UPDATE SET revoked_at = NULL, granted_at = now();
  ELSIF NEW.block_id IS NOT NULL THEN
    -- Inactive / relieved → revoke.
    UPDATE user_block_access
      SET revoked_at = now()
      WHERE user_id = NEW.user_id AND block_id = NEW.block_id AND revoked_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hostel_wardens_block_access ON public.hostel_wardens;
CREATE TRIGGER trg_hostel_wardens_block_access
  AFTER INSERT OR UPDATE ON public.hostel_wardens
  FOR EACH ROW EXECUTE FUNCTION public.trg_hostel_warden_block_access();

-- Backfill any existing active warden assignments (currently none, but correct
-- if rows are added before this runs).
INSERT INTO user_block_access (user_id, block_id, granted_at, notes)
SELECT w.user_id, w.block_id, now(), 'auto: hostel_wardens backfill'
FROM hostel_wardens w
WHERE w.block_id IS NOT NULL AND w.is_active AND w.relieved_at IS NULL
ON CONFLICT (user_id, block_id) DO UPDATE SET revoked_at = NULL;
