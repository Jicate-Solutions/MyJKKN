-- ============================================================================
-- IQAC Foundations — programme scope, ownership acknowledgement, and the
-- reported-vs-actual snapshot.
--
-- Date: 2026-08-02
-- Spec: specs/iqac-apex-collect-once-report-many.md (Director decisions 6, 7, 8, 10)
--
-- CONTEXT
-- -------
-- `public.quality_evidence_mappings` already implements "collect once, report
-- many": 212 rows, 127 distinct source rows, and 46 of those sources already
-- feed two awarding bodies at once. The spine works. What it cannot yet express
-- is four things the Director locked on 2026-08-01:
--
--   (6) NBA judges each DEGREE separately, so a piece of evidence sometimes
--       belongs to one programme rather than to the whole institution.
--   (7) The numbers move after a submission is filed, so both the figure that
--       was REPORTED and the figure that is ACTUAL today must be retrievable.
--   (8) IQAC assigns an owner; the named person CONFIRMS. An assignment is
--       pending until acknowledged — accountability accepted, not imposed.
--  (10) A paper co-authored by two colleges belongs to both, but the cluster
--       must count it ONCE.
--
-- WHAT THE LIVE CATALOG SAID, AND WHERE IT CONTRADICTED THE SPEC
-- --------------------------------------------------------------
-- The spec instructed a live read before writing any SQL. Two of its guesses
-- came back false, and this file is shaped by the answers rather than by the
-- guesses:
--
--   * The spec supposed `accreditation_metric_owners.metric_code` might already
--     be nullable, so that a NULL row would express body-level ownership with
--     no DDL at all. It is `NOT NULL`. §2 makes it nullable, which is why that
--     change lives here and not in the ownership-page PR that assumed it.
--
--   * The spec supposed `accreditation_submissions` might carry the
--     reported-vs-actual snapshot as-is. It carries the submission ENVELOPE
--     (one row per institution × body × period, with a single
--     `coverage_snapshot numeric`) but has no metric code and no per-metric
--     figure. Rather than add a second snapshot table beside an empty one —
--     the exact parallel-mechanism failure this project has recorded before —
--     §5 gives its existing `metadata jsonb` a documented shape and a reader.
--
-- ============================================================================

-- ----------------------------------------------------------------------------
-- §1 — Programme scope (decision 6)
--
-- Nullable on purpose. NAAC, NIRF and the other institution-level bodies leave
-- it empty; only NBA fills it. A NULL therefore reads as "this belongs to the
-- institution as a whole", which is what 212 of 212 existing rows mean today.
--
-- ON DELETE CASCADE, not SET NULL: a programme-level NBA tag for a programme
-- that no longer exists is not institution-level evidence, it is orphaned. And
-- SET NULL would collapse two programme rows onto the same NULL, colliding on
-- the uniqueness rules established in §3 and §4.
-- ----------------------------------------------------------------------------

ALTER TABLE public.quality_evidence_mappings
  ADD COLUMN IF NOT EXISTS programme_id uuid NULL
    REFERENCES public.programs(id) ON DELETE CASCADE;

