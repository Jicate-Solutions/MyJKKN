-- ============================================================================
-- Accreditation — tell a human when the AI gives up on a narrative
-- File: 20260730013000_accreditation_narrative_capout_notice.sql
-- Date: 2026-07-26
--
-- WHY
--   20260726170000_accreditation_narrative_attempt_cap.sql capped how many
--   times the nightly drafter may re-draft one narrative that keeps failing the
--   deterministic grounding gate. That stopped the nightly churn — but it
--   stopped it SILENTLY. Once attempt_count reaches
--   accreditation.narrative_max_draft_attempts the pair simply stops being
--   offered by fn_accreditation_narrative_awaiting. Nothing is flagged, nobody
--   is told, and the ungrounded draft sits in the work-list looking exactly
--   like a draft that is merely waiting its turn. That migration said so
--   explicitly: "Escalation to a human is the existing owner/IQAC queue's job,
--   not this migration's." This is that job.
--
-- WHAT THIS ADDS
--   1. accreditation_metric_narratives.capout_notified_at — the one-notice-ever
--      guard. A timestamp column, not a count comparison, so the guard cannot
--      drift when the cap policy is later raised or lowered.
--   2. fn_accreditation_narrative_capout_pending(body_code, limit) — the
--      detector. Returns the capped-out, not-yet-notified narratives WITH their
--      resolved recipients and the honest facts a notice needs (metric,
--      institution, period, attempts used, the tokens the gate could not trace).
--      Read-only (STABLE): the detector never writes, so running it twice is
--      free and it can be dry-run in production without side effects.
--   3. fn_accreditation_narrative_mark_capout_notified(id) — the atomic claim.
--      UPDATE ... WHERE capout_notified_at IS NULL, returning whether THIS call
--      won. Two concurrent runners can both see a row; only one claims it.
--
--   The caller (app/api/cron/accreditation-narrative-capout-notice) sends the
--   notice through the canonical fanoutNotification helper, whose own
--   idempotency_key is a second, independent guard: notifications has a UNIQUE
--   partial index on idempotency_key, so even a crash between "notify" and
--   "mark" can never produce a second bell item.
--
-- WHO GETS THE NOTICE (the "never orphaned" rule)
--   Only 11 of 80 live narratives have an owner_user_id, because
--   fn_accreditation_resolve_metric_owner needs either an
--   accreditation_metric_owners row (0 exist) or an active committee with a
--   chair (1 of 14 institutions has one). Notifying owner_user_id alone would
--   therefore help almost nobody. The detector resolves recipients in three
--   tiers, and the tier it used is returned so the notice can say so out loud:
--     owner              → the resolved owner, alone.
--     institution_queue  → the IQAC/admin queue AT THAT INSTITUTION: exactly the
--                          humans the row's RLS SELECT policy already lets open
--                          it (super admin / admin at that institution, or a
--                          holder of accreditation.naac.narrative.view/.manage
--                          whose role scope reaches it).
--     platform_queue     → every active super admin. Reached only when an
--                          institution has NO local admin at all — which is a
--                          real case today: Nattraja Vidhyalya CBSE (29c221d1)
--                          has an ungrounded 7.10.1 draft and zero local admin
--                          accounts. Without this tier that notice is orphaned.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   It does not touch fn_accreditation_narrative_awaiting, does not change
--   attempt counting, does not relax the grounding gate, and marks nothing
--   grounded. A capped-out row keeps its real 'ungrounded' verdict and its real
--   tokens forever. Metric 7.3.f on institution 5736d86f is blocked on a
--   fabricated 0.22 that appears nowhere in its evidence; the gate is RIGHT and
--   must stay right. The notice this builds says "a person needs to look at
--   this", never "unblock this".
--   It also does not move updated_at when it marks a notice sent — a
--   notification is not an edit of the narrative, and the work-list sorts on
--   updated_at.
--
-- SECURITY
--   Both functions are new and SECURITY DEFINER. The LIVE ACLs of their closest
--   siblings were read from prod before writing this
--   (has_function_privilege, 2026-07-26): fn_accreditation_narrative_awaiting
--   and fn_accreditation_resolve_metric_owner are BOTH anon=false,
--   authenticated=false, service_role=true. These are cron-only reads/writes
--   over other people's institutions, so they take the same shape: revoked from
--   anon + authenticated + PUBLIC, granted to service_role only.
--   No new table is created, so no table-level REVOKE is required here. (The
--   base table's own anon grants are a pre-existing platform-wide default-grant
--   issue, out of scope for this change — see the PR body.)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The one-notice-ever guard.
-- ----------------------------------------------------------------------------
ALTER TABLE public.accreditation_metric_narratives
  ADD COLUMN IF NOT EXISTS capout_notified_at timestamptz;

COMMENT ON COLUMN public.accreditation_metric_narratives.capout_notified_at IS
  'When the "the AI could not ground this and has stopped retrying" notice was sent for this narrative. Set exactly once by fn_accreditation_narrative_mark_capout_notified; NULL means no notice has been sent. This is the idempotency guard for the cap-out notice — a timestamp, not a count comparison, so raising or lowering accreditation.narrative_max_draft_attempts later can never re-fire a notice that already went out. Says nothing about the narrative''s grounding verdict or workflow status.';

