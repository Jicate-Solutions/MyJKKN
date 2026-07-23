-- =============================================================================
-- 20260710233000_loop_registry_edges_audits.sql
-- The loop tower's missing DATA SPINE (Director, 2026-07-10 evening interview).
--
-- /admin/loops today: the Loopcraft tower is hand-coded prose and the 14 loop
-- cards are a hardcoded array in page.tsx — gates are hand-typed literals,
-- interconnections exist nowhere as data, and audit results live in one
-- person's terminal. Config-table pattern ("every policy decision = a config
-- row"): loops, their stacking tier, their gate states, their wiring, and
-- their audit history all become rows.
--
--   loop_registry — one row per loop (keys = the existing page.tsx card ids,
--                   verbatim, so chips ↔ cards anchor 1:1). gates jsonb moves
--                   the G·A·M·F truth from code literals to editable rows.
--   loop_edges    — from → to + WHAT FLOWS (measured_outcomes | decisions |
--                   fuel | escalations). is_draft=true marks inferred edges
--                   (Director: draft-and-ship, refine as one-row fixes).
--   loop_audits   — verdicts written by the /loops test harness (known-delta
--                   sims, persona walks, full moat-loop audits); the tower
--                   shows "last tested" per ring.
--
-- Consumers: /admin/loops server component (service-role reads); the /loops
-- CLI harness (service-role writes to loop_audits via Mgmt API).
-- Seeds are identity-keyed ON CONFLICT DO NOTHING — immune to the
-- mutable-column seed-resurrection class.
-- =============================================================================

-- ── 1. Tables ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.loop_registry (
  loop_key    text PRIMARY KEY,
  name        text NOT NULL,
  stack_tier  integer NOT NULL DEFAULT 3
              CHECK (stack_tier BETWEEN 1 AND 5),
  loop_class  text NOT NULL DEFAULT 'cadence'
              CHECK (loop_class IN ('self_improving','cadence','accountability','intake','infrastructure')),
  domain      text,
  description text,
  -- G·A·M·F gate states, e.g. {"g":"on","a":"on","m":"off","f":"off"}.
  -- Values mirror types.ts Gate: 'on' | 'off' | 'half'.
  gates       jsonb NOT NULL DEFAULT '{"g":"off","a":"off","m":"off","f":"off"}'::jsonb,
  routine_id  text,          -- ai_routine_schedules anchor (dispatcher), when scheduled
  owner_email text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.loop_edges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_key    text NOT NULL REFERENCES public.loop_registry(loop_key) ON DELETE CASCADE,
  to_key      text NOT NULL REFERENCES public.loop_registry(loop_key) ON DELETE CASCADE,
  what_flows  text NOT NULL
              CHECK (what_flows IN ('measured_outcomes','decisions','fuel','escalations')),
  note        text,
  is_draft    boolean NOT NULL DEFAULT false,  -- inferred, awaiting Director confirmation
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_key, to_key, what_flows)
);

CREATE TABLE IF NOT EXISTS public.loop_audits (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loop_key    text NOT NULL REFERENCES public.loop_registry(loop_key) ON DELETE CASCADE,
  audited_at  timestamptz NOT NULL DEFAULT now(),
  layer       text NOT NULL CHECK (layer IN ('sim','walk','full')),
  verdict     text NOT NULL,   -- e.g. 'measure-verified', 'mechanism-verified', 'self-reinforcing', 'sim-failed'
  evidence    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loop_audits_key_time
  ON public.loop_audits (loop_key, audited_at DESC);

-- ── 2. RLS — admin-only config surfaces; writes are service_role-only ───────

ALTER TABLE public.loop_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loop_edges    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loop_audits   ENABLE ROW LEVEL SECURITY;

-- Reads: super/admin only (system-wide governance config, no institution scope).
-- The /admin/loops page reads via service-role AFTER its own super-admin gate;
-- these policies cover any future direct authenticated reads.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname='loop_registry_select_admin') THEN
    CREATE POLICY "loop_registry_select_admin" ON public.loop_registry
      FOR SELECT USING (is_super_admin() OR is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname='loop_edges_select_admin') THEN
    CREATE POLICY "loop_edges_select_admin" ON public.loop_edges
      FOR SELECT USING (is_super_admin() OR is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname='loop_audits_select_admin') THEN
    CREATE POLICY "loop_audits_select_admin" ON public.loop_audits
      FOR SELECT USING (is_super_admin() OR is_admin());
  END IF;
