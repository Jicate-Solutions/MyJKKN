-- Referral incentive release 2025-26 — payment history / claims importer
-- Created 2026-07-22. Spec: SPECS.md §6 F1+F2. Decisions D9/D11/D12/D13/D16.
--
-- One safe, one-way door: an admin uploads a file of 2025-26 referral rows into a
-- staging batch, a set-based validator buckets every row (ok / flagged / blocked /
-- no_match) against the REAL admissions, agencies and staff, the admin reviews the
-- exception report, and only on explicit approval are ok rows promoted. Nothing is
-- written to the money tables by the act of uploading.
--
-- Match key = learners_profiles.application_id (verified 2026-07-22: 100% populated
-- and unique across the 1,863 2025-26 admissions; register_number is 99% but has 6
-- duplicate groups, so it cannot be the key).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Staging tables
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.referral_import_batches (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename         text,
  academic_year    text NOT NULL DEFAULT '2025-26',
  status           text NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','validated','approved','committed','cancelled')),
  row_count        integer NOT NULL DEFAULT 0,
  ok_count         integer NOT NULL DEFAULT 0,
  flagged_count    integer NOT NULL DEFAULT 0,
  blocked_count    integer NOT NULL DEFAULT 0,
  no_match_count   integer NOT NULL DEFAULT 0,
  already_paid_count integer NOT NULL DEFAULT 0,
  uploaded_by      uuid REFERENCES public.profiles(id),
  approved_by      uuid REFERENCES public.profiles(id),
  approved_at      timestamptz,
  committed_by     uuid REFERENCES public.profiles(id),
  committed_at     timestamptz,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.referral_import_rows (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id               uuid NOT NULL REFERENCES public.referral_import_batches(id) ON DELETE CASCADE,
  row_number             integer NOT NULL,
  -- raw input (exactly the template columns)
  referrer_name          text,
  referrer_type          text,     -- 'consultant' | 'faculty' | 'student'
  referrer_code          text,     -- agency code or staff_id (optional)
  referrer_contact       text,     -- phone or email (optional)
  student_application_id text,     -- THE match key
  student_name           text,     -- cross-check only
  programme              text,
  institution            text,
  referral_date          date,
  amount_agreed          numeric,
  amount_paid            numeric,  -- filled ONLY if already settled → double-pay ledger
  paid_date              date,
  paid_method            text,
  paid_reference         text,
  -- resolved by the validator
  matched_learner_id     uuid,
  matched_year           integer,
  referrer_ref_table     text,     -- 'education_consultants' | 'staff' | 'learners_profiles'
  referrer_ref_id        uuid,
  -- verdict
  verdict                text,     -- 'ok' | 'flagged' | 'blocked' | 'no_match'
  verdict_reasons        jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_already_paid        boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_import_rows_batch ON public.referral_import_rows(batch_id);
CREATE INDEX IF NOT EXISTS idx_referral_import_rows_appid ON public.referral_import_rows(student_application_id);

ALTER TABLE public.referral_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_import_rows    ENABLE ROW LEVEL SECURITY;

-- Admission-global users / super admins only (this is money-adjacent, cross-institution).
DROP POLICY IF EXISTS referral_import_batches_all ON public.referral_import_batches;
CREATE POLICY referral_import_batches_all ON public.referral_import_batches
  FOR ALL USING (is_super_admin() OR is_admin() OR user_has_permission('admission.leads.edit'))
  WITH CHECK (is_super_admin() OR is_admin() OR user_has_permission('admission.leads.edit'));

DROP POLICY IF EXISTS referral_import_rows_all ON public.referral_import_rows;
CREATE POLICY referral_import_rows_all ON public.referral_import_rows
  FOR ALL USING (is_super_admin() OR is_admin() OR user_has_permission('admission.leads.edit'))
  WITH CHECK (is_super_admin() OR is_admin() OR user_has_permission('admission.leads.edit'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Validator — one set-based pass, no row-by-row. Idempotent: re-running
--    re-derives every verdict from scratch, so a re-upload can be re-validated.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_validate_referral_import_batch(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_counts jsonb;
BEGIN
  -- reset
  UPDATE referral_import_rows
     SET matched_learner_id=NULL, matched_year=NULL, referrer_ref_table=NULL,
         referrer_ref_id=NULL, verdict=NULL, verdict_reasons='[]'::jsonb, is_already_paid=false
   WHERE batch_id=p_batch_id;

  -- (a) match the student on application_id, preferring a 2025-26 admission
  UPDATE referral_import_rows r
     SET matched_learner_id = lp.id, matched_year = ay.year
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
   WHERE r.batch_id = p_batch_id
     AND lp.application_id = r.student_application_id
     AND ay.year = 2025;

  -- (b) if not matched in 2025, note whether the application exists in another year
  UPDATE referral_import_rows r
     SET matched_year = ay.year
    FROM learners_profiles lp
    JOIN admission_years ay ON ay.id = lp.admission_year_id
   WHERE r.batch_id = p_batch_id
     AND r.matched_learner_id IS NULL
     AND lp.application_id = r.student_application_id;

  -- (c) resolve the referrer by type
  --     consultant → education_consultants by code, else phone, else email
  UPDATE referral_import_rows r
     SET referrer_ref_table='education_consultants', referrer_ref_id=ec.id
    FROM education_consultants ec
   WHERE r.batch_id=p_batch_id AND lower(r.referrer_type)='consultant'
     AND ( (nullif(r.referrer_code,'')    IS NOT NULL AND ec.code  = r.referrer_code)
        OR (nullif(r.referrer_contact,'') IS NOT NULL AND ec.phone = r.referrer_contact)
        OR (nullif(r.referrer_contact,'') IS NOT NULL AND lower(ec.email) = lower(r.referrer_contact)) );

  --     faculty → staff by staff_id, else email, else phone
  UPDATE referral_import_rows r
     SET referrer_ref_table='staff', referrer_ref_id=s.id
    FROM staff s
   WHERE r.batch_id=p_batch_id AND lower(r.referrer_type)='faculty'
     AND ( (nullif(r.referrer_code,'')    IS NOT NULL AND s.staff_id = r.referrer_code)
        OR (nullif(r.referrer_contact,'') IS NOT NULL AND lower(s.email) = lower(r.referrer_contact))
        OR (nullif(r.referrer_contact,'') IS NOT NULL AND s.phone = r.referrer_contact) );

  --     student → learners_profiles by application_id
  UPDATE referral_import_rows r
     SET referrer_ref_table='learners_profiles', referrer_ref_id=lp.id
    FROM learners_profiles lp
   WHERE r.batch_id=p_batch_id AND lower(r.referrer_type)='student'
     AND nullif(r.referrer_code,'') IS NOT NULL AND lp.application_id = r.referrer_code;

  -- (d) accumulate reasons, then derive verdict
  WITH dup AS (
    SELECT student_application_id
      FROM referral_import_rows
     WHERE batch_id=p_batch_id AND nullif(student_application_id,'') IS NOT NULL
     GROUP BY student_application_id HAVING count(*) > 1
  )
  UPDATE referral_import_rows r
     SET is_already_paid = (COALESCE(r.amount_paid,0) > 0),
         verdict_reasons = (
           SELECT COALESCE(jsonb_agg(reason), '[]'::jsonb) FROM (
             SELECT 'No 2025-26 admission matches this application number'::text AS reason
               WHERE r.matched_learner_id IS NULL AND r.matched_year IS NULL
             UNION ALL SELECT 'Application number belongs to a different admission year ('||r.matched_year||')'
               WHERE r.matched_learner_id IS NULL AND r.matched_year IS NOT NULL
             UNION ALL SELECT 'Self-referral: the referrer is the admitted student'
               WHERE r.referrer_ref_table='learners_profiles' AND r.referrer_ref_id = r.matched_learner_id
                 AND r.matched_learner_id IS NOT NULL
             UNION ALL SELECT 'Referrer could not be found in the system'
               WHERE r.referrer_ref_id IS NULL
             UNION ALL SELECT 'Student name does not match the admission on file'
               WHERE r.matched_learner_id IS NOT NULL AND nullif(r.student_name,'') IS NOT NULL
                 AND extensions.similarity(lower(r.student_name),
                       lower((SELECT trim(coalesce(lp.first_name,'')||' '||coalesce(lp.last_name,''))
                                FROM learners_profiles lp WHERE lp.id=r.matched_learner_id))) < 0.3
             UNION ALL SELECT 'Possible family referral — needs review'
               WHERE r.matched_learner_id IS NOT NULL AND nullif(r.referrer_name,'') IS NOT NULL
                 AND EXISTS (
                   SELECT 1 FROM learners_profiles lp WHERE lp.id=r.matched_learner_id
                     AND ( extensions.similarity(lower(r.referrer_name), lower(coalesce(lp.father_name,''))) > 0.6
                        OR extensions.similarity(lower(r.referrer_name), lower(coalesce(lp.mother_name,''))) > 0.6 ) )
             UNION ALL SELECT 'This student is claimed more than once in this file'
               WHERE r.student_application_id IN (SELECT student_application_id FROM dup)
             UNION ALL SELECT 'This student already has a referrer on record'
               WHERE r.matched_learner_id IS NOT NULL
                 AND EXISTS (SELECT 1 FROM learners_profiles lp
                              WHERE lp.id=r.matched_learner_id AND lp.referred_by_id IS NOT NULL)
             UNION ALL SELECT 'No agreed amount given'
               WHERE COALESCE(r.amount_agreed,0) = 0 AND COALESCE(r.amount_paid,0) = 0
             UNION ALL SELECT 'Referrer has no bank details / PAN on file — cannot be paid until added'
               WHERE r.referrer_ref_table='education_consultants'
                 AND EXISTS (SELECT 1 FROM education_consultants ec WHERE ec.id=r.referrer_ref_id
                              AND (nullif(ec.bank_account_number,'') IS NULL OR nullif(ec.pan_number,'') IS NULL))
             UNION ALL SELECT 'Recorded as already paid — will not be paid again'
               WHERE COALESCE(r.amount_paid,0) > 0
           ) reasons
         )
   WHERE r.batch_id=p_batch_id;

  -- (e) verdict precedence: no_match > blocked(self-ref) > flagged(any real flag) > ok.
  --     "already paid" and "no bank details" are informational, not blocking flags.
  UPDATE referral_import_rows r
     SET verdict = CASE
       WHEN r.matched_learner_id IS NULL THEN 'no_match'
       WHEN r.verdict_reasons @> '["Self-referral: the referrer is the admitted student"]'::jsonb THEN 'blocked'
       WHEN EXISTS (
         SELECT 1 FROM jsonb_array_elements_text(r.verdict_reasons) x(reason)
          WHERE x.reason NOT IN (
            'Recorded as already paid — will not be paid again',
            'Referrer has no bank details / PAN on file — cannot be paid until added'
          )
       ) THEN 'flagged'
       ELSE 'ok' END
   WHERE r.batch_id=p_batch_id;

  -- (f) roll counts up to the batch
  UPDATE referral_import_batches b
     SET row_count        = c.n,
         ok_count         = c.ok,
         flagged_count    = c.flagged,
         blocked_count    = c.blocked,
         no_match_count   = c.no_match,
         already_paid_count = c.already_paid,
         status           = 'validated',
         updated_at       = now()
    FROM (
      SELECT count(*) n,
             count(*) FILTER (WHERE verdict='ok') ok,
             count(*) FILTER (WHERE verdict='flagged') flagged,
             count(*) FILTER (WHERE verdict='blocked') blocked,
             count(*) FILTER (WHERE verdict='no_match') no_match,
             count(*) FILTER (WHERE is_already_paid) already_paid
        FROM referral_import_rows WHERE batch_id=p_batch_id
    ) c
   WHERE b.id=p_batch_id
  RETURNING jsonb_build_object('row_count',b.row_count,'ok',b.ok_count,'flagged',b.flagged_count,
              'blocked',b.blocked_count,'no_match',b.no_match_count,'already_paid',b.already_paid_count)
    INTO v_counts;

  RETURN v_counts;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_validate_referral_import_batch(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_validate_referral_import_batch(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_validate_referral_import_batch(uuid) IS
  'Validates a referral import batch against real admissions/agencies/staff. Buckets each row ok/flagged/blocked/no_match. Read-only against production data; writes only to staging rows. Idempotent.';