-- Partial index: the detector's hot predicate is "not yet notified", and the
-- overwhelming majority of rows will eventually be notified=NULL forever
-- (grounded rows never cap out). Tiny index, exact match for the scan.
CREATE INDEX IF NOT EXISTS idx_accred_narratives_capout_unnotified
  ON public.accreditation_metric_narratives (body_code, attempt_count)
  WHERE capout_notified_at IS NULL AND status = 'ai_drafted';

-- ----------------------------------------------------------------------------
-- 2. The detector. Read-only; returns recipients already resolved.
--
--    Every reference is schema/alias-qualified because the OUT parameters share
--    names with the underlying columns (institution_id, metric_code,
--    period_label, attempt_count, ungrounded_tokens) and plpgsql would
--    otherwise raise "column reference is ambiguous".
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_accreditation_narrative_capout_pending(
  p_body_code text DEFAULT 'NAAC',
  p_limit     integer DEFAULT 50)
RETURNS TABLE(
  narrative_id      uuid,
  institution_id    uuid,
  institution_name  text,
  metric_code       text,
  metric_name       text,
  period_label      text,
  attempt_count     integer,
  max_attempts      integer,
  ungrounded_tokens jsonb,
  recipient_kind    text,
  recipient_ids     uuid[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  -- Same read as fn_accreditation_narrative_awaiting, same default, so the two
  -- can never disagree about what "capped out" means.
  v_max_attempts integer := public.fn_get_policy_int('accreditation.narrative_max_draft_attempts', 5);
BEGIN
  RETURN QUERY
  WITH capped AS (
    SELECT
      n.id            AS nid,
      n.institution_id AS inst_id,
      n.body_code     AS body,
      n.metric_code   AS mcode,
      n.period_label  AS period,
      COALESCE(n.attempt_count, 0)          AS attempts,
      COALESCE(n.ungrounded_tokens, '[]'::jsonb) AS tokens,
      -- Re-resolve rather than trusting the snapshot taken at draft time: an
      -- owner assigned since the draft was recorded SHOULD get the notice.
      COALESCE(
        n.owner_user_id,
        public.fn_accreditation_resolve_metric_owner(n.institution_id, n.body_code, n.metric_code)
      ) AS owner_id
    FROM public.accreditation_metric_narratives n
    WHERE n.body_code = p_body_code
      -- The exact "this row can never advance" shape fn_accreditation_narrative_awaiting
      -- uses, plus the cap having been reached. Kept in lockstep with it on purpose.
      AND n.grounding_verdict     IS DISTINCT FROM 'grounded'
      AND n.status                 = 'ai_drafted'
      AND n.owner_okayed_at        IS NULL
      AND n.principal_approved_at  IS NULL
      AND n.director_submitted_at  IS NULL
      AND COALESCE(n.attempt_count, 0) >= v_max_attempts
      AND n.capout_notified_at     IS NULL
    ORDER BY n.updated_at ASC NULLS FIRST
    LIMIT GREATEST(1, LEAST(200, p_limit))
  ),
  -- TIER 2: the IQAC/admin queue at the narrative's own institution. This
  -- mirrors the row's RLS SELECT policy (accred_narratives_select) so a notice
  -- only ever reaches someone who can actually open the draft it points at.
  inst_queue AS (
    SELECT c.nid AS nid, array_agg(DISTINCT p.id) AS ids
    FROM capped c
    JOIN public.profiles p
      ON COALESCE(p.is_active, true)
     AND (
          (
            (COALESCE(p.is_super_admin, false) OR p.role IN ('admin','super_admin','administrator'))
            AND p.institution_id = c.inst_id
          )
          OR EXISTS (
            SELECT 1
            FROM public.user_roles ur
            JOIN public.custom_roles cr ON cr.id = ur.role_id
            WHERE ur.user_id = p.id
              AND COALESCE(cr.is_active, true)
              -- Permission keys are stored BOTH flat and nested in this table;
              -- check both or a legitimately-permissioned role reads as empty.
              AND (
                   COALESCE(cr.permissions->>'accreditation.naac.narrative.manage', 'false') = 'true'
                OR COALESCE(cr.permissions->>'accreditation.naac.narrative.view',   'false') = 'true'
                OR COALESCE(cr.permissions#>>'{accreditation,naac,narrative,manage}', 'false') = 'true'
                OR COALESCE(cr.permissions#>>'{accreditation,naac,narrative,view}',   'false') = 'true'
              )
              -- The reach half of role_has_institution_access: scope 'all',
              -- own institution, or an explicit cross-institution grant.
              AND (
                   cr.institution_scope = 'all'
                OR p.institution_id = c.inst_id
                OR EXISTS (
                     SELECT 1 FROM public.user_institution_access uia
                     WHERE uia.user_id = p.id
                       AND uia.institution_id = c.inst_id
                       AND COALESCE(uia.is_active, true)
                   )
              )
          )
        )
    GROUP BY c.nid
  ),
  -- TIER 3: the platform backstop. Only used when tier 2 is empty, which today
  -- is a real institution, not a hypothetical one.
  platform_queue AS (
    SELECT array_agg(DISTINCT p.id) AS ids
    FROM public.profiles p
    WHERE COALESCE(p.is_active, true)
      AND COALESCE(p.is_super_admin, false)
  )
  SELECT
    c.nid,
    c.inst_id,
    (SELECT i.name::text FROM public.institutions i WHERE i.id = c.inst_id),
    c.mcode,
    (SELECT m.metric_name::text
       FROM public.sh_accreditation_metrics m
      WHERE m.metric_type = c.body AND m.metric_code = c.mcode
      ORDER BY m.is_active DESC NULLS LAST, m.valid_from DESC NULLS LAST
      LIMIT 1),
    c.period,
    c.attempts,
    v_max_attempts,
    c.tokens,
    CASE
      WHEN c.owner_id IS NOT NULL                     THEN 'owner'
      WHEN COALESCE(array_length(q.ids, 1), 0) > 0    THEN 'institution_queue'
      ELSE 'platform_queue'
    END,
    CASE
      WHEN c.owner_id IS NOT NULL                     THEN ARRAY[c.owner_id]
      WHEN COALESCE(array_length(q.ids, 1), 0) > 0    THEN q.ids
      ELSE COALESCE((SELECT pq.ids FROM platform_queue pq), ARRAY[]::uuid[])
    END
  FROM capped c
  LEFT JOIN inst_queue q ON q.nid = c.nid;
END; $function$;

COMMENT ON FUNCTION public.fn_accreditation_narrative_capout_pending(text, integer) IS
  'Cap-out detector: the ungrounded, human-untouched narratives that have used their full drafting budget (accreditation.narrative_max_draft_attempts) and have not been notified yet, with recipients already resolved (owner → institution IQAC/admin queue → platform super admins). Read-only. Says nothing about whether a draft is wrong — only that the AI stopped retrying and a person must decide.';

-- ----------------------------------------------------------------------------
-- 3. The atomic claim. Returns true only for the caller that actually set it,
--    so two concurrent runners cannot both send the notice.
--    Deliberately does NOT touch updated_at: sending a notice is not an edit.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_accreditation_narrative_mark_capout_notified(
  p_narrative_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_claimed boolean;
BEGIN
  UPDATE public.accreditation_metric_narratives n
     SET capout_notified_at = now()
   WHERE n.id = p_narrative_id
     AND n.capout_notified_at IS NULL
  RETURNING true INTO v_claimed;

  RETURN COALESCE(v_claimed, false);
END; $function$;

COMMENT ON FUNCTION public.fn_accreditation_narrative_mark_capout_notified(uuid) IS
  'Claims the one-and-only cap-out notice for a narrative by stamping capout_notified_at. Returns true only when THIS call set it (WHERE capout_notified_at IS NULL), so concurrent runners cannot double-notify. Does not touch updated_at, grounding_verdict, status or attempt_count.';

-- ----------------------------------------------------------------------------
-- 4. ACLs — cron-only, matching the LIVE shape of the sibling drafter
--    functions (anon=false, authenticated=false, service_role=true, read from
--    prod 2026-07-26). These functions read across every institution and write
--    a claim flag; nothing signed in as a normal user should be able to call
--    them directly.
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_accreditation_narrative_capout_pending(text, integer)
  FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_accreditation_narrative_capout_pending(text, integer)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.fn_accreditation_narrative_mark_capout_notified(uuid)
  FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_accreditation_narrative_mark_capout_notified(uuid)
  TO service_role;

-- ----------------------------------------------------------------------------
-- 5. Apply-time asserts — fail loudly here rather than have the notice quietly
--    not exist, which is the exact failure mode this migration is fixing.
-- ----------------------------------------------------------------------------
DO $assert$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'accreditation_metric_narratives'
      AND column_name  = 'capout_notified_at'
  ) THEN
    RAISE EXCEPTION 'capout_notified_at missing — the notice cannot be made idempotent without it';
  END IF;

  IF has_function_privilege('anon', 'public.fn_accreditation_narrative_capout_pending(text,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_accreditation_narrative_mark_capout_notified(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can EXECUTE a cap-out notice function — cron-only lockdown failed';
  END IF;

  IF has_function_privilege('authenticated', 'public.fn_accreditation_narrative_capout_pending(text,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_accreditation_narrative_mark_capout_notified(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated can EXECUTE a cap-out notice function — cron-only lockdown failed';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.fn_accreditation_narrative_capout_pending(text,integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.fn_accreditation_narrative_mark_capout_notified(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role cannot EXECUTE a cap-out notice function — the notice would never fire';
  END IF;

  -- The detector must agree with the awaiting function about the cap, or a row
  -- could stop being drafted without ever becoming notice-eligible.
  IF public.fn_get_policy_int('accreditation.narrative_max_draft_attempts', -1) < 1 THEN
    RAISE EXCEPTION 'policy accreditation.narrative_max_draft_attempts is missing or < 1 — the detector has no cap to detect';
  END IF;
END $assert$;

NOTIFY pgrst, 'reload schema';
