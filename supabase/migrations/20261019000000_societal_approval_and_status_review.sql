-- ============================================================================
-- Two Director decisions that 20261013000000 shipped without
-- ============================================================================
--
-- Both were decided in an interview on 2026-08-29, after 20261013000000 was
-- already written. That migration merged on 2026-08-31 carrying neither. It has
-- NOT yet reached the live database (sh_community_engagements is still absent
-- from the generated types), so this follow-up lands before anything is in use.
--
-- DECISION 1 — "Faculty record it, head approves."
--   The merged policy lets only holders of `solutions.societal.record` insert,
--   and that key was granted to roles holding `solutions.dashboard.view` — in
--   practice heads and principals. But the person who ran the community
--   programme is a faculty member. Routing every entry through one busy head is
--   where recording quietly stops happening.
--
-- DECISION 2 — "Monthly review", not a clock that moves departments by itself.
--
--   ⚠️ THIS ONE HAS A PRODUCTION RECEIPT, NOT A HYPOTHESIS.
--   On 2026-08-17 13:58 UTC `update_department_statuses()` swept ALL 44 solution
--   departments to 'dormant' in a single statement. The Cluster Academic Council
--   funnel joined on `status = 'active'` and from that moment matched nothing —
--   the Council page read 0 activated, 0 producing, 0 solutions, and stated that
--   no college had ever activated a solution department. Eight colleges' work
--   left the record because one job moved one column. See
--   20260908020000_cac_funnel_counts_ever_activated_and_dormant.sql, which
--   repaired the view by counting the EVENT (`activated_at`) instead of the
--   STATE (`status`).
--
--   That fixed the reporting. It did not disarm the sweep. This migration does:
--   the function still computes exactly what it computed before, but it now
--   RECORDS A PROPOSAL instead of writing `status`. A human applies it.
--
--   `refreshStatuses()` in department-tracker-service.ts is the only caller in
--   the repo and nothing in app/ or hooks/ reaches it, so no screen or job
--   changes behaviour today.
--
-- WHAT IS DELIBERATELY UNCHANGED: the 1-month and 3-month thresholds. The
--   Director chose a review step, not different numbers, and one change at a
--   time is how you can still tell which one did what.
-- ============================================================================

-- ── 1. Approval state on a recorded engagement ──────────────────────────────

ALTER TABLE public.sh_community_engagements
    ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending'
        CHECK (approval_status IN ('pending','approved','rejected')),
    ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS approved_at timestamptz,
    ADD COLUMN IF NOT EXISTS review_note text;

COMMENT ON COLUMN public.sh_community_engagements.approval_status IS
  'pending on submission. Only an APPROVED engagement moves the department''s '
  'activity clock — an unreviewed entry must never be able to clear a dormant '
  'flag, or the approval step is decorative.';

CREATE INDEX IF NOT EXISTS idx_sh_community_engagements_pending
    ON public.sh_community_engagements(department_id, created_at DESC)
    WHERE approval_status = 'pending';

-- ── 2. Keys: submit is wide, approve is narrow ──────────────────────────────
-- Registered in lib/constants/permissions.ts in this same PR. A key registered
-- nowhere can never be switched on in Role Management, so the feature would look
-- built and be unreachable — check-ungrantable-permissions.mjs catches that.

DO $$
DECLARE v_submit int; v_approve int;
BEGIN
  UPDATE public.custom_roles
     SET permissions = permissions || jsonb_build_object('solutions.societal.submit', true),
         updated_at = now()
   WHERE role_key IN ('faculty','staff','hod','principal','dean');
  GET DIAGNOSTICS v_submit = ROW_COUNT;

  UPDATE public.custom_roles
     SET permissions = permissions || jsonb_build_object('solutions.societal.approve', true),
         updated_at = now()
   WHERE role_key IN ('hod','principal','dean');
  GET DIAGNOSTICS v_approve = ROW_COUNT;

  RAISE NOTICE 'societal.submit granted to % role(s); societal.approve to %.', v_submit, v_approve;

  IF v_submit = 0 THEN
    RAISE EXCEPTION 'No role matched faculty/staff/hod/principal/dean — refusing to '
                    'ship a submit path nobody can use. Check role_key values first.';
  END IF;
END $$;

