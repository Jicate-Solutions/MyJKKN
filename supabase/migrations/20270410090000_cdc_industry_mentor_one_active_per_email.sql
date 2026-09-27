-- One ACTIVE industry mentor per (institution, email) — enforced where the row
-- is written, not only in the API.
--
-- WHY. createIndustryMentor (lib/services/cdc/industry-mentor-service.ts) read
-- the institution's active mentors, compared emails in code, then inserted. Two
-- saves at the same moment both read "no match" and both insert (W12 blind
-- review, 24 Sep, PR #4024). The read was also capped by PostgREST's row limit.
--
-- WHY NOT A UNIQUE INDEX. Production already holds three ACTIVE rows for one
-- email in one institution (27 Sep 2026: s.biswas.me1@gmail.com, institution
-- 5de4fba1…). A unique index would fail to build, and deciding which of those
-- three records to keep is the CDC team's call, not a migration's. So:
--
-- A BEFORE INSERT/UPDATE trigger takes a transaction-scoped advisory lock on
-- (institution, normalised email) — so concurrent saves of the same pair run one
-- after the other — and then refuses the row if ANOTHER active mentor already has
-- that email in that institution. Normalisation matches normaliseEmail() in the
-- service: trim + lower-case. The check runs SECURITY DEFINER so a duplicate is
-- found even when the writer's row-level rules hide it.
--
-- EXISTING DUPLICATES stay editable: an UPDATE that leaves institution, email
-- and is_active as they were is not checked (the service's update sends every
-- field, email included, on every save).
--
-- The error is 23505 with the existing mentor's id in DETAIL, which the service
-- maps to DuplicateIndustryMentorError → HTTP 409, exactly like its read check.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_industry_mentor_one_active_per_email_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_email    text;
  v_existing uuid;
BEGIN
  IF NOT COALESCE(NEW.is_active, false) THEN
    RETURN NEW;
  END IF;

  v_email := lower(btrim(COALESCE(NEW.email, '')));
  IF v_email = '' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.institution_id IS NOT DISTINCT FROM NEW.institution_id
     AND lower(btrim(COALESCE(OLD.email, ''))) = v_email
     AND COALESCE(OLD.is_active, false) THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('industry_mentors:' || NEW.institution_id::text || ':' || v_email, 0)
  );

  SELECT m.id INTO v_existing
  FROM public.industry_mentors m
  WHERE m.institution_id = NEW.institution_id
    AND m.is_active
    AND lower(btrim(COALESCE(m.email, ''))) = v_email
    AND m.id IS DISTINCT FROM NEW.id
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'An active industry mentor with this email already exists in this institution.',
      DETAIL  = 'existing_mentor_id=' || v_existing::text,
      CONSTRAINT = 'industry_mentors_one_active_per_email';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_industry_mentor_one_active_per_email_trg() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_industry_mentor_one_active_per_email ON public.industry_mentors;

CREATE TRIGGER trg_industry_mentor_one_active_per_email
BEFORE INSERT OR UPDATE OF institution_id, email, is_active
ON public.industry_mentors
FOR EACH ROW
EXECUTE FUNCTION public.fn_industry_mentor_one_active_per_email_trg();

COMMENT ON TRIGGER trg_industry_mentor_one_active_per_email ON public.industry_mentors IS
  'Refuses a second ACTIVE mentor with the same trimmed, lower-cased email in one '
  'institution. Serialised per (institution, email) with an advisory lock so two '
  'concurrent saves cannot both pass. Existing duplicates stay editable.';
