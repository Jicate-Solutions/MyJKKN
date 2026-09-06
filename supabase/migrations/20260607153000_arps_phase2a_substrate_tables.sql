-- Migration: 2026-06-07 15:30 IST
-- Purpose:
--   Phase 2A of the Admission Revenue Pace System (ARPS). Adds the 3 substrate
--   tables that Phase 1's pace dashboard couldn't compute without — locked
--   during the 2026-06-07 6-section Director strategy interview.
--
-- The shape of each table is driven by specific Director interview answers:
--
--   admission_cycle_revenue_target
--     Section 2 Q4: "Honestly no firm number — we're flying by feel right now"
--     ⇒ no current numbers exist; need to capture one per institution per cycle.
--     Director-chosen P&L lens: institutional total revenue.
--
--   admission_cycle_cost_baseline
--     Section 2 Q1: "you have bring all that or build into myjkkn itself"
--     ⇒ operating cost data lives outside MyJKKN today; need to capture annually.
--     The yearly anchor lets revenue-vs-cost honest projection be possible.
--
--   admission_action_log
--     Section 4 Q3: "I want this captured but haven't built it — this would be
--     a sub-project"
--     Section 6 Q1: capture trigger context + lever + outcome + reasoning notes
--     Section 6 Q2: auto-detect from existing data + Director confirm
--     Section 6 Q3: weekly Monday review cadence
--     ⇒ this is THE centerpiece of the receipt-capture-for-learning discipline.
--
-- Coordination with Boobalan's hostel-billing series (2026-06-06/07):
--   All 3 tables use the admission_* prefix to clearly scope to admission
--   module. If Boobalan later needs a broader institutional cost concept for
--   billing analytics, it should live under finance_* or mgmt_accounting_*
--   namespace — no overlap with these tables.
--
-- Phase 2B (next PR): admin forms to populate revenue_target + cost_baseline.
-- Phase 2C: auto-detect lever-pulls from existing data + Director confirm UI.
-- Phase 2D: per-year sanctioned restoration from _bak_admission_year_quota_seats.
-- Phase 2E: 4-role views (Director/Principal/Bursar/HOD-Counselor).
-- Phase 2F: weekly Monday brief generator.

-- ═══════════════════════════════════════════════════════════════════════════
-- Table 1: admission_cycle_revenue_target
-- ═══════════════════════════════════════════════════════════════════════════
-- One row per (institution, cycle_year). Director or principal sets the target
-- at year-start (Mar-Apr). System tracks actual-vs-target throughout the cycle.

CREATE TABLE IF NOT EXISTS public.admission_cycle_revenue_target (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  cycle_year int NOT NULL,
    -- e.g., 2026 = the 2026-27 admission cycle (starts April 1, 2026)
  target_admits int CHECK (target_admits IS NULL OR target_admits >= 0),
    -- intended number of admits this cycle. Often = sanctioned_intake but can
    -- diverge (aggressive target above sanctioned for waitlist, or conservative
    -- below for capacity-limited programs).
  target_yield_per_seat numeric(12, 2) CHECK (target_yield_per_seat IS NULL OR target_yield_per_seat >= 0),
    -- average tuition expected per seat AFTER expected waivers/scholarships,
    -- not the published fee. Director's Section 3 answer noted "mix —
    -- published baseline + significant negotiation" so this is the realistic
    -- yield, not the wishful one.
  derived_target_revenue numeric(14, 2) GENERATED ALWAYS AS
    (COALESCE(target_admits, 0) * COALESCE(target_yield_per_seat, 0)) STORED,
    -- auto-computed. The institutional-total-revenue anchor Director picked
    -- in Section 1 Q2.
  set_by uuid REFERENCES public.profiles(id),
  set_at timestamptz DEFAULT now(),
  notes text,
    -- free-text. e.g., "PG specialty programs underweighted in target — TN
    -- counselling timing means we'll catch up Sep-Oct."
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admission_cycle_revenue_target_unique UNIQUE (institution_id, cycle_year)
);

CREATE INDEX IF NOT EXISTS idx_admission_revenue_target_year
  ON public.admission_cycle_revenue_target (cycle_year);

COMMENT ON TABLE public.admission_cycle_revenue_target IS
  'ARPS Phase 2A: Director/principal per-institution per-cycle revenue target. Locks the "what does losing money mean" anchor. Director-locked 2026-06-07.';

-- ═══════════════════════════════════════════════════════════════════════════
-- Table 2: admission_cycle_cost_baseline
-- ═══════════════════════════════════════════════════════════════════════════
-- Bursar/Finance officer enters yearly operating cost per institution. Lets
-- the dashboard compute "are we projected to cover this institution's costs."

