-- =============================================================================
-- D13 + D14 — a refusal stops only THAT college's learners, and we record who
--             hosted the event.
--
-- Created: 2026-07-31
-- Applied: NOT APPLIED TO ANY DATABASE — Director-gated apply.
--          Rehearsed only inside a BEGIN .. ROLLBACK batch on prod, with the
--          production state re-read in a SEPARATE call afterwards (the
--          Management API wraps a whole batch in ONE transaction, so an
--          in-batch check proves nothing).
--
-- BUILDS ON, DOES NOT REPLACE: 20260808112000, which IS applied to prod.
-- `health_tournament_permission_approvals` (one row per participating college,
-- DERIVED from the squad roster by trigger) already exists and already holds
-- the decisions. Nothing here invents a second approval mechanism.
--
-- -----------------------------------------------------------------------------
-- D13 — WHAT IS WRONG TODAY
--
--   `fn_health_tournament_recompute_status` sets the WHOLE request to
--   'rejected' the moment ANY one college's row is rejected:
--
--       IF v_rejected > 0 THEN v_overall := 'rejected';
--
--   So when the Pharmacy Principal approves and the Nursing Principal refuses,
--   Pharmacy's learners are blocked too — by a decision taken at a college that
--   is not theirs, by a Principal with no authority over them. The Director has
--   ruled that each Principal's decision binds ONLY their own learners.
--
-- WHAT THIS CHANGES
--
--   (a) A new overall state, 'partially_approved'. Deliberately NOT folded into
--       'approved': a reader must be able to tell a fully-approved trip from a
--       partly-approved one, and a partly-approved trip must never be reported
--       as fully approved. The legacy `step3_principal_status` mirror carries
--       the same value rather than a comfortable lie, so any old reader
--       comparing `= 'approved'` FAILS CLOSED instead of over-reporting.
--
--   (b) `v_health_tournament_participation` now counts a learner only when
--       THEIR OWN college approved — an inner join to the approval row for
--       `learners_profiles.institution_id`. A refused college's learners
--       contribute nothing, and neither do a still-undecided college's.
--
-- 🔴 WHAT THIS DELIBERATELY DOES **NOT** DO
--
--   It does NOT reopen the drop-the-refusing-college workaround.
--   `fn_health_tournament_sync_institutions` keeps a DECIDED approval row even
--   after that college's last learner leaves the roster —
--
--       DELETE ... WHERE a.status = 'pending' AND a.approved_at IS NULL AND ...
--
--   — precisely so a filer cannot dodge a refusal by removing the college. That
--   function is NOT touched by this file, and the state machine below is written
--   so the kept row still counts: a refusal survives into 'partially_approved'
--   and can never be washed out to 'approved'. Proved in the rehearsal.
--
-- THE STATE MACHINE, IN FULL
--
--   no college derived           -> 'pending'   (never auto-approve — D9)
--   any college still undecided  -> 'pending'   (the request IS still awaited)
--   every college approved       -> 'approved'
--   every college refused        -> 'rejected'
--   all decided, mixed answers   -> 'partially_approved'
--   cancelled_at set             -> 'cancelled' (overrides all of the above)
--
--   The "any college still undecided -> pending" branch is what keeps the
--   report honest while a mixed request is mid-flight. It does not hold the
--   approving college's learners back: travel eligibility is read from the
--   per-college row, not from the parent's overall state.
--
-- -----------------------------------------------------------------------------
-- D14 — RECORD WHO HOSTED THE EVENT
--
--   The real letter reads: learners of JKKN College of Pharmacy travelling to
--   'FORZAHS' at Vinayaka Missions Research Foundation, Salem — a State Level
--   Paramedical Sports Tournament. Neither table has a column for that host, so
--   today the organiser is smuggled into `health_sports_achievements.description`
--   as a structured first line ("Hosted by: <name>", see
--   app/(routes)/health/achievements/_lib/outbound.ts) and
--   `health_tournament_permissions` cannot record it at all.
--
--   Buried prose cannot be counted or filtered, which is exactly what an
--   accreditation reviewer asks of it. This makes it a real column on both
--   tables and backfills the rows that carry the prose convention.
--
-- WHY FREE TEXT AND NOT A FOREIGN KEY — surveyed live on prod first:
--   * `public.institutions` (14 rows) holds JKKN's OWN colleges only, and its
--     `id` is the multi-tenant RLS key (`role_has_institution_access`). Putting
--     an outside university in it would hand that body a tenancy it must not
--     have. It is the wrong table by construction, not merely by convention.
--   * `institution_collaborations` (0 rows) is an MOU register — `kind`,
--     `signed_on`, `valid_till`, `amount_inr`. A tournament host is not a
--     signed collaboration.
--   * `industry_partners` (0 rows) is companies.
--   * No `external_institutions` / `host_institutions` / `organising_bodies`
--     table exists.
--   So there is no master to reference, and this file does NOT invent a second
--   list. Free text matches the shape this schema already uses for exactly this
--   (`expo_events.organizer_name`, `expo_masters.organizer_name`,
--   `cdc_external_opportunities.source_organisation`).
--
-- GRANTS — deliberately mirror the LIVE production ACL, never widen it:
--   fn_health_tournament_recompute_status  live: postgres, authenticated, service_role
--   emit_learner_achievement_evidence      live: postgres, service_role  (a
--     trigger function nobody calls directly — granting it to `authenticated`
--     would widen a function that today no signed-in user can execute, so it is
--     re-asserted as-is rather than blanket-granted.)
--   Every one of them is REVOKEd from anon and PUBLIC in this file regardless.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. D13 — the honest state has to be spellable before anything can write it.
--
-- Both CHECKs are widened. `step3_principal_status` too: it is the legacy
-- mirror, and leaving it at pending|approved|rejected would force the recompute
-- to record a partly-approved trip as one of those three — i.e. to lie in
-- exactly the place old readers look.
-- -----------------------------------------------------------------------------
ALTER TABLE public.health_tournament_permissions
  DROP CONSTRAINT IF EXISTS health_tournament_permissions_overall_status_check;