-- ── 3. Policies ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "sh_community_engagements_insert" ON public.sh_community_engagements;
DROP POLICY IF EXISTS "sh_community_engagements_update" ON public.sh_community_engagements;

-- Anyone who can submit may create a row, but ONLY as pending. WITH CHECK is
-- what makes "faculty cannot self-approve" a guarantee rather than a UI habit.
CREATE POLICY "sh_community_engagements_insert" ON public.sh_community_engagements
    FOR INSERT WITH CHECK (
        public.is_super_admin()
        OR public.is_admin()
        OR (
            approval_status = 'pending'
            AND (
                public.user_has_permission('solutions.societal.submit')
                OR public.user_has_permission('solutions.societal.record')
            )
            AND public.role_has_institution_access(institution_id)
        )
    );

-- Two different edits share this policy: a submitter correcting their own
-- pending entry, and an approver deciding it. USING gates who may touch the row.
CREATE POLICY "sh_community_engagements_update" ON public.sh_community_engagements
    FOR UPDATE USING (
        public.is_super_admin()
        OR public.is_admin()
        OR (
            public.user_has_permission('solutions.societal.approve')
            AND public.role_has_institution_access(institution_id)
        )
        OR (
            approval_status = 'pending'
            AND recorded_by = auth.uid()
            AND public.user_has_permission('solutions.societal.submit')
        )
    );

-- A submitter editing their own row must not be able to approve it. This trigger
-- enforces that at the table, because an RLS UPDATE policy cannot compare OLD to
-- NEW and would otherwise let the same person flip their own approval_status.
CREATE OR REPLACE FUNCTION public.guard_societal_self_approval()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
        IF NOT (public.is_super_admin() OR public.is_admin()
                OR public.user_has_permission('solutions.societal.approve')) THEN
            RAISE EXCEPTION 'Only a head of department can approve or reject a community engagement.';
        END IF;
        NEW.approved_by := auth.uid();
        NEW.approved_at := now();
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_societal_self_approval ON public.sh_community_engagements;
CREATE TRIGGER trg_guard_societal_self_approval
    BEFORE UPDATE ON public.sh_community_engagements
    FOR EACH ROW EXECUTE FUNCTION public.guard_societal_self_approval();

-- ── 4. The activity clock counts APPROVED work only ─────────────────────────
-- 20261013000000 fired this on INSERT. Under an approval flow that would let an
-- unreviewed entry clear a dormant flag, which makes the review meaningless.

DROP TRIGGER IF EXISTS trg_community_engagement_touches_dept ON public.sh_community_engagements;
CREATE TRIGGER trg_community_engagement_touches_dept
    AFTER UPDATE OF approval_status ON public.sh_community_engagements
    FOR EACH ROW
    WHEN (NEW.approval_status = 'approved' AND OLD.approval_status IS DISTINCT FROM 'approved')
    EXECUTE FUNCTION public.on_societal_activity_touch_department();

-- ── 5. The review queue ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sh_department_status_reviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    solution_department_id uuid NOT NULL
        REFERENCES public.sh_solution_departments(id) ON DELETE CASCADE,
    current_status text NOT NULL,
    proposed_status text NOT NULL CHECK (proposed_status IN ('active','at_risk','dormant')),
    months_since_activity numeric NOT NULL,
    reason text NOT NULL,
    computed_at timestamptz NOT NULL DEFAULT now(),
    decision text CHECK (decision IN ('applied','dismissed')),
    decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    decided_at timestamptz,
    decision_note text
);

COMMENT ON TABLE public.sh_department_status_reviews IS
  'One row per proposed status change. The sweep writes here; a person decides. '
  'Exists because on 2026-08-17 the sweep moved all 44 departments to dormant '
  'in one statement and eight colleges'' work vanished from the Council page.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_sh_dept_status_reviews_one_open
    ON public.sh_department_status_reviews(solution_department_id)
    WHERE decision IS NULL;

ALTER TABLE public.sh_department_status_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sh_department_status_reviews_select" ON public.sh_department_status_reviews;
DROP POLICY IF EXISTS "sh_department_status_reviews_update" ON public.sh_department_status_reviews;

CREATE POLICY "sh_department_status_reviews_select" ON public.sh_department_status_reviews
    FOR SELECT USING (
        public.is_super_admin() OR public.is_admin()
        OR public.user_has_permission('solutions.societal.view')
    );