CREATE TABLE IF NOT EXISTS public.admission_cycle_cost_baseline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  cycle_year int NOT NULL,
  fixed_operating_cost numeric(14, 2) CHECK (fixed_operating_cost IS NULL OR fixed_operating_cost >= 0),
    -- faculty salaries + facility + admin overhead. Excludes marketing.
  marketing_budget_allocated numeric(14, 2) CHECK (marketing_budget_allocated IS NULL OR marketing_budget_allocated >= 0),
    -- cycle marketing budget. Tier 3 paid-acquisition lever pulls (from
    -- Director's Section 3 levers) draw against this.
  total_baseline_cost numeric(14, 2) GENERATED ALWAYS AS
    (COALESCE(fixed_operating_cost, 0) + COALESCE(marketing_budget_allocated, 0)) STORED,
  set_by uuid REFERENCES public.profiles(id),
  set_at timestamptz DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admission_cycle_cost_baseline_unique UNIQUE (institution_id, cycle_year)
);

CREATE INDEX IF NOT EXISTS idx_admission_cost_baseline_year
  ON public.admission_cycle_cost_baseline (cycle_year);

COMMENT ON TABLE public.admission_cycle_cost_baseline IS
  'ARPS Phase 2A: Bursar/Finance yearly cost baseline per institution. Enables real revenue-vs-cost projection. Director-locked 2026-06-07.';

-- ═══════════════════════════════════════════════════════════════════════════
-- Table 3: admission_action_log
-- ═══════════════════════════════════════════════════════════════════════════
-- The CENTERPIECE of the receipt-capture discipline. Every meaningful lever
-- pull gets a row. Trigger context auto-snapshotted. Outcome auto-captured
-- 14 days later. Reasoning notes optional.
--
-- Director's interview pattern: auto-detect + confirm (Section 6 Q2) means
-- the system can suggest rows from observed data (a scholarship awarded, a
-- counselor reassigned, a WhatsApp campaign sent) and Director marks them
-- as "intentional lever pulls" vs "just routine activity."