ALTER TABLE public.health_tournament_permissions
  ADD CONSTRAINT health_tournament_permissions_overall_status_check
  CHECK (overall_status = ANY (ARRAY[
    'pending', 'approved', 'partially_approved', 'rejected', 'completed', 'cancelled']));

ALTER TABLE public.health_tournament_permissions
  DROP CONSTRAINT IF EXISTS health_tournament_permissions_step3_principal_status_check;
ALTER TABLE public.health_tournament_permissions
  ADD CONSTRAINT health_tournament_permissions_step3_principal_status_check
  CHECK (step3_principal_status = ANY (ARRAY[
    'pending', 'approved', 'partially_approved', 'rejected']));

-- -----------------------------------------------------------------------------
-- 2. D14 — the host/organiser column on BOTH tables.
-- -----------------------------------------------------------------------------
ALTER TABLE public.health_tournament_permissions
  ADD COLUMN IF NOT EXISTS host_institution text;

ALTER TABLE public.health_sports_achievements
  ADD COLUMN IF NOT EXISTS host_institution text;

COMMENT ON COLUMN public.health_tournament_permissions.host_institution IS
  'D14: the OUTSIDE institution hosting/organising the tournament, e.g. "Vinayaka Missions '
  'Research Foundation, Salem". Free text on purpose — this schema has no master of external '
  'institutions, and public.institutions is JKKN''s own colleges keyed to multi-tenant RLS. '
  'NULL means the event was held at JKKN.';

COMMENT ON COLUMN public.health_sports_achievements.host_institution IS
  'D14: the OUTSIDE institution that hosted/organised the event. Replaces the "Hosted by: <name>" '
  'first line previously folded into `description`, which could not be counted or filtered. '
  'NULL means the event was held at JKKN.';

