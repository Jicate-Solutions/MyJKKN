-- ============================================================================
-- T6.1 — HR Memo Auto-Generation Substrate
-- ============================================================================
-- Per specs/hr-module-decomposition-2026-05-09.md §T6.1.
--
-- Reads from `hr.memo_and_termination_triggers` platform_policies row (seeded
-- by M6a #900) for trigger thresholds (e.g. min_lops_per_month, memo count for
-- termination). This migration is independent of that policy seed — if the
-- policy row is missing, defaults are baked into the reader RPC.
--
-- Three tables:
--   1. hr_memo_eligibility_events  — append-only log of trigger candidates
--      (cron writes events; service code resolves them to memo rows)
--   2. hr_memos                     — the actual memos shown to staff/admin
--   3. hr_memo_state_transitions    — audit trail for status changes
--
-- Standing rules honored
--   * Director non-coder + TIER-1 DDL → all NOT NULL columns enumerated below
--   * RLS enabled on all 3 tables (super_admin full, staff sees own)
--   * No staging DB — migration safe-applied to prod via Studio
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. hr_memo_eligibility_events — raw signal table
-- ---------------------------------------------------------------------------
-- Cron writes one row per detected trigger candidate. Service code reads,
-- de-duplicates, and creates hr_memos rows. Append-only.
CREATE TABLE IF NOT EXISTS public.hr_memo_eligibility_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL,                  -- staff_id from public.staff
    event_type VARCHAR(50) NOT NULL,         -- 'leave_before_approval' | 'monthly_lop_threshold' | 'unscheduled_absence' | 'manual'
    event_detail JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {leave_id, lop_count, month, ...}
    detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    detected_by_run_id UUID,                 -- correlates events from same cron tick
    processed_into_memo_id UUID,             -- set when a memo is generated from this event
    is_dismissed BOOLEAN NOT NULL DEFAULT false,
    dismissed_reason TEXT,
    dismissed_by UUID,
    dismissed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_memo_event_type CHECK (
        event_type IN ('leave_before_approval', 'monthly_lop_threshold', 'unscheduled_absence', 'manual')
    )
);

CREATE INDEX IF NOT EXISTS idx_hr_memo_events_staff ON public.hr_memo_eligibility_events(staff_id);
CREATE INDEX IF NOT EXISTS idx_hr_memo_events_type ON public.hr_memo_eligibility_events(event_type);
CREATE INDEX IF NOT EXISTS idx_hr_memo_events_unprocessed
    ON public.hr_memo_eligibility_events(detected_at)
    WHERE processed_into_memo_id IS NULL AND is_dismissed = false;
CREATE INDEX IF NOT EXISTS idx_hr_memo_events_run ON public.hr_memo_eligibility_events(detected_by_run_id);

COMMENT ON TABLE public.hr_memo_eligibility_events IS 'Append-only log of detected memo-trigger events. Cron writes, service resolves to hr_memos rows. T6.1 spec.';
COMMENT ON COLUMN public.hr_memo_eligibility_events.event_type IS 'leave_before_approval | monthly_lop_threshold | unscheduled_absence | manual';
COMMENT ON COLUMN public.hr_memo_eligibility_events.event_detail IS 'JSONB payload — varies by event_type. Always non-null (defaults {}).';

-- ---------------------------------------------------------------------------
-- 2. hr_memos — issued memos with lifecycle
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_memos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL,                    -- staff_id from public.staff
    memo_type VARCHAR(50) NOT NULL,            -- 'leave_before_approval' | 'monthly_lop_threshold' | 'unscheduled_absence' | 'manual'
    reason TEXT NOT NULL,                      -- human-readable English (what triggered + what's expected)
    triggered_by_event_id UUID REFERENCES public.hr_memo_eligibility_events(id) ON DELETE SET NULL,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    issued_by UUID,                            -- NULL when auto-issued by cron; otherwise auth user
    auto_issued BOOLEAN NOT NULL DEFAULT true, -- TRUE = cron, FALSE = HR Admin manual
    status VARCHAR(20) NOT NULL DEFAULT 'issued',  -- issued | acknowledged | disputed | resolved
    acknowledged_at TIMESTAMPTZ,
    dispute_text TEXT,                         -- staff's dispute reason
    disputed_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID,
    resolution_note TEXT,
    counts_toward_termination BOOLEAN NOT NULL DEFAULT true,  -- false if dispute upheld
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_hr_memo_type CHECK (
        memo_type IN ('leave_before_approval', 'monthly_lop_threshold', 'unscheduled_absence', 'manual')
    ),
    CONSTRAINT chk_hr_memo_status CHECK (
        status IN ('issued', 'acknowledged', 'disputed', 'resolved')
    )
);

