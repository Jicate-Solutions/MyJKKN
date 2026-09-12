-- HR decision emails — an outbox of "your request was approved / rejected"
-- emails to the applicant (2026-09-11).
--
-- One row per FINAL decision on a leave or short-time-off application
-- (hr_leave_applications) or a comp-off claim (hr_comp_off_credits). The app
-- sends them through Resend (lib/services/hr/decision-email-service.ts) right
-- after the decision, and a 5-minute cron retries anything that did not go out.
--
-- Why a table filled by a trigger, not a send inside the route: comp-off
-- decisions are written straight from the browser, so no server code sees them;
-- a send fired after the response can be frozen by the platform; and HR asked to
-- SEE whether each email went out. The trigger catches every final decision
-- however it was made, and the row records what happened to its email.
--
-- Who is emailed: staff.institution_email — the @jkkn.ac.in address the staff
-- member signs in with. A blank one is recorded as 'skipped', never guessed.
--
-- What is NOT emailed:
--   * a review step — it leaves status 'pending', so the trigger never fires;
--   * anything decided with no signed-in user (auth.uid() IS NULL): the nightly
--     auto-reject of expired comp-off claims (pg_cron) and maintenance SQL;
--   * decisions made before this migration — no backfill.

-- ── Table ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hr_decision_emails (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_application_id uuid REFERENCES public.hr_leave_applications(id) ON DELETE CASCADE,
  comp_off_credit_id   uuid REFERENCES public.hr_comp_off_credits(id) ON DELETE CASCADE,
  employee_id          uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  decision             text NOT NULL CHECK (decision IN ('approved', 'rejected')),
  to_email             text,
  status               text NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  attempts             smallint NOT NULL DEFAULT 0,
  next_attempt_at      timestamptz NOT NULL DEFAULT now(),
  last_error           text,
  resend_id            text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  sent_at              timestamptz,
  CONSTRAINT hr_decision_emails_one_record
    CHECK (num_nonnulls(leave_application_id, comp_off_credit_id) = 1),
  CONSTRAINT hr_decision_emails_pending_has_address
    CHECK (status <> 'pending' OR to_email IS NOT NULL)
);

ALTER TABLE public.hr_decision_emails ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.hr_decision_emails IS
  'Outbox of approved/rejected emails to the applicant, one per final leave / short time off / comp-off decision. Filled by hr_trig_enqueue_decision_email; sent by the app via Resend.';

-- One email per record and decision. These also serve as the FK indexes.
CREATE UNIQUE INDEX IF NOT EXISTS hr_decision_emails_leave_uq
  ON public.hr_decision_emails (leave_application_id, decision)
  WHERE leave_application_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS hr_decision_emails_comp_off_uq
  ON public.hr_decision_emails (comp_off_credit_id, decision)
  WHERE comp_off_credit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS hr_decision_emails_employee_idx
  ON public.hr_decision_emails (employee_id);
CREATE INDEX IF NOT EXISTS hr_decision_emails_due_idx
  ON public.hr_decision_emails (next_attempt_at)
  WHERE status = 'pending';

-- ── Access ────────────────────────────────────────────────────────────────
-- Read: whoever can see the request can see what happened to its email — the
-- EXISTS runs hla_select / hcoc_select as the caller. Write: nobody through the
-- API. The trigger (DEFINER) inserts; the server (service role) updates.
DROP POLICY IF EXISTS hde_select ON public.hr_decision_emails;
CREATE POLICY hde_select ON public.hr_decision_emails
  FOR SELECT TO authenticated
  USING (
    (leave_application_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.hr_leave_applications a
      WHERE a.id = hr_decision_emails.leave_application_id))
    OR
    (comp_off_credit_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.hr_comp_off_credits c
      WHERE c.id = hr_decision_emails.comp_off_credit_id))
  );

REVOKE ALL ON public.hr_decision_emails FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.hr_decision_emails TO authenticated;
GRANT ALL ON public.hr_decision_emails TO service_role;

