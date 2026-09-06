-- ============================================================================
-- Schools Network — rescue shared-name feeder schools (split by home pincode)
-- 2026-07-05
--
-- THE PROBLEM this solves
--   A handful of feeder "schools" are ONE row in the feeder panel but MANY
--   different real schools that happen to share a generic government name —
--   "G(B)HSS" (~280 learners), "G(G)HSS" (~229), "GOVERNMENT HIGHER SECONDARY
--   SCHOOL" (~190). They span towns across the state, so they can't be adopted
--   or worked as a single school. Merging them (the Tidy-duplicates tool) is
--   WRONG — these aren't spelling variants, they're genuinely distinct schools.
--
-- THE FIX
--   Each learner's own home location is on file: learners_profiles
--   .permanent_address_pin_code (~89% filled) + .permanent_address_taluk /
--   .permanent_address_district (~88%). So we SPLIT a generic feeder's learners
--   BY HOME PINCODE into candidate groups, let an admin CONFIRM a group (and
--   COMBINE several nearby pincodes into one school, since a real school draws
--   from several pincodes) into a real, adoptable `schools` row. Learners with
--   NO pincode collapse into an "unknown location" bucket for manual sorting.
--
--   This build does NOT re-point learners_profiles.last_school (out of scope +
--   risky). It (a) creates the real school row so it becomes adoptable/workable
--   and (b) records the confirmed split (which pincodes of which generic feeder
--   became which school) as the audit trail in schools_network_feeder_splits.
--
-- CANONICAL KEY — copied VERBATIM from fn_schools_network_feeders v3.6 and the
--   merge migration (20260705080000). It MUST stay byte-identical so a split's
--   generic key matches the feeder-panel key exactly. The key is idempotent
--   (canonical_key(canonical_key(x)) = canonical_key(x)), so the RPCs can accept
--   EITHER the panel display name OR the raw key and normalise to the same value.
--
-- ADMIN-ONLY — confirming creates an ORG-WIDE `schools` row (like the merge
--   tool re-groups the org-wide panel), so every RPC gates on
--   is_super_admin() OR is_admin(), mirrors the merge tool's advisory lock, and
--   carries the MANDATORY `REVOKE EXECUTE ... FROM anon, PUBLIC`.
--
-- OWNERSHIP / institution_id — the `schools` CHECK constraint
--   schools_internal_requires_institution enforces:
--     (ownership='external' AND institution_id IS NULL)
--       OR (ownership='internal' AND institution_id IS NOT NULL).
--   A rescued feeder school is an EXTERNAL community school (it FEEDS learners
--   to JKKN; it is not one of JKKN's own institutions), so the normal path is
--   ownership='external', institution_id=NULL (org-wide shared feeder, identical
--   to the adopt flow's external default). We DERIVE ownership from
--   p_institution_id so the CHECK can never be violated: NULL → external (the
--   normal case the UI sends); a real UUID → internal (institution-scoped),
--   should a caller ever attribute one to a JKKN institution.
-- ============================================================================

-- ─── 1. Confirmed-split record (audit trail) ────────────────────────────────
-- One row per confirmed split: which pincodes of which generic feeder became
-- which real school. generic_key is the canonical (alias-resolved) key of the
-- generic feeder — NOT unique (a generic feeder splits into MANY schools).
CREATE TABLE IF NOT EXISTS public.schools_network_feeder_splits (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generic_key        text NOT NULL,                 -- canonical resolved key of the generic feeder
  pincodes           text[] NOT NULL,               -- home pincodes folded into this school
  confirmed_school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  confirmed_name     text,                          -- the real school's chosen name
  district           text,
  created_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sn_feeder_split_pincodes_nonempty CHECK (cardinality(pincodes) > 0)
);

CREATE INDEX IF NOT EXISTS sn_feeder_splits_generic_key_idx
  ON public.schools_network_feeder_splits (generic_key);
CREATE INDEX IF NOT EXISTS sn_feeder_splits_school_idx
  ON public.schools_network_feeder_splits (confirmed_school_id) WHERE confirmed_school_id IS NOT NULL;

ALTER TABLE public.schools_network_feeder_splits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sn_feeder_split_select ON public.schools_network_feeder_splits;
-- Admin-only read: the split map is an admin-tool artifact (same actors as the
-- confirm RPC), matching the aliases table's admin-only SELECT policy. The
-- SECDEF RPCs read it internally regardless; this governs only the direct
-- confirmed-splits-list SELECT the UI does.
CREATE POLICY sn_feeder_split_select ON public.schools_network_feeder_splits
  FOR SELECT USING (is_super_admin() OR is_admin());
-- No INSERT/UPDATE/DELETE policy → all writes go through the SECDEF confirm /
-- unconfirm RPCs (which enforce the admin gate). anon gets nothing.
GRANT SELECT ON public.schools_network_feeder_splits TO authenticated;
REVOKE ALL ON public.schools_network_feeder_splits FROM anon;

-- ─── 2. Generic feeders worth splitting ─────────────────────────────────────
-- A generic feeder = one canonical (alias-resolved) key whose learners span
-- MANY distinct home pincodes. A genuinely-single real school draws from only a
-- few nearby pincodes; a shared generic name spans the whole state. Threshold:
-- >= 5 distinct home pincodes AND >= 20 learners (tunable). Admin-gated.
CREATE OR REPLACE FUNCTION public.fn_schools_network_list_generic_feeders()
RETURNS TABLE(school_name text, learner_count bigint, distinct_pincodes bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '20000'   -- cap the full-table scan (mirrors dupe-suggestions)
AS $$
BEGIN
  -- ADMIN-ONLY (advisory: the split tool creates org-wide schools, so its whole
  -- surface — discovery + confirm — is admin-only, like the merge tool).
  IF NOT (is_super_admin() OR is_admin()) THEN
    RAISE EXCEPTION 'permission denied — feeder split is admin-only'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT COALESCE(al.to_key, k.raw_key) AS name_norm,
           k.raw_disp,
           -- normalise pincode: strip whitespace, blank → NULL (unknown bucket)
           NULLIF(regexp_replace(btrim(coalesce(lp.permanent_address_pin_code, '')), '\s+', '', 'g'), '') AS pin
      FROM public.learners_profiles lp
      CROSS JOIN LATERAL (
        SELECT (CASE WHEN lp.last_school ~ '[^[:ascii:]]'
                  THEN regexp_replace(trim(lower(lp.last_school)), '\s+', ' ', 'g')
                  ELSE COALESCE(
                    NULLIF(regexp_replace(lower(lp.last_school), '[^a-z0-9]', '', 'g'), ''),
                    regexp_replace(trim(lower(lp.last_school)), '\s+', ' ', 'g'))
                END) AS raw_key,
               trim(lp.last_school) AS raw_disp
      ) k
      LEFT JOIN public.schools_network_feeder_aliases al ON al.from_key = k.raw_key
     WHERE lp.last_school IS NOT NULL
       AND length(trim(lp.last_school)) >= 6
       AND lower(lp.last_school) NOT LIKE '%unknown%'
       AND lower(trim(lp.last_school)) NOT IN ('nil','na','n/a','-','nothing')
  )
  SELECT mode() WITHIN GROUP (ORDER BY b.raw_disp) AS school_name,
         count(*) AS learner_count,
         count(DISTINCT b.pin) AS distinct_pincodes    -- DISTINCT ignores NULLs
    FROM base b
   GROUP BY b.name_norm
  HAVING count(DISTINCT b.pin) >= 5
     AND count(*) >= 20
   ORDER BY count(*) DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_schools_network_list_generic_feeders() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_schools_network_list_generic_feeders() TO authenticated;

-- ─── 3. Pincode candidate groups for one generic feeder ─────────────────────
-- For the generic feeder's canonical (alias-resolved) key, group its learners
-- by home pincode. town = mode of taluk (fallback city) within the pincode;
-- district = mode of district. NULL/blank pincode collapses to ONE row with
-- pincode=NULL (the 'unknown location' bucket). already_confirmed = this
-- pincode already belongs to a confirmed split for this generic key.
-- Learner set mirrors fn_schools_network_school_learners' member-key resolution
-- (primary key + everything merged into it) so the split covers merged
-- spellings too. Admin-gated; returns AGGREGATES ONLY (no learner PII).
CREATE OR REPLACE FUNCTION public.fn_schools_network_feeder_split_candidates(
  p_school_name text
)
RETURNS TABLE(
  pincode text, town text, district text,
  learner_count bigint, already_confirmed boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '20000'   -- cap the full learners_profiles scan (mirrors list_generic_feeders)
AS $$
DECLARE
  v_key     text;
  v_primary text;
BEGIN
  IF NOT (is_super_admin() OR is_admin()) THEN
    RAISE EXCEPTION 'permission denied — feeder split is admin-only'
      USING ERRCODE = '42501';
  END IF;

  -- canonical key of the requested feeder (accepts display name OR raw key —
  -- the key is idempotent), then resolve to its merge primary.
  v_key := CASE WHEN p_school_name ~ '[^[:ascii:]]'
             THEN regexp_replace(trim(lower(p_school_name)), '\s+', ' ', 'g')
             ELSE COALESCE(
               NULLIF(regexp_replace(lower(p_school_name), '[^a-z0-9]', '', 'g'), ''),
               regexp_replace(trim(lower(p_school_name)), '\s+', ' ', 'g'))
           END;
  v_primary := COALESCE(
    (SELECT to_key FROM public.schools_network_feeder_aliases WHERE from_key = v_key), v_key);

  RETURN QUERY
  WITH member_keys AS (
    SELECT v_primary AS k
    UNION
    SELECT from_key FROM public.schools_network_feeder_aliases WHERE to_key = v_primary
  ),
  roster AS (
    SELECT
      NULLIF(regexp_replace(btrim(coalesce(lp.permanent_address_pin_code, '')), '\s+', '', 'g'), '') AS pin,
      NULLIF(btrim(coalesce(lp.permanent_address_taluk, '')), '') AS taluk,
      NULLIF(btrim(coalesce(lp.permanent_address_district, '')), '') AS dist
      FROM public.learners_profiles lp
     WHERE lp.last_school IS NOT NULL
       AND length(trim(lp.last_school)) >= 6
       AND lower(lp.last_school) NOT LIKE '%unknown%'
       AND lower(trim(lp.last_school)) NOT IN ('nil','na','n/a','-','nothing')
       AND (CASE WHEN lp.last_school ~ '[^[:ascii:]]'
              THEN regexp_replace(trim(lower(lp.last_school)), '\s+', ' ', 'g')
              ELSE COALESCE(
                NULLIF(regexp_replace(lower(lp.last_school), '[^a-z0-9]', '', 'g'), ''),
                regexp_replace(trim(lower(lp.last_school)), '\s+', ' ', 'g'))
            END) IN (SELECT k FROM member_keys)
  ),
  grouped AS (
    SELECT r.pin AS pincode,
           -- town = the taluk (sub-district town area); learners_profiles has no
           -- city column, so taluk is the town-level field.
           mode() WITHIN GROUP (ORDER BY r.taluk) AS town,
           mode() WITHIN GROUP (ORDER BY r.dist) AS district,
           count(*) AS learner_count
      FROM roster r
     GROUP BY r.pin
  )
  SELECT g.pincode, g.town, g.district, g.learner_count,
         (g.pincode IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.schools_network_feeder_splits s
             WHERE s.generic_key = v_primary
               AND g.pincode = ANY(s.pincodes)
         )) AS already_confirmed
    FROM grouped g
   -- real pincodes first (by size), the 'unknown' bucket always last.
   ORDER BY (g.pincode IS NULL) ASC, g.learner_count DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_schools_network_feeder_split_candidates(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_schools_network_feeder_split_candidates(text) TO authenticated;

-- ─── 4. Confirm a split → create a real adoptable school ────────────────────
-- Admin-gated; advisory-locked (serialises confirms so two admins can't race
-- the same feeder). Creates a `schools` row (ownership DERIVED from
-- p_institution_id per the CHECK constraint — see header) and records the split.
-- Returns the new school id.
CREATE OR REPLACE FUNCTION public.fn_schools_network_confirm_split(
  p_generic_key    text,
  p_pincodes       text[],
  p_name           text,
  p_district       text,
  p_institution_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '20000'   -- cap the roster-guard learners_profiles scan run INSIDE the advisory lock
AS $$
DECLARE
  v_primary   text;
  v_ownership public.school_ownership;
  v_pincodes  text[];
  v_school_id uuid;
BEGIN
  IF NOT (is_super_admin() OR is_admin()) THEN
    RAISE EXCEPTION 'permission denied — confirming a feeder split is admin-only'
      USING ERRCODE = '42501';
  END IF;

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'a school name is required';
  END IF;
  IF p_generic_key IS NULL OR btrim(p_generic_key) = '' THEN
    RAISE EXCEPTION 'the generic feeder key is required';
  END IF;

  -- normalise the passed generic key to the canonical resolved primary (accepts
  -- display name OR raw key — idempotent), matching what the candidates fn uses
  -- for its already_confirmed check.
  v_primary := CASE WHEN p_generic_key ~ '[^[:ascii:]]'
                 THEN regexp_replace(trim(lower(p_generic_key)), '\s+', ' ', 'g')
                 ELSE COALESCE(
                   NULLIF(regexp_replace(lower(p_generic_key), '[^a-z0-9]', '', 'g'), ''),
                   regexp_replace(trim(lower(p_generic_key)), '\s+', ' ', 'g'))
               END;
  v_primary := COALESCE(
    (SELECT to_key FROM public.schools_network_feeder_aliases WHERE from_key = v_primary), v_primary);

  -- Sanitise pincodes: strip whitespace, drop blanks/dupes. The 'unknown'
  -- (NULL) bucket is NOT confirmable — a group with no real pincodes has
  -- nothing to attribute to a location, so require at least one.
  SELECT array_agg(DISTINCT p)
    INTO v_pincodes
    FROM (
      SELECT NULLIF(regexp_replace(btrim(x), '\s+', '', 'g'), '') AS p
        FROM unnest(coalesce(p_pincodes, ARRAY[]::text[])) AS x
    ) q
   WHERE q.p IS NOT NULL;
  IF v_pincodes IS NULL OR cardinality(v_pincodes) = 0 THEN
    RAISE EXCEPTION 'select at least one pincode group — the unknown-location bucket cannot be confirmed as a school';
  END IF;

  -- Serialise confirms on this generic feeder (rare admin action) so two
  -- concurrent confirms can't both claim the same pincodes.
  PERFORM pg_advisory_xact_lock(hashtext('schools_network_feeder_split:' || v_primary));

  -- (1) DOUBLE-CLAIM GUARD (the reason the lock exists): reject if ANY submitted
  -- pincode is already part of a confirmed split for this feeder. Without this,
  -- the lock serialises but enforces nothing — a replay / concurrent confirm /
  -- stale client would mint a duplicate school claiming the same pincode. (The
  -- UI already_confirmed disable is display-only.)
  IF EXISTS (
    SELECT 1 FROM public.schools_network_feeder_splits s
     WHERE s.generic_key = v_primary
       AND s.pincodes && v_pincodes          -- array overlap
  ) THEN
    RAISE EXCEPTION 'one or more selected pincodes are already part of a confirmed split for this school';
  END IF;

  -- (2) ROSTER GUARD: every submitted pincode must actually belong to THIS
  -- feeder's learners — don't mint a school + audit row for bogus pincodes.
  IF EXISTS (
    SELECT 1 FROM unnest(v_pincodes) AS want(pin)
     WHERE NOT EXISTS (
       SELECT 1 FROM public.learners_profiles lp
        WHERE NULLIF(regexp_replace(btrim(coalesce(lp.permanent_address_pin_code, '')), '\s+', '', 'g'), '') = want.pin
          AND (CASE WHEN lp.last_school ~ '[^[:ascii:]]'
                 THEN regexp_replace(trim(lower(lp.last_school)), '\s+', ' ', 'g')
                 ELSE COALESCE(
                   NULLIF(regexp_replace(lower(lp.last_school), '[^a-z0-9]', '', 'g'), ''),
                   regexp_replace(trim(lower(lp.last_school)), '\s+', ' ', 'g'))
               END) IN (
                 SELECT v_primary
                 UNION
                 SELECT from_key FROM public.schools_network_feeder_aliases WHERE to_key = v_primary)
     )
  ) THEN
    RAISE EXCEPTION 'one or more selected pincodes do not belong to this feeder';
  END IF;

  -- (3) Attributing a rescued school to a specific JKKN institution (an INTERNAL
  -- school) is super-admin-only: the Director ruling is that rescued schools are
  -- network-wide/external, so a regular (org-global) is_admin gets only the
  -- external path and CANNOT mint an internal school pointed at any institution
  -- (cross-tenant attribution). If attributed, the institution must be real.
  IF p_institution_id IS NOT NULL THEN
    IF NOT is_super_admin() THEN
      RAISE EXCEPTION 'only a super admin may attribute a rescued school to a specific institution';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.institutions i WHERE i.id = p_institution_id) THEN
      RAISE EXCEPTION 'institution not found';
    END IF;
  END IF;

  -- Derive ownership from institution to satisfy schools_internal_requires_institution.
  v_ownership := CASE WHEN p_institution_id IS NULL THEN 'external' ELSE 'internal' END;

  INSERT INTO public.schools (name, ownership, institution_id, district, status, created_by)
  VALUES (btrim(p_name), v_ownership, p_institution_id, NULLIF(btrim(coalesce(p_district, '')), ''),
          'active', auth.uid())
  RETURNING id INTO v_school_id;

  INSERT INTO public.schools_network_feeder_splits
    (generic_key, pincodes, confirmed_school_id, confirmed_name, district, created_by)
  VALUES (v_primary, v_pincodes, v_school_id, btrim(p_name),
          NULLIF(btrim(coalesce(p_district, '')), ''), auth.uid());

  RETURN v_school_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_schools_network_confirm_split(text, text[], text, text, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_schools_network_confirm_split(text, text[], text, text, uuid) TO authenticated;

-- ─── 5. Unconfirm a split (safe cleanup) ────────────────────────────────────
-- Admin-gated. Deletes the split record. Also deletes the created `schools` row
-- IFF it has NO real work attached yet (no sessions / contributions / owners) —
-- so an accidental confirm cleans up fully. If the school has already been
-- worked, we KEEP it (deleting would CASCADE-drop its sessions/contributions)
-- and only remove the split record.
CREATE OR REPLACE FUNCTION public.fn_schools_network_unconfirm_split(p_split_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_school_id uuid;
BEGIN
  IF NOT (is_super_admin() OR is_admin()) THEN
    RAISE EXCEPTION 'permission denied — undoing a feeder split is admin-only'
      USING ERRCODE = '42501';
  END IF;

  SELECT confirmed_school_id INTO v_school_id
    FROM public.schools_network_feeder_splits
   WHERE id = p_split_id;

  -- Unknown split id → real error, so the client can surface a 404/422 instead of
  -- a misleading "Split undone." for something that never existed.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'split not found';
  END IF;

  IF v_school_id IS NULL THEN
    -- split exists but its school was already deleted elsewhere (FK SET NULL) →
    -- just drop the orphaned split record.
    DELETE FROM public.schools_network_feeder_splits WHERE id = p_split_id;
    RETURN;
  END IF;

  -- Symmetric with confirm: only a super admin may undo (and delete) an INTERNAL,
  -- institution-scoped rescued school, since only a super admin could create one —
  -- a regular admin must not delete another tenant's internal school.
  IF NOT is_super_admin()
     AND EXISTS (SELECT 1 FROM public.schools s
                  WHERE s.id = v_school_id AND s.institution_id IS NOT NULL) THEN
    RAISE EXCEPTION 'only a super admin may undo a split of an institution-scoped school'
      USING ERRCODE = '42501';
  END IF;

  -- Serialise cleanup of THIS school so two concurrent unconfirms can't both
  -- act on it.
  PERFORM pg_advisory_xact_lock(hashtext('schools_network_feeder_school:' || v_school_id::text));

  -- Remove the split record first.
  DELETE FROM public.schools_network_feeder_splits WHERE id = p_split_id;

  -- Clean up the created school ONLY if it is still pristine (no field work
  -- logged). Done as a SINGLE conditional DELETE — not a separate has_work check
  -- then delete — so the NOT EXISTS is re-evaluated atomically at delete time and
  -- a row that just received real work can't be dropped through a check-then-act
  -- gap.
  -- Pristine = NO "real work" child rows. Every one of schools.id's FK children is
  -- ON DELETE CASCADE, so a missing guard here would SILENTLY cascade-delete real
  -- data — this list MUST enumerate every CASCADE child of public.schools
  -- (verified 2026-07-05: sessions, contributions, jkkn_owners, contacts,
  -- visit_assignments; feeder_splits is SET NULL and already removed above). Keep
  -- in sync if a new schools child table is added.
  DELETE FROM public.schools s
   WHERE s.id = v_school_id
     AND NOT EXISTS (SELECT 1 FROM public.school_sessions          x WHERE x.school_id = s.id)
     AND NOT EXISTS (SELECT 1 FROM public.school_contributions     x WHERE x.school_id = s.id)
     AND NOT EXISTS (SELECT 1 FROM public.school_jkkn_owners        x WHERE x.school_id = s.id)
     AND NOT EXISTS (SELECT 1 FROM public.school_contacts          x WHERE x.school_id = s.id)
     AND NOT EXISTS (SELECT 1 FROM public.school_visit_assignments x WHERE x.school_id = s.id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_schools_network_unconfirm_split(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_schools_network_unconfirm_split(uuid) TO authenticated;