CREATE TABLE IF NOT EXISTS public.admission_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ─── Trigger context (auto-snapshot at trigger moment) ──────────────────
  triggered_at timestamptz NOT NULL DEFAULT now(),
  institution_id uuid REFERENCES public.institutions(id) ON DELETE CASCADE,
  program_id uuid REFERENCES public.programs(id) ON DELETE SET NULL,
    -- NULL for institution-level actions; populated for program-targeted.
  cycle_year int NOT NULL,
  trigger_day_n int NOT NULL CHECK (trigger_day_n >= 0),
    -- day-of-cycle when triggered (days since April 1 of cycle_year).
  trigger_fill_pct numeric(5, 2),
    -- snapshot of actual fill % at trigger moment.
  trigger_expected_pct numeric(5, 2),
    -- snapshot of expected pace at trigger moment.
  trigger_gap_pp numeric(5, 2),
    -- snapshot of (actual - expected). Negative = behind pace.

  -- ─── The action ─────────────────────────────────────────────────────────
  lever_tier int CHECK (lever_tier BETWEEN 1 AND 4),
    -- Director's locked escalation ladder:
    --   1 = outreach intensity (counselor reallocation, partnerships)
    --   2 = incentive structures (referrals, sibling discounts)
    --   3 = paid acquisition (ads, WhatsApp, consultants)
    --   4 = price-side (scholarships, fee waivers) — LAST RESORT, pattern risk
  lever_type text,
    -- specific lever within tier. e.g., 'counselor_reallocation',
    -- 'whatsapp_campaign_burst', 'parent_referral_activation',
    -- 'fee_waiver_negotiated', 'sibling_discount_offered'.
  lever_magnitude_text text,
    -- human-readable magnitude. e.g., "₹10K/student waiver for 5 students"
    -- or "Counselor X reassigned from B.Sc to MPHARM Pharmaceutics".
  lever_magnitude_numeric numeric(12, 2),
    -- optional structured magnitude when applicable (₹ spend, # students).
  target_program_ids uuid[],
    -- programs targeted by this action. NULL or empty = institution-wide.

  -- ─── Decision context ──────────────────────────────────────────────────
  decided_by uuid REFERENCES public.profiles(id),
    -- Director, principal, or other authority who decided this action.
  decision_reasoning text,
    -- free-text. Director-asked-for in Section 6 Q1: "I had a hunch X" /
    -- "principal Y suggested" notes. Optional but valuable for learning.
  auto_detected boolean NOT NULL DEFAULT false,
    -- TRUE if system flagged this as a lever-pull suggestion from observed
    -- data (e.g., scholarship awarded in admission_fee_structures). FALSE if
    -- Director-initiated entry. Director's Section 6 Q2 answer pattern.
  director_confirmed boolean NOT NULL DEFAULT false,
    -- TRUE once Director (or authorized user) confirms this is a real lever
    -- pull worth tracking. FALSE = pending confirmation. Suggestions stay
    -- in the log as pending until confirmed.
  director_confirmed_at timestamptz,
  director_confirmed_by uuid REFERENCES public.profiles(id),

  -- ─── Outcome (auto-captured at trigger + 14 days) ──────────────────────
  outcome_captured_at timestamptz,
  outcome_day_n int,
    -- day-of-cycle when outcome captured.
  outcome_fill_pct numeric(5, 2),
    -- actual fill % at outcome capture.
  outcome_gap_pp_at_outcome numeric(5, 2),
    -- (actual - expected) at outcome capture.
  outcome_admits_between_trigger_and_outcome int,
    -- raw admit count in the 14-day window.
  outcome_pace_closed boolean,
    -- TRUE if the gap NARROWED (improved) between trigger and outcome.
    -- Descriptive, not causal — Director's Section 4 Q4 answer was "no A/B
    -- testing" so we can't claim causation. But year-over-year aggregate
    -- patterns will still surface what tends to work.

  -- ─── Audit ─────────────────────────────────────────────────────────────
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admission_action_log_institution_cycle
  ON public.admission_action_log (institution_id, cycle_year);

CREATE INDEX IF NOT EXISTS idx_admission_action_log_outcome_pending
  ON public.admission_action_log (outcome_captured_at)
  WHERE outcome_captured_at IS NULL;
    -- Used by the Phase 2C cron that captures outcomes 14 days post-trigger.

CREATE INDEX IF NOT EXISTS idx_admission_action_log_pending_confirm
  ON public.admission_action_log (director_confirmed)
  WHERE director_confirmed = false;
    -- Used by the Director confirm-pending-suggestions UI in Phase 2C.

CREATE INDEX IF NOT EXISTS idx_admission_action_log_lever_tier_cycle
  ON public.admission_action_log (lever_tier, cycle_year);
    -- Used by year-over-year lever-effectiveness retrospective.

COMMENT ON TABLE public.admission_action_log IS
  'ARPS Phase 2A: action-log discipline. Auto-detect lever pulls + Director confirm + auto-capture outcomes at +14d. Each row is one receipt for the next year''s learning. Director-locked 2026-06-07.';

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS: enable + restrict to authenticated
-- ═══════════════════════════════════════════════════════════════════════════
-- Coarse policy for Phase 2A: only authenticated users can SELECT/INSERT.
-- Fine-grained role-based access (Director sees all, principal sees own, etc)
-- ships in Phase 2E along with the 4-role-view RPCs.

ALTER TABLE public.admission_cycle_revenue_target ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_cycle_cost_baseline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_action_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY revenue_target_authenticated_read
  ON public.admission_cycle_revenue_target
  FOR SELECT TO authenticated USING (true);

CREATE POLICY cost_baseline_authenticated_read
  ON public.admission_cycle_cost_baseline
  FOR SELECT TO authenticated USING (true);

CREATE POLICY action_log_authenticated_read
  ON public.admission_action_log
  FOR SELECT TO authenticated USING (true);

-- Write access deferred to SECURITY DEFINER RPCs in Phase 2B (admin forms)
-- and Phase 2C (auto-detect). For now no INSERT/UPDATE/DELETE policy =
-- only service_role can write.

-- ═══════════════════════════════════════════════════════════════════════════
-- Anon lockdown (per CLAUDE.md standing rule, PR #1230)
-- ═══════════════════════════════════════════════════════════════════════════
-- Even though these are TABLES (not RPCs), explicitly REVOKE from anon to
-- prevent default-grant exposure. PostgREST auto-exposes public tables.

REVOKE ALL ON TABLE public.admission_cycle_revenue_target FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.admission_cycle_cost_baseline FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.admission_action_log FROM anon, PUBLIC;

GRANT SELECT ON TABLE public.admission_cycle_revenue_target TO authenticated;
GRANT SELECT ON TABLE public.admission_cycle_cost_baseline TO authenticated;
GRANT SELECT ON TABLE public.admission_action_log TO authenticated;

-- service_role bypasses table grants but explicit GRANT makes it explicit:
GRANT ALL ON TABLE public.admission_cycle_revenue_target TO service_role;
GRANT ALL ON TABLE public.admission_cycle_cost_baseline TO service_role;
GRANT ALL ON TABLE public.admission_action_log TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- updated_at triggers (standard MyJKKN pattern)
-- ═══════════════════════════════════════════════════════════════════════════
-- Reuse the existing handle_updated_at function (per CLAUDE.md standards).

CREATE TRIGGER admission_cycle_revenue_target_updated_at
  BEFORE UPDATE ON public.admission_cycle_revenue_target
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER admission_cycle_cost_baseline_updated_at
  BEFORE UPDATE ON public.admission_cycle_cost_baseline
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER admission_action_log_updated_at
  BEFORE UPDATE ON public.admission_action_log
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