END $$;
-- No INSERT/UPDATE/DELETE policies: only service_role (bypasses RLS) writes.

-- REVOKE from authenticated too: Supabase's ALTER DEFAULT PRIVILEGES grants
-- ALL on new tables to authenticated (same default-grant class as the anon
-- EXECUTE trap on functions). RLS has no write policies so writes are blocked
-- anyway, but the grant surface should say what we mean: SELECT only.
REVOKE ALL ON public.loop_registry, public.loop_edges, public.loop_audits FROM anon, authenticated, PUBLIC;
GRANT  SELECT ON public.loop_registry, public.loop_edges, public.loop_audits TO authenticated;

-- ── 3. Seed: 14 loops (page.tsx card ids verbatim) + 2 stack anchors ─────────
-- gates mirror the page's hand-typed literals as of 2026-07-10. The NEW
-- surfaces (tower chips + wiring view) read these rows; the hand-curated
-- Control Tower cards still hold their own literals for now — deriving the
-- cards from the registry is the follow-up that retires the duplication
-- (review 2026-07-10, #3: don't claim the move is complete before it is).

INSERT INTO public.loop_registry
  (loop_key, name, stack_tier, loop_class, domain, description, gates, routine_id) VALUES
  -- self-improving (G·A·M·F all on)
  ('scf',                'Session-Feedback Teaching Loop',            3, 'self_improving', 'academic',
   'Students rate understanding per class → AI coaches the facilitator → next-class lift measured → verdicts feed the next note.',
   '{"g":"on","a":"on","m":"on","f":"on"}', 'scf-generate-suggestions'),
  ('induction-session',  'Induction Session-Effectiveness Loop',      3, 'self_improving', 'induction',
   'Per-session induction feedback → effectiveness scoring → session adjustments.',
   '{"g":"on","a":"on","m":"on","f":"on"}', 'induction-session-effectiveness'),
  ('induction-playbook', 'Induction Playbook Loop',                   3, 'self_improving', 'induction',
   'Cohort join-score outcomes → next year''s induction playbook.',
   '{"g":"on","a":"on","m":"on","f":"on"}', 'induction-generate-playbook'),
  ('mess',               'Mess "Choose Your Menu" Loop',              3, 'self_improving', 'campus-living',
   'Caterer-scoped menu voting → served menus → meal ratings → next menu.',
   '{"g":"on","a":"on","m":"on","f":"on"}', NULL),
  ('feeder',             'Feeder Momentum Loop',                      3, 'self_improving', 'schools-network',
   'School visit outcomes → feeder momentum score → next visit allocation.',
   '{"g":"on","a":"on","m":"on","f":"on"}', NULL),
  -- cadence (measure/feed-forward not yet closing)
  ('ai-pulse',           'AI Pulse',                                  3, 'cadence', 'platform',
   'Daily tick → rotation → anomaly flags → weekly digest; gates ③④ landing.',
   '{"g":"on","a":"on","m":"off","f":"off"}', NULL),
  ('feedback-spine',     'Feedback Spine & intake adapters',          3, 'intake', 'platform',
   'Universal intake: session, mess, parent, IG DMs/comments → classified events for the loops.',
   '{"g":"off","a":"off","m":"off","f":"off"}', NULL),
  ('mentor-checkins',    'Senior Peer Mentor Check-in Loop',          3, 'cadence', 'induction',
   'Monthly mentor–mentee check-ins → cadence tracking.',
   '{"g":"on","a":"on","m":"off","f":"off"}', NULL),
  ('pde-quest',          'PDE Quest → Demonstration Loop',            3, 'cadence', 'pde',
   'Quests → demonstrations → capability evidence; agency bridge scores engagement.',
   '{"g":"on","a":"on","m":"off","f":"off"}', NULL),
  -- accountability (human feed-forward, dashed)
  ('decisions',          'Director Decisions Verdict',                3, 'accountability', 'governance',
   'Director decisions logged → verdict-check cron asks "did it happen?"',
   '{"g":"on","a":"on","m":"on","f":"half"}', NULL),
  ('referral-desk',      'Induction Referral → Working Desk Loop',    3, 'accountability', 'induction',
   'Induction referrals auto-route to the admissions working desk (#1887).',
   '{"g":"on","a":"on","m":"on","f":"half"}', NULL),
  ('arps',               'Accountability & pace (ARPS / YoY grid)',   3, 'accountability', 'governance',
   'YoY counselor grid → pace accountability → Director verdicts.',
   '{"g":"on","a":"on","m":"on","f":"half"}', NULL),
  ('iqac-meeting',       'IQAC Meeting Loop (Loop Review)',           3, 'accountability', 'accreditation',
   'IQAC committee meetings review the loops; minutes → evidence rollup.',
   '{"g":"on","a":"on","m":"on","f":"half"}', NULL),
  ('institutional-audit','Institutional Audit Loop (AAA)',            3, 'accountability', 'accreditation',
   'Academic & administrative audit cycles → findings → closures.',
   '{"g":"on","a":"on","m":"on","f":"half"}', NULL),
  -- stack anchors (not goal loops; give the wiring view its upper bands)
  ('metaloop',           'MetaLoop — the loop that makes loops',      4, 'infrastructure', 'platform',
   'The Control Tower + 4-gate taxonomy review: spawn, review, respawn.',
   '{"g":"on","a":"on","m":"half","f":"half"}', NULL),
  ('director',           'Director''s allocation loop',               5, 'infrastructure', 'governance',
   'Set goals, allocate, cull — decisions flow down; measured outcomes flow up.',
   '{"g":"on","a":"on","m":"half","f":"on"}', NULL)
ON CONFLICT (loop_key) DO NOTHING;

-- ── 4. Seed: edges (what flows where). is_draft=true = inferred, refine later.

INSERT INTO public.loop_edges (from_key, to_key, what_flows, note, is_draft) VALUES
  -- fuel down the intake spine
  ('feedback-spine','scf',              'fuel','Nightly adapter: marked attendance → feedback requests', false),
  ('feedback-spine','mess',             'fuel','Mess ratings intake adapter',                            false),
  ('feedback-spine','ai-pulse',         'fuel','Classified feedback signals into the Pulse tick',        true),
  -- induction chain
  ('induction-session','induction-playbook','measured_outcomes','Per-session effectiveness → next cohort''s playbook', false),
  ('induction-session','referral-desk', 'fuel','Induction referrals route to the working desk (#1887)',  false),
  ('referral-desk','decisions',         'escalations','Stalled referral desks surface to the Director',  true),
  -- pde / pulse
  ('pde-quest','ai-pulse',              'fuel','PDE bridge scores demonstration engagement into Pulse (#1931/#1933)', false),
  ('ai-pulse','director',               'escalations','Weekly digest + anomaly flags',                   true),
  -- accountability feeds
  ('mentor-checkins','decisions',       'escalations','Mentor check-in escalations',                     true),
  ('arps','decisions',                  'escalations','YoY grid feeds decisions-verdict-check',          false),
  ('iqac-meeting','institutional-audit','measured_outcomes','Meeting outcomes evidence the audit cycles', true),
  -- measured outcomes up to the MetaLoop (by construction: the Control Tower reviews these)
  ('scf','metaloop',                'measured_outcomes','Effectiveness card: lifts + verdicts (#1853)',   false),
  ('induction-session','metaloop',  'measured_outcomes','Session effectiveness scores',                   false),
  ('induction-playbook','metaloop', 'measured_outcomes','Cohort join-score deltas',                       false),
  ('mess','metaloop',               'measured_outcomes','Menu → rating deltas',                           false),
  ('feeder','metaloop',             'measured_outcomes','Momentum score movement',                        false),
  -- the top of the stack, both directions
  ('metaloop','director',           'measured_outcomes','Reviewed loops → allocation',                    false),
  ('director','metaloop',           'decisions','Fund / cull / pin decisions down the stack',             false)
ON CONFLICT (from_key, to_key, what_flows) DO NOTHING;

NOTIFY pgrst, 'reload schema';
