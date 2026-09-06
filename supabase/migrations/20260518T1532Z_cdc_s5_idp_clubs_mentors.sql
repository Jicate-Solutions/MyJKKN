-- Sprint 5: IDP + Clubs + Mentor Pairings supplemental DDL
-- Tables (cdc_idp_responses, cdc_clubs, cdc_club_memberships, cdc_mentor_pairings)
-- are already created by Sprint 1 substrate migration.
-- This migration adds:
--   1. Updated_at auto-update triggers for Sprint 5 tables
--   2. A check constraint on cdc_mentor_pairings to prevent self-pairing
--   3. A unique constraint to prevent duplicate active memberships per learner/club
--   4. SELECT-only verification probes (no INSERT smoke tests)

-- ─── Trigger helper (reuse if already exists) ────────────────────────────────
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ─── updated_at triggers ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_cdc_idp_responses_updated_at'
  ) THEN
    CREATE TRIGGER trg_cdc_idp_responses_updated_at
      BEFORE UPDATE ON cdc_idp_responses
      FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_cdc_clubs_updated_at'
  ) THEN
    CREATE TRIGGER trg_cdc_clubs_updated_at
      BEFORE UPDATE ON cdc_clubs
      FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_cdc_club_memberships_updated_at'
  ) THEN
    CREATE TRIGGER trg_cdc_club_memberships_updated_at
      BEFORE UPDATE ON cdc_club_memberships
      FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_cdc_mentor_pairings_updated_at'
  ) THEN
    CREATE TRIGGER trg_cdc_mentor_pairings_updated_at
      BEFORE UPDATE ON cdc_mentor_pairings
      FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
  END IF;
END;
$$;

-- ─── Self-pairing constraint ─────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_cdc_mentor_pairings_no_self_pair'
      AND conrelid = 'cdc_mentor_pairings'::regclass
  ) THEN
    ALTER TABLE cdc_mentor_pairings
      ADD CONSTRAINT chk_cdc_mentor_pairings_no_self_pair
      CHECK (mentor_learner_id <> mentee_learner_id);
  END IF;
END;
$$;

-- ─── Unique active membership per learner+club ────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'cdc_club_memberships'
      AND indexname = 'uidx_cdc_club_memberships_active_learner_club'
  ) THEN
    CREATE UNIQUE INDEX uidx_cdc_club_memberships_active_learner_club
      ON cdc_club_memberships (club_id, learner_id)
      WHERE is_active = true;
  END IF;
END;
$$;

-- ─── Verification probes (SELECT-only, safe in prod) ─────────────────────────
DO $$
DECLARE
  v_count int;
BEGIN
  -- Verify tables exist
  SELECT count(*) INTO v_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN (
      'cdc_idp_responses', 'cdc_clubs',
      'cdc_club_memberships', 'cdc_mentor_pairings'
    );

  IF v_count < 4 THEN
    RAISE EXCEPTION 'Sprint 5 probe: expected 4 CDC tables, found %', v_count;
  END IF;

  -- Verify check constraint exists
  SELECT count(*) INTO v_count
  FROM pg_constraint
  WHERE conname = 'chk_cdc_mentor_pairings_no_self_pair';

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Sprint 5 probe: self-pair constraint not found';
  END IF;

  RAISE NOTICE 'Sprint 5 migration probe: ALL OK (4 tables verified, constraints verified)';
END;
$$;