ALTER TABLE public.accreditation_metric_owners
  ADD COLUMN IF NOT EXISTS programme_id uuid NULL
    REFERENCES public.programs(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.quality_evidence_mappings.programme_id IS
  'NULL = evidence belongs to the institution as a whole (NAAC, NIRF, and every '
  'other institution-level body). Non-NULL = evidence belongs to one degree '
  'programme, which is how NBA inspects. Director decision 6, 2026-08-01.';

COMMENT ON COLUMN public.accreditation_metric_owners.programme_id IS
  'NULL = ownership at institution level. Non-NULL = ownership of one degree '
  'programme''s slice, for NBA. Director decision 6, 2026-08-01.';

CREATE INDEX IF NOT EXISTS idx_qem_programme
  ON public.quality_evidence_mappings (programme_id, body_code, metric_code)
  WHERE programme_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- §2 — Body-level ownership (decision 2 groundwork; unblocks the owners page)
--
-- `metric_code NOT NULL` forced every ownership row to name one of 107 metrics.
-- There was no way to say "Dr X owns NAAC for JKKN Dental" without writing 69
-- near-identical rows. Making it nullable lets ONE row carry body-level
-- ownership, and the ownership page inherits from it rather than duplicating.
-- ----------------------------------------------------------------------------

ALTER TABLE public.accreditation_metric_owners
  ALTER COLUMN metric_code DROP NOT NULL;

COMMENT ON COLUMN public.accreditation_metric_owners.metric_code IS
  'NULL = this row owns the whole body for this institution; metrics beneath it '
  'inherit unless they carry an explicit row of their own. Non-NULL = ownership '
  'of that single metric, which overrides the inherited body owner.';

-- ----------------------------------------------------------------------------
-- §3 — Ownership uniqueness under NULLs
--
-- The old constraint was UNIQUE (institution_id, body_code, metric_code). With
-- metric_code now nullable, standard SQL treats every NULL as distinct, so
-- nothing would stop two competing body-level owners for the same body — which
-- is precisely the ambiguity ownership exists to remove.
--
-- PostgreSQL 15 (this cluster runs 15.6) supports NULLS NOT DISTINCT, which
-- makes NULL collide with NULL exactly as intended: one body-level owner, one
-- owner per metric, one owner per programme slice.
-- ----------------------------------------------------------------------------

ALTER TABLE public.accreditation_metric_owners
  DROP CONSTRAINT IF EXISTS accreditation_metric_owners_institution_id_body_code_metric_key;

ALTER TABLE public.accreditation_metric_owners
  ADD CONSTRAINT accreditation_metric_owners_scope_key
  UNIQUE NULLS NOT DISTINCT (institution_id, body_code, metric_code, programme_id);

-- ----------------------------------------------------------------------------
-- §4 — Evidence uniqueness under programme scope
--
-- The same source row may legitimately be claimed once for the institution and
-- once for a specific programme (a paper counts for the college's NAAC return
-- and for that degree's NBA return). Adding programme_id to the key allows
-- that; NULLS NOT DISTINCT still forbids two identical institution-level claims.
-- ----------------------------------------------------------------------------

ALTER TABLE public.quality_evidence_mappings
  DROP CONSTRAINT IF EXISTS quality_evidence_mappings_source_table_source_id_body_code__key;

ALTER TABLE public.quality_evidence_mappings
  ADD CONSTRAINT quality_evidence_mappings_source_scope_key
  UNIQUE NULLS NOT DISTINCT (source_table, source_id, body_code, metric_code, programme_id);

-- ----------------------------------------------------------------------------
-- §5 — Acknowledged ownership (decision 8)
--
-- An assignment is PENDING until the named person confirms it. The paired CHECK
-- makes the two facts inseparable: a row cannot claim to be confirmed while
-- carrying no acknowledgement timestamp, and cannot carry one while pending.
--
-- History is one hop deep — who held it immediately before, and when it moved.
-- That is what the ownership page renders. A full audit trail would be a second
-- table, and one hop answers the question actually being asked.
-- ----------------------------------------------------------------------------

ALTER TABLE public.accreditation_metric_owners
  ADD COLUMN IF NOT EXISTS assignment_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS acknowledged_by uuid NULL
    REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS previous_owner_user_id uuid NULL
    REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_changed_at timestamptz NULL;

ALTER TABLE public.accreditation_metric_owners
  DROP CONSTRAINT IF EXISTS accreditation_metric_owners_assignment_status_check;

ALTER TABLE public.accreditation_metric_owners
  ADD CONSTRAINT accreditation_metric_owners_assignment_status_check
  CHECK (assignment_status IN ('pending', 'confirmed', 'declined'));

ALTER TABLE public.accreditation_metric_owners
  DROP CONSTRAINT IF EXISTS accreditation_metric_owners_ack_pairing_check;

ALTER TABLE public.accreditation_metric_owners
  ADD CONSTRAINT accreditation_metric_owners_ack_pairing_check
  CHECK ((assignment_status = 'pending') = (acknowledged_at IS NULL));

COMMENT ON COLUMN public.accreditation_metric_owners.assignment_status IS
  'pending until the named owner confirms. Director decision 8, 2026-08-01: '
  'IQAC assigns, the department confirms — accountability accepted, not imposed.';

-- ----------------------------------------------------------------------------
-- §6 — The reported-vs-actual snapshot (decision 7)
--
-- `accreditation_submissions.metadata` gains a documented shape rather than a
-- new table:
--
--   {
--     "reported_metrics": { "<metric_code>": <number>, ... },
--     "reported_at": "<ISO 8601>"
--   }
--
-- Everything already in `metadata` is untouched; this reserves one key.
-- ----------------------------------------------------------------------------

COMMENT ON COLUMN public.accreditation_submissions.metadata IS
  'Free-form, with one reserved key: `reported_metrics` is an object mapping '
  'metric_code -> the figure filed with the body at submission time, and '
  '`reported_at` the ISO timestamp it was frozen. Read via '
  'fn_accreditation_reported_vs_actual(). Director decision 7, 2026-08-01: the '
  'numbers move after filing, so both the reported and the current figure must '
  'stay retrievable.';

CREATE OR REPLACE FUNCTION public.fn_accreditation_reported_vs_actual(
  p_institution_id uuid,
  p_body_code      text,
  p_period_label   text
)
RETURNS TABLE (
  metric_code   text,
  reported      numeric,
  actual        bigint,
  drift         numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reported jsonb;
BEGIN
  -- Caller identity is taken from the session, never from an argument. A
  -- SECURITY DEFINER function that accepts the user it should act as is an
  -- IDOR; this one accepts only the institution being asked about and then
  -- checks whether the SESSION may see it.
  IF NOT (
    COALESCE((SELECT is_super_admin()), false)
    OR COALESCE((SELECT is_admin()), false)
    OR (
      COALESCE((SELECT user_has_permission('accreditation.evidence.view')), false)
      AND COALESCE(role_has_institution_access(p_institution_id), false)
    )
  ) THEN
    RAISE EXCEPTION 'not authorised to read accreditation evidence for this institution'
      USING ERRCODE = '42501';
  END IF;

  SELECT s.metadata -> 'reported_metrics'
    INTO v_reported
    FROM public.accreditation_submissions s
   WHERE s.institution_id = p_institution_id
     AND s.body_code      = p_body_code
     AND s.period_label   = p_period_label
     AND s.submitted_at IS NOT NULL
   ORDER BY s.submitted_at DESC
   LIMIT 1;

  RETURN QUERY
  -- Every metric that either side knows about, so a metric that was reported
  -- and has since fallen to zero is still visible. A metric present only in
  -- the snapshot returns actual = 0 rather than vanishing.
  WITH reported_rows AS (
    SELECT r.key AS mc, NULLIF(r.value, 'null')::numeric AS val
      FROM jsonb_each_text(COALESCE(v_reported, '{}'::jsonb)) AS r(key, value)
  ),
  actual_rows AS (
    SELECT m.metric_code AS mc, count(*)::bigint AS val
      FROM public.quality_evidence_mappings m
     WHERE m.institution_id = p_institution_id
       AND m.body_code      = p_body_code
       AND m.period_label   = p_period_label
     GROUP BY m.metric_code
  )
  SELECT
    COALESCE(rr.mc, ar.mc)                                   AS metric_code,
    rr.val                                                   AS reported,
    COALESCE(ar.val, 0)                                      AS actual,
    CASE WHEN rr.val IS NULL THEN NULL
         ELSE COALESCE(ar.val, 0)::numeric - rr.val END      AS drift
  FROM reported_rows rr
  FULL OUTER JOIN actual_rows ar ON ar.mc = rr.mc
  ORDER BY 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_accreditation_reported_vs_actual(uuid, text, text)
  FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_accreditation_reported_vs_actual(uuid, text, text)
  TO authenticated;

-- ----------------------------------------------------------------------------
-- §7 — Cross-college dedup (decision 10)
--
-- A paper co-authored by two colleges is two rows — one per institution —
-- because each college genuinely holds it. Summing those rows at cluster level
-- double-counts. This returns BOTH numbers plus the overlap, mirroring the
-- honesty already settled on for the CAC cluster roster (PR #2487): print the
-- discrepancy rather than silently picking one number.
--
--   college_total — the sum every college would report for itself
--   cluster_total — distinct source rows, so a shared paper counts once
--   shared_count  — source rows claimed by more than one institution
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_accreditation_evidence_scope(
  p_body_code    text,
  p_period_label text DEFAULT NULL
)
RETURNS TABLE (
  metric_code   text,
  college_total bigint,
  cluster_total bigint,
  shared_count  bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Cluster-wide by definition, so there is no single institution to scope to.
  -- Reading it therefore requires the cluster-level view permission rather than
  -- institution access.
  IF NOT (
    COALESCE((SELECT is_super_admin()), false)
    OR COALESCE((SELECT is_admin()), false)
    OR COALESCE((SELECT user_has_permission('accreditation.evidence.view')), false)
  ) THEN
    RAISE EXCEPTION 'not authorised to read cluster accreditation evidence'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT m.metric_code AS mc, m.source_table, m.source_id, m.institution_id
      FROM public.quality_evidence_mappings m
     WHERE m.body_code = p_body_code
       AND (p_period_label IS NULL OR m.period_label = p_period_label)
  ),
  per_source AS (
    SELECT s.mc, s.source_table, s.source_id,
           count(DISTINCT s.institution_id) AS claiming_institutions
      FROM scoped s
     GROUP BY s.mc, s.source_table, s.source_id
  )
  SELECT
    ps.mc                                                           AS metric_code,
    SUM(ps.claiming_institutions)::bigint                           AS college_total,
    count(*)::bigint                                                AS cluster_total,
    count(*) FILTER (WHERE ps.claiming_institutions > 1)::bigint    AS shared_count
  FROM per_source ps
  GROUP BY ps.mc
  ORDER BY 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_accreditation_evidence_scope(text, text)
  FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_accreditation_evidence_scope(text, text)
  TO authenticated;

-- ----------------------------------------------------------------------------
-- §8 — Normalise the two stray period labels
--
-- 210 rows read `AY 2026-27`; two read `2026-27`. A year selector filtering on
-- the label would silently drop those two.
-- ----------------------------------------------------------------------------

UPDATE public.quality_evidence_mappings
   SET period_label = 'AY ' || period_label
 WHERE period_label ~ '^\d{4}-\d{2}$';

-- ----------------------------------------------------------------------------
-- §9 — Close the anon default grant on the three tables this file touches
--
-- Supabase's ALTER DEFAULT PRIVILEGES grants anon ALL on every new relation,
-- separately from PUBLIC. RLS currently stops anon reading rows, so the live
-- anon sweep reads clean — but the table-level grant is still there, one
-- permissive policy away from mattering. Revoke it while we are here.
--
-- `authenticated` holds its own explicit grant, unaffected by revoking PUBLIC;
-- it is re-granted below anyway so the intent is stated rather than inferred.
-- `cockpit_reader`'s existing SELECT on quality_evidence_mappings is left alone.
-- ----------------------------------------------------------------------------

REVOKE ALL ON public.quality_evidence_mappings    FROM anon, PUBLIC;
REVOKE ALL ON public.accreditation_metric_owners  FROM anon, PUBLIC;
REVOKE ALL ON public.accreditation_submissions    FROM anon, PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quality_evidence_mappings   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accreditation_metric_owners TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accreditation_submissions   TO authenticated;

-- ----------------------------------------------------------------------------
-- §10 — Assert, in this transaction, that the intent above actually took
--
-- A GRANT or REVOKE that silently did nothing is the failure mode these
-- assertions exist to catch: the statement succeeds, the ACL is unchanged, and
-- the migration reports success. Fail loudly here instead.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  t text;
  p text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'public.quality_evidence_mappings',
    'public.accreditation_metric_owners',
    'public.accreditation_submissions'
  ] LOOP
    FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
      IF has_table_privilege('anon', t, p) THEN
        RAISE EXCEPTION 'anon still holds % on % after REVOKE', p, t;
      END IF;
      IF NOT has_table_privilege('authenticated', t, p) THEN
        RAISE EXCEPTION 'authenticated lost % on % — this migration broke the app', p, t;
      END IF;
    END LOOP;
  END LOOP;

  IF has_function_privilege('anon',
       'public.fn_accreditation_reported_vs_actual(uuid, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute fn_accreditation_reported_vs_actual';
  END IF;
  IF has_function_privilege('anon',
       'public.fn_accreditation_evidence_scope(text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute fn_accreditation_evidence_scope';
  END IF;

  IF EXISTS (SELECT 1 FROM public.quality_evidence_mappings
              WHERE period_label ~ '^\d{4}-\d{2}$') THEN
    RAISE EXCEPTION 'period labels still un-normalised';
  END IF;
END $$;