CREATE INDEX IF NOT EXISTS idx_hr_memos_staff ON public.hr_memos(staff_id);
CREATE INDEX IF NOT EXISTS idx_hr_memos_status ON public.hr_memos(status);
CREATE INDEX IF NOT EXISTS idx_hr_memos_issued_at ON public.hr_memos(issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_memos_counts_active
    ON public.hr_memos(staff_id)
    WHERE counts_toward_termination = true;

COMMENT ON TABLE public.hr_memos IS 'Issued memos to staff (auto by cron or manual by HR Admin). T6.1 spec. Status lifecycle: issued → acknowledged | disputed → resolved.';
COMMENT ON COLUMN public.hr_memos.counts_toward_termination IS 'Per termination rule engine (T6.3): only active memos with this=true count toward the 3-memo threshold.';
COMMENT ON COLUMN public.hr_memos.auto_issued IS 'TRUE if generated by /api/cron/hr-memo-auto-detector; FALSE if HR Admin created manually.';

-- ---------------------------------------------------------------------------
-- 3. hr_memo_state_transitions — audit trail
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_memo_state_transitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memo_id UUID NOT NULL REFERENCES public.hr_memos(id) ON DELETE CASCADE,
    from_status VARCHAR(20),
    to_status VARCHAR(20) NOT NULL,
    actor_user_id UUID,
    actor_role VARCHAR(50),
    note TEXT,
    transition_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_memo_transitions_memo ON public.hr_memo_state_transitions(memo_id, transition_at DESC);

COMMENT ON TABLE public.hr_memo_state_transitions IS 'Audit log — one row per status change on hr_memos. T6.1 spec.';

-- ---------------------------------------------------------------------------
-- 4. updated_at trigger for hr_memos
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_memos_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_memos_touch ON public.hr_memos;
CREATE TRIGGER trg_hr_memos_touch
    BEFORE UPDATE ON public.hr_memos
    FOR EACH ROW EXECUTE FUNCTION public.fn_hr_memos_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 5. fn_get_hr_memo_triggers — single resolver for policy thresholds
-- ---------------------------------------------------------------------------
-- Reads `hr.memo_and_termination_triggers` from platform_policies. If the row
-- is missing (M6a not yet shipped), falls back to safe defaults baked in here.
-- The cron route + service layer ALWAYS call this function — never read the
-- policy table directly. That preserves the substrate pattern.
CREATE OR REPLACE FUNCTION public.fn_get_hr_memo_triggers()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_policy JSONB;
    v_default JSONB := jsonb_build_object(
        'leave_before_approval_enabled', true,
        'monthly_lop_threshold_count', 2,
        'monthly_lop_threshold_enabled', true,
        'unscheduled_absence_enabled', false,
        'memos_for_termination_threshold', 3
    );
BEGIN
    -- platform_policies value is JSONB
    SELECT value INTO v_policy
    FROM platform_policies
    WHERE policy_key = 'hr.memo_and_termination_triggers'
      AND scope_type = 'global'
      AND scope_id IS NULL
    LIMIT 1;

    IF v_policy IS NULL THEN
        RETURN v_default;
    END IF;

    -- Merge policy over defaults so missing keys fall back gracefully
    RETURN v_default || v_policy;
END;
$$;

COMMENT ON FUNCTION public.fn_get_hr_memo_triggers IS 'Returns the merged JSONB for hr.memo_and_termination_triggers policy. Falls back to safe defaults if M6a seed has not landed. Substrate pattern — only reader of the policy row.';

-- ---------------------------------------------------------------------------
-- 6. fn_count_active_memos_for_termination — used by termination engine (T6.3)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_count_active_memos_for_termination(p_staff_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COUNT(*)::INT
    FROM hr_memos
    WHERE staff_id = p_staff_id
      AND counts_toward_termination = true
      AND status IN ('issued', 'acknowledged');  -- 'resolved' memos may or may not count depending on resolution_note
$$;

COMMENT ON FUNCTION public.fn_count_active_memos_for_termination IS 'Returns active memo count for a staff member that count toward the termination threshold. T6.3 consumes this.';

-- ---------------------------------------------------------------------------
-- 7. RLS policies
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_memo_eligibility_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_memos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_memo_state_transitions ENABLE ROW LEVEL SECURITY;

-- super_admin / HR Admin full access — managed via the profiles.is_super_admin flag
-- and the hr_admin role check (existing convention across HR migrations).
DROP POLICY IF EXISTS p_hr_memo_events_super_admin_all ON public.hr_memo_eligibility_events;
CREATE POLICY p_hr_memo_events_super_admin_all ON public.hr_memo_eligibility_events
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND is_super_admin = true
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND is_super_admin = true
        )
    );

