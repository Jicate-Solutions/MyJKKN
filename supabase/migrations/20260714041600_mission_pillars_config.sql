-- =============================================================================
-- Mission Pillars — UI-configurable mission-pillar map (edit without a deploy)
-- Added: 2026-07-14 · branch feat/mission-pillars-config
--
-- Director directive (2026-07-14): "make the pillar configurable in the UI so it
-- can be changed later in the UI." The pillar CONTENT is mid-review — that is the
-- point: it ships as editable DATA, statuses reflect the current draft, and the
-- Director edits it in the UI later without a code change or deploy.
--
-- Config-table pattern (docs/architecture/config-table-pattern.md): one row per
-- pillar, read at runtime, super-admin UI to edit. This SUPERSEDES the earlier
-- `mission_map` draft (branch feat/mission-pillar-map-configurable, unmerged),
-- which had an anon-readable SELECT policy + a public write policy — both closed
-- here (REVOKE from anon/PUBLIC; writes gated is_super_admin()/is_admin()).
--
-- TIER-1: ADDITIVE ONLY — new table + seed. Drops nothing.
-- =============================================================================

-- ── 1. Table ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mission_pillars (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pillar_key      TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL,
  anchor_quote    TEXT,
  source_url      TEXT,
  covering_loops  TEXT[]  NOT NULL DEFAULT '{}',
  coverage_status TEXT    NOT NULL DEFAULT 'gap'
                  CHECK (coverage_status IN ('covered','partial','gap','excluded')),
  display_order   INT     NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mission_pillars IS
  'UI-configurable mission-pillar map. One row per mission promise. covering_loops '
  'references loop_registry.loop_key. Edited by super-admins on /admin/loops/pillars.';

ALTER TABLE public.mission_pillars ENABLE ROW LEVEL SECURITY;

-- ── 2. RLS ───────────────────────────────────────────────────────────────────
-- Reads are harmless (renders on a super-admin surface); any authenticated user
-- may SELECT. anon is blocked at the GRANT layer below, not here.
DROP POLICY IF EXISTS mission_pillars_select ON public.mission_pillars;
CREATE POLICY mission_pillars_select ON public.mission_pillars
  FOR SELECT TO authenticated
  USING (true);

-- Writes: super-admin or admin only — matches the /admin/loops server-side gate
-- (which uses is_super_admin; there is no `admin.loops.manage` permission key).
DROP POLICY IF EXISTS mission_pillars_write ON public.mission_pillars;
CREATE POLICY mission_pillars_write ON public.mission_pillars
  FOR ALL TO authenticated
  USING (is_super_admin() OR is_admin())
  WITH CHECK (is_super_admin() OR is_admin());

-- ── 3. Grants (the twin trap) ────────────────────────────────────────────────
-- CRITICAL: anon holds the public anon key embedded in every Next.js bundle.
-- Supabase's ALTER DEFAULT PRIVILEGES grants anon EXECUTE/SELECT on new objects,
-- so an explicit REVOKE is required — a policy alone is not enough.
REVOKE ALL ON TABLE public.mission_pillars FROM anon, PUBLIC;
GRANT  SELECT, INSERT, UPDATE, DELETE ON TABLE public.mission_pillars TO authenticated;

-- ── 4. updated_at auto-touch (reuses the shared trigger fn) ───────────────────
DROP TRIGGER IF EXISTS trg_mission_pillars_updated_at ON public.mission_pillars;
CREATE TRIGGER trg_mission_pillars_updated_at
  BEFORE UPDATE ON public.mission_pillars
  FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();

-- ── 5. Seed — the CURRENT 9-pillar review state (2026-07-14) ──────────────────
-- Identity-guarded: ON CONFLICT (pillar_key) DO NOTHING. pillar_key is the stable
-- identity, so a re-run never resurrects a pillar the Director later edited or
-- soft-removed (is_active=false). Anchor quotes are verbatim from the published
-- Vision/Mission, Trust, and Home pages (see .claude/jkkn-pillar-map-draft.md).
INSERT INTO public.mission_pillars
  (pillar_key, name, anchor_quote, source_url, covering_loops, coverage_status, display_order, notes)
VALUES
  ('p1-access', 'Access for All',
   'Enabling a Platform for all… [V&M]; Providing literacy and empowering women, aiming to upgrade the socio-economic status of the community. [Trust]',
   'https://www.jkkn.ac.in/vision-and-mission',
   ARRAY['feeder']::text[], 'partial', 10,
   'Equity dimension (scholarship reach, socio-economic and gender mix vs a target) is unmeasured — feeder grows and paces intake, but no loop measures equity.'),

  ('p2-holistic', 'Holistic Learner Development',
   '…holistic learner development… [Trust]',
   'https://www.jkkn.ac.in/our-trust',
   ARRAY['induction-playbook','induction-session','referral-desk','mentor-checkins','mess']::text[], 'covered', 20,
   NULL),

  ('p3-excellence', 'Excellence in Teaching & Quality',
   'Commitment to Excellence [V&M]; providing quality education [Trust]; Excellence in Education [Home]',
   'https://www.jkkn.ac.in/vision-and-mission',
   ARRAY['scf','feedback-spine','institutional-audit','iqac-meeting','arps']::text[], 'covered', 30,
   NULL),

  ('p4-leadership', 'Dynamic Leadership',
   '…facilitating them to become Dynamic Leaders who shape the future. [V&M]',
   'https://www.jkkn.ac.in/vision-and-mission',
   ARRAY['pde-quest','mentor-checkins']::text[], 'partial', 40,
   'Agency proxy — Director marked partial 2026-07-13. pde-quest measures agency/demonstration as a proxy; there is no direct downstream leadership-outcome metric.'),

  ('p5-opportunity', 'Exponential Opportunity',
   '…to seize exponential opportunities… [V&M]',
   'https://www.jkkn.ac.in/vision-and-mission',
   ARRAY[]::text[], 'gap', 50,
   'No live loop measures opportunity capture (placements, internships, entrepreneurship, competitions). CDC competitive-exam capability exists in-app but is not a registered loop.'),

  ('p6-community', 'Community Impact',
   'aiming to upgrade the socio-economic status of the community [Trust]',
   'https://www.jkkn.ac.in/our-trust',
   ARRAY[]::text[], 'gap', 60,
   'Added to the pillar set 2026-07-14; anchored to the Trust community line. No loop measures community/societal impact.'),

  ('p7-research', 'Research & Global Innovative Solutions',
   '…fostering innovation, research… [Trust]; Vision: Leading Global Innovative Solutions provider [V&M]',
   'https://www.jkkn.ac.in/vision-and-mission',
   ARRAY[]::text[], 'gap', 70,
   'No loop measures research output, funded projects, patents, publications, or external/global solution delivery. metaloop builds internal loops but is not a research-output measure.'),

  ('p8-bioconvergence', 'Bioconvergence',
   '…through bioconvergence… [V&M]',
   'https://www.jkkn.ac.in/vision-and-mission',
   ARRAY[]::text[], 'gap', 80,
   'Needs Director''s operational definition. No loop measures interdisciplinary bio × tech × health convergence in curriculum, projects, or research.'),

  ('p9-ai-digital', 'AI & Digital Transformation',
   NULL,
   NULL,
   ARRAY['metaloop']::text[], 'partial', 90,
   'Machinery measured; promised outcomes (80% manual reduction, 30% time redeployed) not yet. [UNVERIFIED — not in the published Vision/Mission; Director to confirm as a pillar.]')
ON CONFLICT (pillar_key) DO NOTHING;
