-- =====================================================================
-- Adoption loop — Migration A: feature registry, ask guard, proposals
-- Date: 2026-09-16
-- Spec: specs/2026-09-16-adoption-loop.md (rulings 3, 5, 6, 8; build step 1)
--
-- MyJKKN records no per-feature usage today. This is the record of WHAT was
-- shipped and FOR WHOM: one row per feature, labelled by the ship desk on
-- every PR card before merge ("for: <roles> · core action: <verb>").
--
--   feature_registry    what shipped, for whom, what counts as "used"
--   adoption_asks       once-per-feature-ever + 7-day-gap guard (ruling 6)
--   adoption_proposals  simplify / retrain / retire cards for the Director
--                       (ruling 8) — read by the Waiting-on-Director panel
--
-- Value lists (chain Q1): `status` and `proposed_option` are state machines
-- fixed by ruling 8, not admin-editable lists → CHECK constraints, not master
-- tables. `intended_roles` holds role keys from custom_roles ('all' = every
-- signed-in person) — the master table is custom_roles itself.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) feature_registry
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.feature_registry (
  feature_key    text PRIMARY KEY
                 CHECK (feature_key ~ '^[a-z0-9_]+(\.[a-z0-9_]+)*$'),
  title          text NOT NULL,
  module         text,
  intended_roles text[] NOT NULL DEFAULT '{}'::text[],
  core_action    text NOT NULL,
  shipped_at     timestamptz NOT NULL DEFAULT now(),
  source_pr      integer,
  -- Where usage comes from. usage_wired = false means NOBODY records this key
  -- yet: the feature is labelled but NOT measured, so it is never judged dead
  -- and its people are never asked why (critic finding, 2026-09-17).
  usage_wired         boolean NOT NULL DEFAULT false,
  -- Optional bridge to the usage log that already exists (usage_events, fed by
  -- lib/utils/track-usage.ts since 2026-02-06): events with this module
  -- (+ feature, + event_type when set) ARE the core action, and
  -- fn_adoption_sync_usage_events copies them into feature_usage.
  usage_event_module  text,
  usage_event_feature text,
  usage_event_type    text,
  -- When the bridge last pulled this feature's events. A bridged feature not
  -- pulled in 7 days is STALE: not judged dead, nobody asked (a forgotten
  -- pull must never look like abandonment).
  usage_synced_at     timestamptz,
  status         text NOT NULL DEFAULT 'live'
                 CHECK (status IN ('live', 'simplify', 'retrain', 'retired')),
  created_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.feature_registry IS
  'Adoption loop (2026-09-16): one row per shipped feature — who it is for and what counts as using it. Labelled by the ship desk on every PR card (ruling 5).';
COMMENT ON COLUMN public.feature_registry.intended_roles IS
  'Role keys from custom_roles. The single value ''all'' means every active signed-in person.';
COMMENT ON COLUMN public.feature_registry.core_action IS
  'Verb phrase: the ONE action that means the feature was used, e.g. "mark attendance".';

CREATE INDEX IF NOT EXISTS idx_feature_registry_status_shipped
  ON public.feature_registry (status, shipped_at DESC);

ALTER TABLE public.feature_registry ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.feature_registry FROM anon, PUBLIC;
GRANT SELECT ON TABLE public.feature_registry TO authenticated;
GRANT ALL    ON TABLE public.feature_registry TO service_role;

-- Read: every signed-in person (the label is not a secret; the usage is).
DROP POLICY IF EXISTS "feature_registry_select_authenticated" ON public.feature_registry;
CREATE POLICY "feature_registry_select_authenticated" ON public.feature_registry
  FOR SELECT TO authenticated USING (true);

-- Writes only through fn_adoption_register / fn_adoption_decide (SECURITY DEFINER,
-- super-admin checked in the body). No INSERT/UPDATE/DELETE policy on purpose.

-- ---------------------------------------------------------------------
-- 2) adoption_asks — the ruling-6 guard
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.adoption_asks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  feature_key     text NOT NULL REFERENCES public.feature_registry(feature_key) ON DELETE CASCADE,
  notification_id uuid,
  asked_at        timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT adoption_asks_once_per_feature UNIQUE (user_id, feature_key)
);

COMMENT ON TABLE public.adoption_asks IS
  'Adoption loop ruling 6: a person is asked "why not" at most once per feature EVER and at most once in any 7 days. The UNIQUE enforces the first; fn_adoption_ask_why enforces the second.';

CREATE INDEX IF NOT EXISTS idx_adoption_asks_user_asked
  ON public.adoption_asks (user_id, asked_at DESC);

ALTER TABLE public.adoption_asks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.adoption_asks FROM anon, PUBLIC;
GRANT SELECT ON TABLE public.adoption_asks TO authenticated;
GRANT ALL    ON TABLE public.adoption_asks TO service_role;

-- Own row or super admin only — an ordinary admin of another college may not see
-- who was asked (critic finding, 2026-09-17).
DROP POLICY IF EXISTS "adoption_asks_select_own_or_admin" ON public.adoption_asks;
DROP POLICY IF EXISTS "adoption_asks_select_own_or_super_admin" ON public.adoption_asks;
CREATE POLICY "adoption_asks_select_own_or_super_admin" ON public.adoption_asks
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_super_admin());