DROP POLICY IF EXISTS p_hr_memos_super_admin_all ON public.hr_memos;
CREATE POLICY p_hr_memos_super_admin_all ON public.hr_memos
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND is_super_admin = true
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND is_super_admin = true
        )
    );

-- Staff can read their own memos
DROP POLICY IF EXISTS p_hr_memos_staff_read_own ON public.hr_memos;
CREATE POLICY p_hr_memos_staff_read_own ON public.hr_memos
    FOR SELECT TO authenticated
    USING (
        staff_id IN (
            SELECT id FROM public.staff WHERE auth_user_id = auth.uid()
        )
    );

-- Staff can update only acknowledge/dispute on own memos (status guard at the
-- SQL layer is checked in service code; RLS just gates row visibility).
DROP POLICY IF EXISTS p_hr_memos_staff_update_own ON public.hr_memos;
CREATE POLICY p_hr_memos_staff_update_own ON public.hr_memos
    FOR UPDATE TO authenticated
    USING (
        staff_id IN (
            SELECT id FROM public.staff WHERE auth_user_id = auth.uid()
        )
    )
    WITH CHECK (
        staff_id IN (
            SELECT id FROM public.staff WHERE auth_user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS p_hr_memo_transitions_super_admin_read ON public.hr_memo_state_transitions;
CREATE POLICY p_hr_memo_transitions_super_admin_read ON public.hr_memo_state_transitions
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND is_super_admin = true
        )
    );

DROP POLICY IF EXISTS p_hr_memo_transitions_staff_read_own ON public.hr_memo_state_transitions;
CREATE POLICY p_hr_memo_transitions_staff_read_own ON public.hr_memo_state_transitions
    FOR SELECT TO authenticated
    USING (
        memo_id IN (
            SELECT id FROM public.hr_memos
            WHERE staff_id IN (
                SELECT id FROM public.staff WHERE auth_user_id = auth.uid()
            )
        )
    );

-- ---------------------------------------------------------------------------
-- 8. Smoke test — verify table creation + reader fn
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v_table_count INT;
    v_policy_result JSONB;
BEGIN
    SELECT COUNT(*) INTO v_table_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('hr_memo_eligibility_events', 'hr_memos', 'hr_memo_state_transitions');

    IF v_table_count <> 3 THEN
        RAISE EXCEPTION 'T6.1 smoke test failed: expected 3 tables, found %', v_table_count;
    END IF;

    -- Reader fn returns merged JSONB even without policy seed
    v_policy_result := fn_get_hr_memo_triggers();
    IF NOT (v_policy_result ? 'memos_for_termination_threshold') THEN
        RAISE EXCEPTION 'T6.1 smoke test failed: fn_get_hr_memo_triggers missing memos_for_termination_threshold key';
    END IF;

    RAISE NOTICE 'T6.1 smoke test passed: 3 tables created, reader fn returns %', v_policy_result;
END $$;

COMMIT;