-- -----------------------------------------------------------------------------
-- 2a. D14 — carry the host into the accreditation evidence.
--
-- `event_name` is already in this k-anonymous metadata; the host belongs beside
-- it, because "which outside body ran the event" is the question the reviewer
-- actually asks and the whole point of D14 is that the answer be filterable
-- rather than buried in prose.
--
-- ⚠️ THIS MUST COME BEFORE THE BACKFILL BELOW. The backfill UPDATE fires
-- `trg_hsa_evidence_fanout`, whose ON CONFLICT DO UPDATE rewrites the row's
-- NAAC 8.3 `metadata` wholesale. Redefining this function AFTER the backfill
-- would therefore re-emit exactly the rows the marker convention produced with
-- the OLD host-unaware body, so the host would land in the column but never in
-- the evidence — defeating the point of the backfill. Caught in review.
--
-- Body copied VERBATIM from the live production definition (read via
-- pg_get_functiondef before writing this file) with ONE key added, so no later
-- work is silently reverted by this replace.
--
-- Grants re-asserted to EXACTLY the live ACL — postgres + service_role. This is
-- a trigger function no signed-in user calls; granting it to `authenticated`
-- would widen it for no reason.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.emit_learner_achievement_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_institution_id uuid;
BEGIN
  IF NOT COALESCE(NEW.verified, false) THEN
    -- State regression: un-verified (or never verified) → no auto evidence.
    DELETE FROM public.quality_evidence_mappings
    WHERE source_table = 'health_sports_achievements'
      AND source_id = NEW.id
      AND is_auto;
    RETURN NEW;
  END IF;

  SELECT lp.institution_id INTO v_institution_id
  FROM public.learners_profiles lp
  WHERE lp.id = NEW.learner_id;

  IF v_institution_id IS NULL THEN
    DELETE FROM public.quality_evidence_mappings
    WHERE source_table = 'health_sports_achievements'
      AND source_id = NEW.id
      AND is_auto;
    RETURN NEW;
  END IF;

  INSERT INTO public.quality_evidence_mappings (
    source_table, source_id, institution_id,
    body_code, metric_code, period_label,
    mapped_by, is_auto, metadata, mapped_at
  ) VALUES (
    'health_sports_achievements', NEW.id, v_institution_id,
    'NAAC', '8.3',
    public.fn_accreditation_ay_label(NEW.achievement_date::timestamptz),
    NEW.verified_by, true,
    -- K-ANONYMOUS: category / type / level / event / host / year — no learner
    -- detail. `host_institution` is the OUTSIDE body that ran the event, which
    -- is an attribute of the event and carries no personal information.
    jsonb_build_object(
      'category',         NEW.category,
      'achievement_type', NEW.achievement_type,
      'event_level',      NEW.event_level,
      'event_name',       NEW.event_name,
      'host_institution', NEW.host_institution,
      'achievement_year', EXTRACT(YEAR FROM NEW.achievement_date)::int,
      'source_trigger',   'emit_learner_achievement_evidence'
    ),
    now()
  )
  ON CONFLICT (source_table, source_id, body_code, metric_code) DO UPDATE
    SET institution_id = EXCLUDED.institution_id,
        period_label   = EXCLUDED.period_label,
        metadata       = EXCLUDED.metadata,
        is_auto        = true,
        mapped_at      = now()
    WHERE public.quality_evidence_mappings.is_auto;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.emit_learner_achievement_evidence() FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.emit_learner_achievement_evidence() TO service_role;


