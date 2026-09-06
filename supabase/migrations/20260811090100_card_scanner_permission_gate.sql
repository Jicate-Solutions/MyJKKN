-- Business-card scanner — open the front door, and record what humans corrected
--
-- ⚠️  NOT APPLIED. Written 2026-08-05, deliberately left unapplied: the session
--     that produced it was authorised for exactly one production write (a test
--     job row) and no migration applies. Apply consciously, after reading §2.
--
-- Version 20260811090100 sits directly above 20260811090000 (the scanner's own
-- migration) and above the repo's previous high-water mark 20260810130000.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY THIS EXISTS — a live finding, 2026-08-05
-- ═══════════════════════════════════════════════════════════════════════════
-- `contacts.card_extract` shipped with allow_rule = 'seat_owner'. That value is
-- not a role and not a permission: fn_ai_enqueue resolves it to a lookup against
-- a DIFFERENT feature's config row —
--
--     EXISTS (SELECT 1 FROM ai_model_config
--             WHERE feature_key = 'ai_query.natural_language' AND is_active
--               AND config_json->'max_lane_user_ids' ? auth.uid()::text)
--
-- so whoever holds a seat on the AI natural-language QUERY feature is exactly
-- who may scan a business card, and editing one feature's seat list silently
-- changes the other. That list currently holds ONE user (director@jkkn.ac.in).
--
-- Director decision 1 says the users are "everyone — counsellors, the whole team
-- and leadership". Proven live on 2026-08-05: the Director's own working account
-- (aieee@jkkn.ac.in) POSTed a real card to /api/contacts/card-scan and was
-- refused. It went unnoticed because all four gate proofs were enqueued from the
-- Windows box via fn_ai_enqueue_system, which skips allow_rule entirely — the
-- app path had never been exercised by a real user.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Correction capture (Director decision 15)
-- ═══════════════════════════════════════════════════════════════════════════
-- What the model produced vs what the human saved, per field, per card.
--
-- This is CAPTURE ONLY. It is the raw material for a correction-rate metric
-- (corrections per field per card style over time), and that metric is what a
-- learning loop would eventually need — but nothing here closes a loop and no
-- moat claim is earned by this table existing. It must clear the loop
-- birth-gate/charter before anyone calls it one.
CREATE TABLE IF NOT EXISTS public.contact_card_scans (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id                uuid NOT NULL REFERENCES public.ai_jobs(id) ON DELETE CASCADE,
  scanned_by            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  institution_id        uuid REFERENCES public.institutions(id) ON DELETE SET NULL,

  -- Where it landed in the shared contact book.
  networker_contact_id  text,
  save_mode             text NOT NULL DEFAULT 'created'
                          CHECK (save_mode IN ('created', 'enriched', 'no_change')),

  -- The comparison itself.
  ai_fields             jsonb NOT NULL DEFAULT '{}'::jsonb,
  final_fields          jsonb NOT NULL DEFAULT '{}'::jsonb,
  corrected_fields      text[] NOT NULL DEFAULT '{}',

  -- "Who is this?" (decision 17) and where the card was collected (decision 14).
  routed_to             text,
  event_label           text,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- One saved record per scan: pressing Save twice must not double-count a
-- correction and skew the very metric this table exists to produce.
CREATE UNIQUE INDEX IF NOT EXISTS contact_card_scans_job_uniq
  ON public.contact_card_scans (job_id);

CREATE INDEX IF NOT EXISTS contact_card_scans_scanned_by_idx
  ON public.contact_card_scans (scanned_by, created_at DESC);

ALTER TABLE public.contact_card_scans ENABLE ROW LEVEL SECURITY;

-- A scan record is personal until shared (decision 8/9: the scanner and admins
-- may edit, teammates are read-only). Reads are scoped to the scanner plus
-- admins; writes belong to the scanner alone.
DROP POLICY IF EXISTS contact_card_scans_select ON public.contact_card_scans;
CREATE POLICY contact_card_scans_select ON public.contact_card_scans
  FOR SELECT TO authenticated
  USING (
    is_super_admin() OR is_admin() OR scanned_by = auth.uid()
  );

DROP POLICY IF EXISTS contact_card_scans_insert ON public.contact_card_scans;
CREATE POLICY contact_card_scans_insert ON public.contact_card_scans
  FOR INSERT TO authenticated
  WITH CHECK (scanned_by = auth.uid());

DROP POLICY IF EXISTS contact_card_scans_update ON public.contact_card_scans;
CREATE POLICY contact_card_scans_update ON public.contact_card_scans
  FOR UPDATE TO authenticated
  USING (is_super_admin() OR is_admin() OR scanned_by = auth.uid())
  WITH CHECK (is_super_admin() OR is_admin() OR scanned_by = auth.uid());

-- Supabase's ALTER DEFAULT PRIVILEGES grants anon on every NEW table
-- independently of PUBLIC, so an explicit revoke is mandatory — omitting a
-- GRANT is not the same as denying one. Revoke the role FIRST, then the ACL is
-- what it appears to be.
REVOKE ALL ON public.contact_card_scans FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.contact_card_scans TO authenticated;

COMMENT ON TABLE public.contact_card_scans IS
  'Business-card scanner: AI-extracted vs human-confirmed fields per card (Director decision 15). Capture only — not a closed learning loop.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Replace the borrowed seat gate with a real permission
-- ═══════════════════════════════════════════════════════════════════════════
-- ROLE LIST — decided by Director interview, 2026-08-05.
--
-- Decision 1 says "everyone — counsellors, the whole team and leadership". Read
-- literally against 86 active roles that would include `student`, `parent`,
-- `guest`, `driver`, `mess_caterer` and external vendor roles, which is plainly
-- not what "the team" means. Two readings were put to the Director:
--
--   (a) outward-facing roles PLUS all `staff` and `faculty`  → 24 roles, ~800 people
--   (b) outward-facing roles ONLY                            → 22 roles, far fewer
--
-- **The Director chose (b).** Card scanning goes to the people whose job is
-- meeting outsiders. General `staff` and `faculty` are deliberately EXCLUDED:
-- a facilitator who collects a card asks a colleague with the permission, or is
-- granted it individually. Widening later is one UPDATE; un-ringing 800 people
-- who can write to the shared contact book is not.
--
-- Ordering matters: the permission is granted to roles BEFORE allow_rule is
-- switched, so there is never a moment where nobody can scan.

UPDATE public.custom_roles
   SET permissions = COALESCE(permissions, '{}'::jsonb)
                     || jsonb_build_object('meetings.contacts.scan', true),
       updated_at  = now()
 WHERE is_active
   AND role_key IN (
     -- Admissions / fairs — the original use case
     'admission', 'admission_counselor', 'admission_staff', 'expo_counselor',
     -- Careers & industry
     'cdc_coordinator', 'cdc_head',
     -- Outreach, events, partnerships
     'outreach_coordinator', 'event_coordinator', 'soi_programme_coordinator',
     -- Academic leadership
     'principal', 'vice_principal', 'registrar', 'hod',
     -- Institutional leadership
     'ceo', 'coo', 'cbo', 'cao', 'board',
     -- Administration
     'administrator', 'system_admin', 'super_admin', 'executive_admin_officer'
     -- NOT 'staff', NOT 'faculty' — Director decision 2026-08-05 (reading b).
   );

-- Now point the job type at that permission. fn_ai_enqueue's
-- `allow_rule LIKE 'permission:%'` branch calls user_has_permission() on the
-- substring, which honours multi-role OR-merging and the super-admin bypass —
-- unlike 'seat_owner', which honours neither.
--
-- NOTE ON BLAST RADIUS: 49 job types currently carry allow_rule='seat_owner',
-- i.e. almost the whole Max-lane estate is gated on ai_query.natural_language's
-- one-user seat list. Most are unaffected in practice because crons and routines
-- enqueue via fn_ai_enqueue_system, which bypasses allow_rule entirely — the gate
-- only bites features a HUMAN starts. contacts.card_extract is the first of those
-- to move off the shared seat. This changes ONLY that row; the other 48 are
-- untouched and should be reviewed separately.
--
-- max_inflight 4 → 10 (Director decision 2026-08-05): rapid-fire capture means a
-- counsellor snaps ten cards in under a minute. At 4, cards 5-10 queue client-side
-- and retry — nothing is lost, but the reader idles while photos wait. At 10 a
-- whole handful goes at once. The Windows box also serves bug triage, NAAC
-- drafting and PDE scoring; those run on DIFFERENT lanes ('max', 'max-pde'), and
-- fn_ai_claim filters by lane, so cards on 'max-cards' cannot starve them.
UPDATE public.ai_job_types
   SET allow_rule   = 'permission:meetings.contacts.scan',
       max_inflight = 10,
       updated_at   = now()
 WHERE job_type = 'contacts.card_extract';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════════════
-- BEGIN;
--   UPDATE public.ai_job_types SET allow_rule = 'seat_owner', max_inflight = 4
--    WHERE job_type = 'contacts.card_extract';
--   UPDATE public.custom_roles
--      SET permissions = permissions - 'meetings.contacts.scan'
--    WHERE permissions ? 'meetings.contacts.scan';
--   DROP TABLE IF EXISTS public.contact_card_scans;
-- COMMIT;
--
-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY AFTER APPLYING (in a SEPARATE call — the Management API wraps a whole
-- batch in ONE transaction, so verifying inside the apply proves nothing)
-- ═══════════════════════════════════════════════════════════════════════════
--   SELECT job_type, allow_rule FROM ai_job_types
--    WHERE job_type = 'contacts.card_extract';
--   SELECT count(*) FROM custom_roles
--    WHERE is_active AND permissions ? 'meetings.contacts.scan';
--   -- behaviour, not objects: sign in as a granted role and POST a card.
--   -- A green object check has certified a broken behaviour on this database
--   -- before.