CREATE POLICY "sh_department_status_reviews_update" ON public.sh_department_status_reviews
    FOR UPDATE USING (
        public.is_super_admin() OR public.is_admin()
        OR public.user_has_permission('solutions.societal.approve')
    );

REVOKE ALL ON TABLE public.sh_department_status_reviews FROM anon, PUBLIC;
GRANT SELECT, UPDATE ON TABLE public.sh_department_status_reviews TO authenticated;
GRANT ALL ON TABLE public.sh_department_status_reviews TO service_role;

-- ── 6. The sweep proposes; it no longer decides ─────────────────────────────

CREATE OR REPLACE FUNCTION public.update_department_statuses()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_dept RECORD;
    v_new_status TEXT;
    v_months NUMERIC;
BEGIN
    FOR v_dept IN
        SELECT sd.id, sd.status, sd.last_revenue_at, sd.last_activity_at,
               sd.activated_at, sd.department_id
        FROM public.sh_solution_departments sd
        WHERE sd.status NOT IN ('pending_approval')
    LOOP
        v_months := EXTRACT(EPOCH FROM (
                        now() - COALESCE(
                            GREATEST(v_dept.last_revenue_at, v_dept.last_activity_at),
                            v_dept.activated_at)
                    )) / (30 * 24 * 3600);

        IF    v_months >= 3 THEN v_new_status := 'dormant';
        ELSIF v_months >= 1 THEN v_new_status := 'at_risk';
        ELSE                     v_new_status := 'active';
        END IF;

        CONTINUE WHEN v_new_status = v_dept.status;

        -- The whole change is here: INSERT a proposal, never UPDATE the status.
        -- ON CONFLICT keeps one open review per department, refreshed each run,
        -- so a monthly sweep does not pile up duplicates for the same fact.
        INSERT INTO public.sh_department_status_reviews
            (solution_department_id, current_status, proposed_status,
             months_since_activity, reason)
        VALUES
            (v_dept.id, v_dept.status, v_new_status, ROUND(v_months, 1),
             ROUND(v_months, 1) || ' months without recorded activity')
        ON CONFLICT (solution_department_id) WHERE decision IS NULL
        DO UPDATE SET proposed_status = EXCLUDED.proposed_status,
                      current_status = EXCLUDED.current_status,
                      months_since_activity = EXCLUDED.months_since_activity,
                      reason = EXCLUDED.reason,
                      computed_at = now();
    END LOOP;
END;
$$;

COMMENT ON FUNCTION public.update_department_statuses() IS
  'Proposes status changes into sh_department_status_reviews. It does NOT write '
  'sh_solution_departments.status — that requires apply_department_status_review(). '
  'Changed 2026-09-02 after the 2026-08-17 sweep moved all 44 departments at once.';

CREATE OR REPLACE FUNCTION public.apply_department_status_review(
    p_review_id uuid,
    p_apply boolean,
    p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_r RECORD;
BEGIN
    IF NOT (public.is_super_admin() OR public.is_admin()
            OR public.user_has_permission('solutions.societal.approve')) THEN
        RAISE EXCEPTION 'Only a head of department can decide a status review.';
    END IF;

    SELECT * INTO v_r FROM public.sh_department_status_reviews
     WHERE id = p_review_id AND decision IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Review % not found or already decided.', p_review_id;
    END IF;

    IF p_apply THEN
        UPDATE public.sh_solution_departments
           SET status = v_r.proposed_status,
               dormant_at = CASE WHEN v_r.proposed_status = 'dormant' THEN now() ELSE dormant_at END,
               updated_at = now()
         WHERE id = v_r.solution_department_id;

        INSERT INTO public.sh_department_status_history
            (solution_department_id, previous_status, new_status, reason, changed_by, changed_at)
        VALUES
            (v_r.solution_department_id, v_r.current_status, v_r.proposed_status,
             'Monthly review: ' || v_r.reason, auth.uid(), now());
    END IF;

    UPDATE public.sh_department_status_reviews
       SET decision = CASE WHEN p_apply THEN 'applied' ELSE 'dismissed' END,
           decided_by = auth.uid(), decided_at = now(), decision_note = p_note
     WHERE id = p_review_id;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_department_status_review(uuid, boolean, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_department_status_review(uuid, boolean, text) TO authenticated;