-- ---------------------------------------------------------------------
-- 3) adoption_proposals — ruling 8 cards
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.adoption_proposals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key      text NOT NULL REFERENCES public.feature_registry(feature_key) ON DELETE CASCADE,
  proposed_option  text NOT NULL CHECK (proposed_option IN ('simplify', 'retrain', 'retire')),
  recommendation   text,
  reasons          jsonb NOT NULL DEFAULT '{}'::jsonb,
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'decided', 'withdrawn')),
  decided_option   text CHECK (decided_option IN ('simplify', 'retrain', 'retire', 'keep')),
  decided_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at       timestamptz,
  created_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.adoption_proposals IS
  'Adoption loop ruling 8: a feature still near-zero 4 weeks in, after the why-not answers, becomes ONE card — reasons (counts per answer), the desk''s recommendation, three options. The Director taps; nothing changes until he does.';

CREATE INDEX IF NOT EXISTS idx_adoption_proposals_status_created
  ON public.adoption_proposals (status, created_at);

-- One open card per feature at a time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_adoption_proposals_one_pending
  ON public.adoption_proposals (feature_key) WHERE status = 'pending';

ALTER TABLE public.adoption_proposals ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.adoption_proposals FROM anon, PUBLIC;
GRANT SELECT ON TABLE public.adoption_proposals TO authenticated;
GRANT ALL    ON TABLE public.adoption_proposals TO service_role;

-- Cards are the Director's: super admins only (the Waiting-on-Director panel
-- reads them with the service role).
DROP POLICY IF EXISTS "adoption_proposals_select_admin" ON public.adoption_proposals;
DROP POLICY IF EXISTS "adoption_proposals_select_super_admin" ON public.adoption_proposals;
CREATE POLICY "adoption_proposals_select_super_admin" ON public.adoption_proposals
  FOR SELECT TO authenticated USING (is_super_admin());

-- ---------------------------------------------------------------------
-- 4) The loop itself, in the control tower
-- ---------------------------------------------------------------------
-- owner_email is NOT NULL on production (caught by the 2026-09-16 BEGIN…ROLLBACK
-- rehearsal, invisible on the local copy): the Director owns this loop's
-- decisions (ruling 8); the Owners panel on /admin/loops can reassign it.
INSERT INTO public.loop_registry
  (loop_key, name, stack_tier, loop_class, domain, description, gates, owner_email)
VALUES
  ('feature-adoption', 'Feature Adoption Loop', 3, 'accountability', 'platform',
   'Every shipped feature is labelled (for whom, core action) → usage is recorded per person per day → weekly share of intended users doing the core action is measured against one bar → a dead feature asks its users why (once, through the blocking gate) → still dead after 4 weeks becomes a simplify / retrain / retire card the Director decides.',
   '{"g":"on","a":"on","m":"on","f":"off"}'::jsonb,
   'director@jkkn.ac.in')
ON CONFLICT (loop_key) DO NOTHING;

-- ---------------------------------------------------------------------
-- 5) The one app-wide line (ruling 1c): daily sign-ins. Everything else
--    is labelled by the desks — no other seed (spec build step 1).
-- ---------------------------------------------------------------------
INSERT INTO public.feature_registry
  (feature_key, title, module, intended_roles, core_action, shipped_at, usage_wired)
VALUES
  ('app.login', 'MyJKKN sign-in', 'platform', '{all}'::text[], 'sign in to MyJKKN', '2026-01-01T00:00:00+05:30', true)
ON CONFLICT (feature_key) DO NOTHING;

-- ---------------------------------------------------------------------
-- 7) Off by default (same shape as the Usage Beacon switch, PR #2440).
--    While false: fn_feature_used records nothing, the usage-log bridge
--    copies nothing, and no why-not question can be sent. The pages still
--    read. Flip it on /admin/platform-policies when the Director says go.
-- ---------------------------------------------------------------------
INSERT INTO public.platform_policies
  (policy_key, scope_type, value, data_type, description,
   is_system, is_active, classification, publication_state, ui_widget, ui_category)
SELECT * FROM (VALUES
  ('adoption.loop.enabled','global','false'::jsonb,'boolean',
   'Master switch for the adoption loop (spec 2026-09-16). When true: fn_feature_used writes one feature_usage row per person per feature per day at each labelled core action, fn_adoption_sync_usage_events may copy matching usage_events into it, and fn_adoption_ask_why may send the one-tap "why not" question (must-answer notice) to intended people of a 14-day-old feature with zero use — at most once per feature ever and once per person per 7 days. When false none of that happens; /admin/adoption and /adoption still read whatever was recorded. Off by default so nothing is recorded or asked until the Director flips it.',
   true, true, 'major','published','toggle','analytics')
) v(policy_key, scope_type, value, data_type, description,
    is_system, is_active, classification, publication_state, ui_widget, ui_category)
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies p
  WHERE p.policy_key = v.policy_key AND p.scope_type = 'global');

-- ---------------------------------------------------------------------
-- 6) Who may open the principal page (/adoption): adoption.view.
--    Super admins bypass permission checks; principals get the key here.
--    (`||` on the jsonb, never jsonb_set on a maybe-missing parent.)
-- ---------------------------------------------------------------------
UPDATE public.custom_roles
SET permissions = permissions || '{"adoption.view": true}'::jsonb,
    updated_at  = now()
WHERE role_key IN ('principal', 'super_admin')
  AND COALESCE((permissions ->> 'adoption.view')::boolean, false) IS DISTINCT FROM true;