-- -----------------------------------------------------------------------------
-- 2b. D14 — backfill the host out of the legacy prose convention.
-- -----------------------------------------------------------------------------
-- Lift the value out of the prose convention for rows already written that way.
-- Only the FIRST line, only the exact marker — the same strictness the parser in
-- _lib/outbound.ts applies, so free text that merely mentions a host is never
-- mistaken for structured data. The description is left untouched: the reader
-- prefers the column and the parser already hides that line from the notes, so
-- nothing is shown twice and no user-entered text is rewritten by a migration.
--
-- 0 rows match on prod today, but the prose convention is LIVE in the deployed
-- UI, so rows can accumulate between this file being merged and being applied.
-- The AFTER UPDATE evidence fan-out (`trg_hsa_evidence_fanout`) re-fires for any
-- verified row touched here; it is idempotent (ON CONFLICT ... DO UPDATE on
-- quality_evidence_mappings), so a re-emit is a no-op.
UPDATE public.health_sports_achievements
   SET host_institution =
         NULLIF(TRIM(regexp_replace(split_part(description, E'\n', 1), '^Hosted by:\s*', '')), '')
 WHERE host_institution IS NULL
   AND description LIKE 'Hosted by:%';

-- -----------------------------------------------------------------------------
-- 3. D13 — the state machine.
--
-- Body carried over VERBATIM from the applied 20260808112000 definition except
-- for the branch below, so no later work is silently reverted by this replace.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_health_tournament_recompute_status(
  p_permission_id uuid
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total     integer;
  v_approved  integer;
  v_rejected  integer;
  v_pending   integer;
  v_overall   text;
  v_step3     text;
  v_by        uuid;
  v_at        timestamptz;
  v_cancelled timestamptz;
BEGIN
  SELECT cancelled_at INTO v_cancelled
    FROM public.health_tournament_permissions WHERE id = p_permission_id;

  SELECT count(*),
         count(*) FILTER (WHERE status = 'approved'),
         count(*) FILTER (WHERE status = 'rejected')
    INTO v_total, v_approved, v_rejected
    FROM public.health_tournament_permission_approvals
   WHERE permission_id = p_permission_id;

  v_pending := v_total - v_approved - v_rejected;

  IF v_total = 0 THEN
    -- D9: no participating institution could be derived. STAYS PENDING.
    -- Nothing here ever invents an approval to unblock a request, and a request
    -- with no approver is reported as such by the application rather than
    -- waved through.
    v_overall := 'pending';
  ELSIF v_pending > 0 THEN
    -- At least one Principal has not answered. The request as a whole is still
    -- awaited — which is the honest thing to say even when someone has already
    -- approved or already refused. It does NOT hold the approving college's
    -- learners back: travel eligibility is read per college, from
    -- health_tournament_permission_approvals, never from this column.
    v_overall := 'pending';
  ELSIF v_rejected = 0 THEN
    v_overall := 'approved';
  ELSIF v_approved = 0 THEN
    v_overall := 'rejected';
  ELSE
    -- D13: everyone has decided and they did not agree. Some colleges' learners
    -- travel and some do not. Reported as its own state so it can never be read
    -- as a fully-approved trip.
    --
    -- This is also the branch that closes the dodge-a-refusal hole: a refusing
    -- college keeps its row even after its last learner is taken off the squad
    -- (fn_health_tournament_sync_institutions deletes only UNDECIDED rows), so
    -- v_rejected stays > 0 and the request can never climb to 'approved'.
    v_overall := 'partially_approved';
  END IF;

  -- The legacy mirror carries the SAME verdict. Writing 'approved' here for a
  -- partly-approved trip would be the exact over-report D13 forbids, and
  -- writing 'rejected' would be the bug D13 was raised to fix; an old reader
  -- comparing against either now simply does not match, and fails closed.
  v_step3 := v_overall;

  -- The mirror's approver stamp carries the LAST decision recorded, so the
  -- legacy step3_* shape keeps meaning something for readers that predate the
  -- child table.
  SELECT a.approved_by, a.approved_at INTO v_by, v_at
    FROM public.health_tournament_permission_approvals a
   WHERE a.permission_id = p_permission_id AND a.approved_at IS NOT NULL
   ORDER BY a.approved_at DESC
   LIMIT 1;

  -- D10: a cancelled request keeps its computed step3 trail but its overall
  -- status stays 'cancelled' until it is reinstated.
  IF v_cancelled IS NOT NULL THEN
    v_overall := 'cancelled';
  END IF;

  PERFORM set_config('myjkkn.htp_internal', 'on', true);

  UPDATE public.health_tournament_permissions
     SET overall_status         = v_overall,
         step3_principal_status = v_step3,
         step3_approved_by      = v_by,
         step3_approved_at      = v_at,
         updated_at             = now()
   WHERE id = p_permission_id;

  PERFORM set_config('myjkkn.htp_internal', 'off', true);
END;
$$;

COMMENT ON FUNCTION public.fn_health_tournament_recompute_status(uuid) IS
  'D13: each Principal''s decision binds ONLY their own college''s learners. approved when '
  'every participating college approved, rejected when every one refused, partially_approved '
  'when they all decided and disagreed, pending while any is undecided INCLUDING when no '
  'college could be derived (D9: never auto-approve). A refusing college keeps its row when '
  'its learners leave the squad, so a refusal can never be washed out to approved. The '
  'transaction-local myjkkn.htp_internal flag is what lets it past the guard trigger; it is '
  'the only writer of the approval columns.';

REVOKE EXECUTE ON FUNCTION public.fn_health_tournament_recompute_status(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_health_tournament_recompute_status(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. D13 — the participation / accreditation read.
--
-- The old view gated on `p.overall_status = 'approved'`, which is now BOTH too
-- strict and too coarse: too strict because the Pharmacy learners of a
-- partly-approved trip really did travel, and too coarse because it would
-- otherwise sweep the refusing college's learners in with them.
--
-- The gate is now the learner's OWN college's row. A refused college's learners
-- contribute nothing; so do a college that has not answered yet, and so does a
-- learner with no institution_id (nobody could have approved for them).
--
-- security_invoker = true is REQUIRED, not stylistic: a view without it runs as
-- its OWNER and would hand every caller the whole table.
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_health_tournament_participation;
CREATE VIEW public.v_health_tournament_participation
WITH (security_invoker = true) AS
SELECT
  p.id                AS permission_id,
  p.tournament_name,
  p.tournament_level,
  p.sport,
  p.host_institution,
  p.start_date,
  p.end_date,
  m.learner_id,
  lp.institution_id,
  p.overall_status
FROM public.health_tournament_permissions p
CROSS JOIN LATERAL (
  SELECT (e->>'learner_id')::uuid AS learner_id
    FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof(COALESCE(p.team_members, '[]'::jsonb)) = 'array'
                THEN p.team_members ELSE '[]'::jsonb END) e
   WHERE jsonb_typeof(e) = 'object'
     AND e->>'learner_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  UNION
  SELECT p.learner_id WHERE p.learner_id IS NOT NULL
) m
JOIN public.learners_profiles lp ON lp.id = m.learner_id
JOIN public.health_tournament_permission_approvals a
  ON a.permission_id = p.id
 AND a.institution_id = lp.institution_id
WHERE p.cancelled_at IS NULL
  AND a.status = 'approved';

COMMENT ON VIEW public.v_health_tournament_participation IS
  'D13: per-learner participation for accreditation, counted ONLY where the learner''s OWN '
  'college approved. One Principal''s refusal removes that college''s learners and nobody '
  'else''s. Not cancelled ONLY — a called-off trip keeps its record and its approval trail '
  'but counts for nothing here. security_invoker so every caller still passes the underlying '
  'RLS. `overall_status` is carried through so a reader can see that a trip was only '
  'partially approved.';

-- A dropped-and-recreated view is re-granted by Supabase's ALTER DEFAULT
-- PRIVILEGES, which reaches views and matviews as well as tables — so the
-- revoke is load-bearing, not decoration.
REVOKE ALL ON public.v_health_tournament_participation FROM anon, PUBLIC;
GRANT SELECT ON public.v_health_tournament_participation TO authenticated;