-- ── Enqueue on a final decision ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hr_trig_enqueue_decision_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text;
BEGIN
  -- A person decided. pg_cron jobs and maintenance SQL carry no auth.uid().
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT nullif(btrim(s.institution_email), '')
    INTO v_email
    FROM public.staff s
   WHERE s.id = NEW.employee_id;

  IF TG_TABLE_NAME = 'hr_leave_applications' THEN
    INSERT INTO public.hr_decision_emails
      (leave_application_id, employee_id, decision, to_email, status, last_error)
    VALUES
      (NEW.id, NEW.employee_id, NEW.status, v_email,
       CASE WHEN v_email IS NULL THEN 'skipped' ELSE 'pending' END,
       CASE WHEN v_email IS NULL THEN 'No institution email on the staff record' END)
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.hr_decision_emails
      (comp_off_credit_id, employee_id, decision, to_email, status, last_error)
    VALUES
      (NEW.id, NEW.employee_id, NEW.status, v_email,
       CASE WHEN v_email IS NULL THEN 'skipped' ELSE 'pending' END,
       CASE WHEN v_email IS NULL THEN 'No institution email on the staff record' END)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_trig_enqueue_decision_email() FROM PUBLIC, anon, authenticated;

-- "zz" so these run after the balance / attendance AFTER triggers, which fire in
-- name order: if one of those refuses the decision, it rolls this row back too.
DROP TRIGGER IF EXISTS trg_hla_zz_decision_email ON public.hr_leave_applications;
CREATE TRIGGER trg_hla_zz_decision_email
  AFTER UPDATE OF status ON public.hr_leave_applications
  FOR EACH ROW
  WHEN (OLD.status IN ('pending', 'escalated') AND NEW.status IN ('approved', 'rejected'))
  EXECUTE FUNCTION public.hr_trig_enqueue_decision_email();

DROP TRIGGER IF EXISTS trg_hcoc_zz_decision_email ON public.hr_comp_off_credits;
CREATE TRIGGER trg_hcoc_zz_decision_email
  AFTER UPDATE OF status ON public.hr_comp_off_credits
  FOR EACH ROW
  WHEN (NEW.source = 'claim' AND OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected'))
  EXECUTE FUNCTION public.hr_trig_enqueue_decision_email();

-- ── Claim due rows (server only) ──────────────────────────────────────────
-- Takes up to p_limit due rows, bumps attempts and leases them for 10 minutes,
-- so a second sender (the cron, another request) skips them; a sender that dies
-- mid-send leaves the row to be retried when the lease runs out. Rows still
-- unsent 3 days after the decision are marked failed rather than sent late.
CREATE OR REPLACE FUNCTION public.fn_hr_decision_emails_claim(
  p_leave_application_id uuid DEFAULT NULL,
  p_comp_off_credit_id   uuid DEFAULT NULL,
  p_limit                integer DEFAULT 50
)
RETURNS SETOF public.hr_decision_emails
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.hr_decision_emails
     SET status = 'failed',
         last_error = concat_ws(' · ', last_error, 'Not sent within 3 days of the decision')
   WHERE status = 'pending'
     AND created_at < now() - interval '3 days';

  RETURN QUERY
  WITH due AS (
    SELECT e.id
      FROM public.hr_decision_emails e
     WHERE e.status = 'pending'
       AND e.next_attempt_at <= now()
       AND (p_leave_application_id IS NULL OR e.leave_application_id = p_leave_application_id)
       AND (p_comp_off_credit_id IS NULL OR e.comp_off_credit_id = p_comp_off_credit_id)
     ORDER BY e.created_at
     LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.hr_decision_emails e
     SET attempts = e.attempts + 1,
         next_attempt_at = now() + interval '10 minutes'
    FROM due
   WHERE e.id = due.id
  RETURNING e.*;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_hr_decision_emails_claim(uuid, uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hr_decision_emails_claim(uuid, uuid, integer)
  TO service_role;
