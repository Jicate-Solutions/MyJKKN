-- ============================================================================
-- Campus Living — Auto-Allocate: CATEGORY-FIRST OVERFLOW into unreserved rooms
-- (2026-08-10)
-- ============================================================================
--
-- Full re-issue of 20260810190000. The gender handling and the signature-cache
-- body are unchanged; this adds a second placement tier. Diff the two files.
--
-- ── THE RULE ────────────────────────────────────────────────────────────────
--   Category eligibility is ABSOLUTE. Physical-room rules are a PREFERENCE.
--   When every room reserved for a learner's cohort in their eligible category
--   is full, place them in a room of that SAME category that NO rule reserves.
--   Never change their category. Never take a room reserved for another cohort.
--
--     tier 1   rooms the learner's own physical rule covers   (prior behaviour)
--     tier 2   rooms NO active rule covers                    (new, toggleable)
--     ──────   rooms reserved for any other cohort            NEVER
--
-- ── WHY THE EXISTING "STRICT" TOGGLE COULD NOT DO THIS ──────────────────────
-- fn_learner_strictly_eligible_for_room ends with `RETURN NOT v_pinned`, where
-- v_pinned = "this cohort has ANY active rule anywhere". A cohort that owns a
-- rule is therefore pinned and can NEVER take an unreserved room — in strict OR
-- non-strict mode. Verified on a live PHARMD learner: boys rooms 321/322
-- returned false for p_strict = true AND false. Turning strict off does nothing.
--
-- Reported case: all six PHARMD physical rules list Deluxe rooms 217 + 218 only
-- (BDS holds 219 + 220). Deluxe 321/322 — 16 free beds — are in no rule at all,
-- so PharmD learners were excluded while those beds sat empty. Same shape on
-- Classic. That predicate is NOT modified here: it is used elsewhere and its
-- semantics are right; the overflow tier is layered above it.
--
-- ── "UNRESERVED" MUST MIRROR THE PREDICATE'S OWN COVERAGE TEST ──────────────
-- A room is covered when an active rule in its block either lists it explicitly
-- OR — having no explicit rooms — matches its floor. `re.floor IS NULL` with no
-- attached rooms therefore covers the ENTIRE block. The tempting shortcut
-- "no row in hostel_room_eligibility_rule_rooms" is WRONG and over-counts: it
-- reports 76 free unreserved Deluxe beds in the girls blocks, when the true
-- number is 0, because every girls block carries a block-wide rule. The exact
-- v_has_covering expression is reproduced below in both functions.
--
-- Measured free beds in genuinely unreserved rooms at the time of writing:
--     boys   Classic 28 | Deluxe 16 | Premium 47 | Premium+AC 6
--     girls  ALL CATEGORIES 0  (every girls block has a block-wide rule)
-- So this migration unblocks all 13 blocked boys and changes nothing for the
-- 57 blocked girls — that is expected, and the girls rules are a separate
-- read-only investigation, not a code change.
--
-- ── ORDERING ───────────────────────────────────────────────────────────────
--     array_position(room_cats, category) → tier → block → floor → room → bed
-- Category priority sits ABOVE tier deliberately: room_cats is priority-ordered
-- entitlement, so a learner entitled to Deluxe-then-Classic gets an overflow
-- Deluxe before a rule-covered Classic. With p_allow_overflow = false the sort
-- degenerates to exactly the previous ORDER BY.
--
-- The agreed priority for any FUTURE third tier (rooms reserved for a different
-- cohort of the same department, then the same institution) is recorded here so
-- it can be added without rework. It is deliberately NOT built: the chosen
-- scope is unreserved-rooms-only, which excludes it by construction.
--
-- ============================================================================
-- 2026-08-10 REVISION — the "category is exhausted" message was FALSE
-- ============================================================================
-- Reported on the girls run: every remaining learner showed
--     "Classic Room is exhausted in every girls block — no free bed in any
--      Classic Room room, reserved or unreserved"
-- while Girls Hostel A held 17 FREE Classic beds (rooms 54=9, 7=3, 35=2, 53=3).
-- Engine and Blocks UI agreed on the count; nothing was held by pending rows.
--
-- CAUSE: `bed_available` answers "is there a free bed in a room THIS LEARNER
-- can reach (tier 1 ∪ tier 2)". The message treated a false value as the much
-- stronger claim "no such bed exists anywhere". Those 17 beds are each reserved
-- for a DIFFERENT cohort (54 → block-wide Arts&Sci/PharmD/Dental, 7 → BDS,
-- 35 → B.Pharm Sem VII/VIII, 53 → Engineering), and girls blocks contain no
-- unreserved rooms at all, so overflow cannot reach them either.
--
-- Same failure mode as the room-rule message this migration series started
-- with: a sentence that sends the operator hunting for the wrong thing. The
-- flag was right; the words were not.
--
-- FIX: `base` gains an internal column `category_free_beds_anywhere` (free beds
-- of an eligible category anywhere in the hostel type, reachability ignored),
-- and the exclusion branch splits on it — "beds exist but all are reserved for
-- other cohorts, widen a rule" vs "genuinely exhausted". The column lives in
-- `base` only, NOT in RETURNS TABLE, so the signature is unchanged and this is
-- a plain CREATE OR REPLACE: no grant loss, no PostgREST overload, no
-- TypeScript change.
--
-- Only fn_auto_allocate_candidates is re-issued. fn_auto_allocate_classic is
-- untouched: it places beds and never renders a reason, so it has no such text.
--
-- ── ORIGINAL HEADER (20260810200000) ───────────────────────────────────────
--
-- ── BUG (reported on ARISHVA K.S / AUG26CY01, B.Sc. Cyber Security) ─────────
-- The Auto-Allocate preview excluded them with
--     "No physical-room rule reserves a room for this cohort in any boys
--      block (strict mode)"
-- and a red ✗ in the Gender column. BOTH were wrong, and they were the SAME
-- bug. Measured for that learner:
--     learners_profiles.gender ... 'MALE'   (set, clean)
--     profiles.gender ............ NULL     <- the actual fault
--     strictly-eligible rooms .... 1        (Classic Room, cat_type 'boys')
-- A room rule DID reserve a room for the cohort. The operator was sent hunting
-- for a rule that already existed.
--
-- ── CAUSE 1: split brain on gender ─────────────────────────────────────────
-- This function resolved ROOM CATEGORIES from learners_profiles.gender
-- (lp_gender_type) but evaluated gender_ok / physical_rule_ok / the target
-- block from profiles.gender — the login shadow row. Nothing keeps those two
-- columns in step: there is no sync trigger in either direction. When the
-- shadow is blank the room's cat_type='boys' predicate compares against NULL
-- and matches nothing, so physical_rule_ok goes false for a reason that has
-- nothing to do with room rules.
--   learners_profiles now BACKS THE SHADOW UP:
--     lower(btrim(COALESCE(NULLIF(btrim(profiles.gender),''), lp.gender)))
--   Precedence note: profiles.gender is still read FIRST and the master record
--   only fills a blank. That ordering is deliberate — it is the zero-regression
--   choice. Verified before applying: 0 learners have a non-blank gender in both
--   tables that disagree, so precedence can only matter where the shadow is
--   blank, and there it is the difference between a value and nothing. Putting
--   the master first would have re-decided all 696 on a column this function had
--   never consulted for these checks.
--   Only 1 of 696 active hostel learners has a blank shadow today, but the
--   defect is latent for every future learner whose profile row lands without
--   one, and fn_auto_allocate_classic (the allocator that actually writes the
--   rows) reads the same column — so preview and allocator had to move
--   together or they would disagree.
--
-- ── CAUSE 2: NULL is not false ─────────────────────────────────────────────
-- gender_ok was
--     (type IS NULL OR (type='boys' AND gender IN ('male','m')) OR ...)
-- With gender NULL that is `false OR NULL OR false` = **NULL**, not false. So
--     WHEN NOT s.gender_ok THEN 'Gender does not match ...'
-- never fired (NOT NULL is NULL, and a CASE needs true), and the CASE fell
-- through to the physical-room branch — which is exactly how a missing gender
-- came to be reported as a missing room rule. gender_ok is now NULL-safe, and
-- a genuinely absent gender gets its own honest message.
--
-- profiles.gender is deliberately NOT backfilled here: UPDATE on that column
-- fires trigger_sync_user_update_webhook, which POSTs to
-- https://auth.jkkn.ai/api/auth/sync-user. Reading the master record fixes the
-- allocation path without any outbound call.
--
-- ── ORIGINAL HEADER (20260810160000) ───────────────────────────────────────
--
-- BUG (reported 2026-08-04): after 20260810150000 widened auto-allocation from
-- one block to every block of a hostel type, clicking Preview produced
--     [campus-living/allocation-batch] "previewCandidates failed" {}
-- and no table. The empty {} is a red herring — supabase-js PostgrestError
-- extends Error, and JSON.stringify(new Error(...)) is "{}", so the logger
-- swallowed the real message.
--
-- ROOT CAUSE, measured: fn_auto_allocate_candidates('girls') took 30,061 ms.
-- The `authenticated` role carries statement_timeout=8s (anon 3s), so
-- PostgREST aborted with 57014 and the page rendered nothing. Confirmed the
-- schema cache and grants were fine first — an anon POST to the RPC returned
-- 42501 (permission denied), i.e. PostgREST resolved the new signature.
--
-- Why it got so slow: the naive shape called fn_learner_strictly_eligible_for_room
-- (plpgsql, 2-3 queries per call) once per (learner x room) in three separate
-- places, and the target-bed LATERAL used ORDER BY ... LIMIT 1 — which cannot
-- short-circuit, so it evaluated the predicate over EVERY bed for EVERY
-- learner. Girls: 410 learners x 577 beds.
--
-- FIX: fn_learner_strictly_eligible_for_room reads ONLY
--     (institution_id, degree_id, department_id, program_id, semester_id)
-- off the learner — verified against its body. So its answer is identical for
-- every learner sharing that 5-tuple. The 410 girls collapse to 38 distinct
-- signatures, so eligibility is evaluated 38 x 131 rooms = ~5k times instead
-- of ~237k. Everything downstream joins that map instead of re-calling the
-- predicate.
--
-- Secondary win: the fee is now resolved ONCE per learner and handed to the
-- parametric fn_hostel_effective_{room,mess}_categories, instead of going
-- through fn_hostel_learner_{room,mess}_categories which recomputes it from
-- scratch on every call.
--
-- MEASURED, before -> after:
--     girls, all institutions ....... 30,061 ms -> 1,027 ms
--     boys,  all institutions ....... (same shape) -> 740 ms
--   Both now sit far inside the 8s budget.
--
-- EQUIVALENCE PROVEN, not assumed. Diffed the new function against the old
-- per-learner predicates over all 292 boys candidates:
--     physical_rule_ok differs ....... 0
--     bed_available differs .......... 0
--     resolved room category differs . 0
--     band fee differs ............... 0
--   and girls kept an identical verdict distribution (187/64/16 in, 143 out).
--
-- PREVIEW == GENERATE re-verified end to end in a rolled-back transaction:
--   fn_auto_allocate_classic('girls') produced one batch (block_id NULL) with
--   allocated_count = 267, spread Girls Hostel A 187 / B 64 / C 16 — matching
--   the preview's `in` count and its per-block target_block_name exactly.
--
-- MATERIALIZED is load-bearing on the shared CTEs below: without it the
-- planner inlines them and re-evaluates the predicate per learner, which is
-- precisely the cost being removed.
-- ============================================================================


-- ── 1. Preview: per-learner verdicts ───────────────────────────────────────
-- Signature identical to 20260810200000, so CREATE OR REPLACE: grants survive
-- and no second overload is created.
CREATE OR REPLACE FUNCTION public.fn_auto_allocate_candidates(
  p_hostel_type text,
  p_strict boolean DEFAULT true,
  p_institution_id uuid DEFAULT NULL::uuid,
  p_program_id uuid DEFAULT NULL::uuid,
  p_semester_id uuid DEFAULT NULL::uuid,
  p_allow_overflow boolean DEFAULT true
)
RETURNS TABLE(
  learner_id uuid, full_name text, email text, institution_name text,
  program_name text, semester_name text, gender text,
  has_profile boolean, gender_ok boolean, not_allocated boolean,
  physical_rule_ok boolean, overflow_room_ok boolean, placement_tier text,
  bed_available boolean, target_block_name text,
  academic_year_id uuid, academic_year_name text,
  admission_academic_year_id uuid, admission_academic_year_name text,
  band_academic_year_id uuid, band_academic_year_name text, band_fee numeric,
  academic_bill_count integer, current_year_bill_count integer,
  bill_other_year_name text, current_year_fee numeric,
  resolved_room_category_id uuid, resolved_room_category_name text,
  resolved_mess_category_id uuid, resolved_mess_category_name text,
  bill_state text, stage text, verdict text, exclusion_reason text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH blocks AS MATERIALIZED (
    SELECT id, name FROM hostel_blocks WHERE hostel_type::text = p_hostel_type
  ),
  scope_rooms AS MATERIALIZED (
    SELECT r.id, r.block_id, b.name AS block_name, r.floor, r.room_number,
           r.category_id, hc.type AS cat_type
    FROM hostel_rooms r
    JOIN blocks b ON b.id = r.block_id
    LEFT JOIN hostel_categories hc ON hc.id = r.category_id
    WHERE r.room_purpose = 'student'
  ),
  raw_cohort AS MATERIALIZED (
    SELECT lp.id, lp.institution_id, lp.degree_id, lp.department_id,
           lp.program_id, lp.semester_id, lp.academic_year_id, lp.quota_id,
           lp.first_name, lp.last_name,
           CASE WHEN lower(lp.gender) LIKE 'm%' THEN 'boys'
                WHEN lower(lp.gender) LIKE 'f%' THEN 'girls' END AS lp_gender_type,
           -- The one place gender is resolved. profiles.gender (the login
           -- shadow) is still read first; learners_profiles — the master record
           -- the rest of this function already trusts for lp_gender_type — only
           -- fills a blank. NULLIF, not COALESCE alone: '' is not NULL, so
           -- without it an empty-string shadow would still win over a perfectly
           -- good master value. Everything downstream reads this alias, so the
           -- category resolver and the gender/room checks can no longer
           -- disagree about the same learner.
           lower(btrim(COALESCE(NULLIF(btrim(gp.gender), ''), lp.gender))) AS eff_gender
    FROM learners_profiles lp
    LEFT JOIN profiles gp ON gp.learner_id = lp.id
    WHERE lp.accommodation_type_id IN (SELECT id FROM accommodation_types WHERE code = 'hostel')
      AND lp.lifecycle_status = 'active'
      AND lp.institution_id IN (
            SELECT bi.institution_id FROM hostel_block_institutions bi
            WHERE bi.block_id IN (SELECT id FROM blocks))
      AND (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
      AND (p_program_id     IS NULL OR lp.program_id     = p_program_id)
      AND (p_semester_id    IS NULL OR lp.semester_id    = p_semester_id)
      -- Same resolution as eff_gender above, inlined because a SELECT alias is
      -- not visible in WHERE. Reading the shadow alone put a learner with a
      -- blank profiles.gender into the permissive "unknown" branch, so they
      -- appeared in BOTH the boys and the girls preview; resolved against the
      -- master record they now appear in exactly one. The unknown branch is
      -- kept for a learner with NO gender anywhere — they must still surface,
      -- and get told so, rather than silently vanish from every run.
      AND (COALESCE(NULLIF(btrim(gp.gender), ''), NULLIF(btrim(lp.gender), '')) IS NULL
           OR (p_hostel_type = 'boys'
               AND lower(btrim(COALESCE(NULLIF(btrim(gp.gender), ''), lp.gender))) IN ('male','m'))
           OR (p_hostel_type = 'girls'
               AND lower(btrim(COALESCE(NULLIF(btrim(gp.gender), ''), lp.gender))) IN ('female','f')))
      AND NOT EXISTS (
        SELECT 1 FROM hostel_allocations ha2
        JOIN profiles pr2 ON pr2.learner_id = lp.id
        WHERE ha2.learner_id = pr2.id
          AND ha2.status IN ('active', 'pending_approval')
      )
  ),
  -- ── Overflow tier 2: rooms NO active rule covers ─────────────────────────
  -- "Unreserved" is a property of the ROOM ALONE — it does not depend on the
  -- learner — so this is evaluated ONCE per run, not per learner. That is what
  -- keeps the 8s statement_timeout safe: it adds no per-learner plpgsql calls,
  -- which is the exact cost the signature cache exists to avoid.
  --
  -- The CASE below is a verbatim copy of v_has_covering inside
  -- fn_learner_strictly_eligible_for_room. It MUST stay identical: if the two
  -- drift, a room could be "unreserved" here and "reserved" there, and the
  -- overflow would hand out a bed the predicate says belongs to someone else.
  unruled_rooms AS MATERIALIZED (
    SELECT sr.id AS room_id, sr.category_id, sr.cat_type,
           sr.block_name, sr.floor, sr.room_number
    FROM scope_rooms sr
    WHERE NOT EXISTS (
      SELECT 1 FROM hostel_room_eligibility_rules re
      WHERE re.is_active AND re.block_id = sr.block_id
        AND CASE
              WHEN EXISTS (SELECT 1 FROM hostel_room_eligibility_rule_rooms rr
                           WHERE rr.rule_id = re.id)
                THEN EXISTS (SELECT 1 FROM hostel_room_eligibility_rule_rooms rr
                             WHERE rr.rule_id = re.id AND rr.room_id = sr.id)
              ELSE (re.floor IS NULL OR re.floor = sr.floor)
            END
    )
  ),
  -- Institution access is still a HARD gate on the overflow tier: an unreserved
  -- room is only reachable by institutions the block actually serves. Costed
  -- per (distinct institution x unreserved room) — a handful of institutions,
  -- not per learner.
  overflow_rooms AS MATERIALIZED (
    SELECT i.institution_id, ur.room_id, ur.category_id, ur.cat_type,
           ur.block_name, ur.floor, ur.room_number
    FROM (SELECT DISTINCT institution_id FROM raw_cohort) i
    CROSS JOIN unruled_rooms ur
    WHERE p_allow_overflow
      AND fn_room_serves_institution(ur.room_id, i.institution_id)
  ),
  sigs AS MATERIALIZED (
    SELECT institution_id, degree_id, department_id, program_id, semester_id,
           (array_agg(id))[1] AS rep
    FROM raw_cohort
    GROUP BY 1,2,3,4,5
  ),
  sig_rooms AS MATERIALIZED (
    SELECT s.rep, sr.id AS room_id, sr.category_id, sr.cat_type,
           sr.block_name, sr.floor, sr.room_number
    FROM sigs s
    CROSS JOIN scope_rooms sr
    WHERE fn_room_serves_institution(sr.id, s.institution_id)
      AND fn_learner_strictly_eligible_for_room(s.rep, sr.id, p_strict)
  ),
  free_beds AS MATERIALIZED (
    SELECT bd.id, bd.room_id, bd.bed_number
    FROM hostel_beds bd
    JOIN scope_rooms sr ON sr.id = bd.room_id
    WHERE bd.status = 'available'
      AND NOT EXISTS (SELECT 1 FROM hostel_allocations a
                      WHERE a.bed_id = bd.id AND a.status IN ('active','pending_approval'))
  ),
  fee AS MATERIALIZED (
    SELECT c.id, adm.ay_id AS adm_ay,
           bf.academic_year_id AS band_ay, bf.academic_year_name AS band_ay_name, bf.fee
    FROM raw_cohort c
    LEFT JOIN LATERAL (SELECT fn_learner_admission_academic_year(c.id) AS ay_id) adm ON true
    LEFT JOIN LATERAL fn_learner_band_academic_fee(c.id) bf ON true
  ),
  cats AS MATERIALIZED (
    SELECT c.id,
      CASE WHEN c.institution_id IS NOT NULL AND c.program_id IS NOT NULL AND f.fee IS NOT NULL
           THEN (SELECT array_agg(category_id) FROM fn_hostel_effective_room_categories(
                   c.institution_id, c.program_id, c.quota_id, f.fee, c.lp_gender_type)) END AS room_cats,
      CASE WHEN c.institution_id IS NOT NULL AND c.program_id IS NOT NULL AND f.fee IS NOT NULL
           THEN (SELECT array_agg(category_id) FROM fn_hostel_effective_mess_categories(
                   c.institution_id, c.program_id, c.quota_id, f.fee, c.lp_gender_type)) END AS mess_cats
    FROM raw_cohort c JOIN fee f ON f.id = c.id
  ),
  base AS (
    SELECT
      c.id AS learner_id,
      COALESCE(p.full_name,
               NULLIF(btrim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), ''),
               p.email, '—') AS full_name,
      p.email, inst.name AS institution_name, prog.program_name, sem.semester_name,
      -- Was lower(trim(p.gender)) — the login shadow. Now the resolved value.
      c.eff_gender AS gender,
      (p.id IS NOT NULL) AS has_profile,
      c.academic_year_id, ay.academic_year_name,
      ct.room_cats, ct.mess_cats,
      f.adm_ay AS admission_academic_year_id,
      aay.academic_year_name::text AS admission_academic_year_name,
      f.band_ay AS band_academic_year_id,
      f.band_ay_name AS band_academic_year_name,
      f.fee AS band_fee,
      ct.room_cats[1] AS resolved_room_category_id,
      rc.name AS resolved_room_category_name, rc.type AS resolved_room_category_type,
      ct.mess_cats[1] AS resolved_mess_category_id, mc.name AS resolved_mess_category_name,
      (SELECT count(*)::int FROM billing_student_bills b
         WHERE b.student_id = c.id AND b.fee_source = 'academic'
           AND b.status NOT IN ('cancelled','superseded')) AS academic_bill_count,
      (SELECT count(*)::int FROM billing_student_bills b
         WHERE b.student_id = c.id AND b.fee_source = 'academic'
           AND b.status NOT IN ('cancelled','superseded')
           AND b.academic_year_id = c.academic_year_id) AS current_year_bill_count,
      (SELECT ay2.academic_year_name
         FROM billing_student_bills b JOIN academic_years ay2 ON ay2.id = b.academic_year_id
        WHERE b.student_id = c.id AND b.fee_source = 'academic'
          AND b.status NOT IN ('cancelled','superseded')
          AND b.academic_year_id IS NOT NULL
          AND b.academic_year_id IS DISTINCT FROM c.academic_year_id
        ORDER BY b.created_at DESC LIMIT 1) AS bill_other_year_name,
      fn_learner_current_year_academic_fee(c.id) AS current_year_fee,
      true AS not_allocated,
      EXISTS (
        SELECT 1 FROM sig_rooms sr
        WHERE sr.rep = s.rep
          AND sr.category_id = ANY(ct.room_cats)
          AND (sr.cat_type IS NULL
               OR (sr.cat_type = 'boys'  AND c.eff_gender IN ('male','m'))
               OR (sr.cat_type = 'girls' AND c.eff_gender IN ('female','f')))
      ) AS physical_rule_ok,
      EXISTS (
        SELECT 1 FROM sig_rooms sr
        WHERE sr.rep = s.rep
          AND NOT (sr.category_id = ANY(ct.room_cats))
      ) AS physical_ok_other_category,
      -- Free beds of an eligible category that exist ANYWHERE in this hostel
      -- type, ignoring whether this learner may reach them. Internal to `base`
      -- (not in RETURNS TABLE), so adding it does not change the signature.
      -- Needed because bed_available answers a NARROWER question — "is there a
      -- free bed in a room THIS learner can reach" — and the exclusion message
      -- must not report that as "the category is exhausted".
      (SELECT count(*)::int
         FROM free_beds bd2
         JOIN scope_rooms sr2 ON sr2.id = bd2.room_id
        WHERE sr2.category_id = ANY(ct.room_cats)
          AND (sr2.cat_type IS NULL
               OR (sr2.cat_type = 'boys'  AND c.eff_gender IN ('male','m'))
               OR (sr2.cat_type = 'girls' AND c.eff_gender IN ('female','f')))
      ) AS category_free_beds_anywhere,
      -- Tier 2 reachability, independent of whether a BED is free there. Kept
      -- separate from physical_rule_ok so the preview can still say truthfully
      -- whether a RULE covers them; the verdict below accepts either.
      -- overflow_rooms is already empty when p_allow_overflow is false, so this
      -- needs no extra guard.
      EXISTS (
        SELECT 1 FROM overflow_rooms orm
        WHERE orm.institution_id = c.institution_id
          AND orm.category_id = ANY(ct.room_cats)
          AND (orm.cat_type IS NULL
               OR (orm.cat_type = 'boys'  AND c.eff_gender IN ('male','m'))
               OR (orm.cat_type = 'girls' AND c.eff_gender IN ('female','f')))
      ) AS overflow_room_ok,
      (tgt.block_name IS NOT NULL) AS bed_available,
      tgt.block_name AS target_block_name,
      CASE tgt.tier WHEN 1 THEN 'rule' WHEN 2 THEN 'overflow' END AS placement_tier
    FROM raw_cohort c
    JOIN cats ct ON ct.id = c.id
    JOIN fee  f  ON f.id  = c.id
    JOIN sigs s  ON s.institution_id IS NOT DISTINCT FROM c.institution_id
                AND s.degree_id      IS NOT DISTINCT FROM c.degree_id
                AND s.department_id  IS NOT DISTINCT FROM c.department_id
                AND s.program_id     IS NOT DISTINCT FROM c.program_id
                AND s.semester_id    IS NOT DISTINCT FROM c.semester_id
    LEFT JOIN profiles p        ON p.learner_id = c.id
    LEFT JOIN institutions inst ON inst.id = c.institution_id
    LEFT JOIN programs prog     ON prog.id = c.program_id
    LEFT JOIN semesters sem     ON sem.id = c.semester_id
    LEFT JOIN academic_years ay ON ay.id = c.academic_year_id
    LEFT JOIN academic_years aay ON aay.id = f.adm_ay
    LEFT JOIN hostel_categories rc ON rc.id = ct.room_cats[1]
    LEFT JOIN mess_categories   mc ON mc.id = ct.mess_cats[1]
    -- Predicted bed across BOTH tiers, in one ordered pass. Same ORDER BY as
    -- fn_auto_allocate_classic, so this stays a real prediction.
    -- Category priority sits above tier on purpose (see header): entitlement
    -- first, then prefer a reserved room over an unreserved one within that
    -- category. With p_allow_overflow = false the UNION's second leg is empty
    -- and the sort degenerates to the previous ORDER BY exactly.
    LEFT JOIN LATERAL (
      SELECT x.block_name, x.tier
      FROM (
        SELECT sr.room_id, sr.category_id, sr.cat_type,
               sr.block_name, sr.floor, sr.room_number, 1 AS tier
        FROM sig_rooms sr
        WHERE sr.rep = s.rep
        UNION ALL
        SELECT orm.room_id, orm.category_id, orm.cat_type,
               orm.block_name, orm.floor, orm.room_number, 2
        FROM overflow_rooms orm
        WHERE orm.institution_id = c.institution_id
      ) x
      JOIN free_beds bd ON bd.room_id = x.room_id
      WHERE x.category_id = ANY(ct.room_cats)
        AND (x.cat_type IS NULL
             OR (x.cat_type = 'boys'  AND c.eff_gender IN ('male','m'))
             OR (x.cat_type = 'girls' AND c.eff_gender IN ('female','f')))
      ORDER BY array_position(ct.room_cats, x.category_id), x.tier,
               x.block_name, x.floor, x.room_number, bd.bed_number
      LIMIT 1
    ) tgt ON true
  ),
  scored AS (
    SELECT b.*,
      -- NULL-safe. Without the leading IS NOT NULL guard, an absent gender made
      -- this `false OR NULL OR false` = NULL, and every downstream
      -- `NOT gender_ok` test silently stopped matching (NOT NULL is NULL, and a
      -- CASE/WHERE needs true) — so the row fell through to the physical-room
      -- branch and blamed a room rule for a missing gender. Now it is a plain
      -- false and the dedicated branch below reports the real cause.
      (b.gender IS NOT NULL
        AND (b.resolved_room_category_type IS NULL
          OR (b.resolved_room_category_type = 'boys'  AND b.gender IN ('male','m'))
          OR (b.resolved_room_category_type = 'girls' AND b.gender IN ('female','f')))) AS gender_ok
    FROM base b
  )
  SELECT
    s.learner_id, s.full_name, s.email, s.institution_name, s.program_name, s.semester_name,
    s.gender, s.has_profile, s.gender_ok, s.not_allocated, s.physical_rule_ok,
    s.overflow_room_ok, s.placement_tier,
    s.bed_available, s.target_block_name,
    s.academic_year_id, s.academic_year_name,
    s.admission_academic_year_id, s.admission_academic_year_name,
    s.band_academic_year_id, s.band_academic_year_name, s.band_fee,
    s.academic_bill_count, s.current_year_bill_count, s.bill_other_year_name, s.current_year_fee,
    s.resolved_room_category_id, s.resolved_room_category_name,
    s.resolved_mess_category_id, s.resolved_mess_category_name,
    CASE
      WHEN s.band_fee IS NOT NULL
       AND s.band_academic_year_id IS NOT DISTINCT FROM s.admission_academic_year_id THEN 'matched'
      WHEN s.band_fee IS NOT NULL          THEN 'different_year'
      WHEN s.academic_bill_count > 0       THEN 'untagged'
      ELSE 'none'
    END AS bill_state,
    CASE
      WHEN s.band_fee  IS NULL THEN 'prerequisite'
      WHEN s.room_cats IS NULL THEN 'prerequisite'
      -- Reachability is now "a rule covers a room of their category OR an
      -- unreserved one exists", not "a rule covers one".
      WHEN NOT s.has_profile OR NOT s.gender_ok
        OR NOT (s.physical_rule_ok OR s.overflow_room_ok) OR NOT s.bed_available
                               THEN 'eligibility'
      ELSE 'ok'
    END AS stage,
    CASE
      WHEN s.band_fee  IS NULL THEN 'out'
      WHEN s.room_cats IS NULL THEN 'out'
      WHEN NOT s.has_profile OR NOT s.gender_ok
        OR NOT (s.physical_rule_ok OR s.overflow_room_ok) OR NOT s.bed_available
                               THEN 'out'
      ELSE 'in'
    END AS verdict,
    CASE
      WHEN s.band_fee IS NULL THEN
        CASE
          WHEN s.academic_bill_count = 0 THEN
            'No academic bill for this student — nothing to read a fee band from'
          ELSE
            'Academic bills exist but none is usable: either untagged to an academic year, or the tagged year totals ₹0'
        END
      WHEN s.room_cats IS NULL THEN
        'No Category-Eligibility band covers ₹'
        || to_char(s.band_fee, 'FM999,999,999')
        || ' (read from ' || COALESCE(s.band_academic_year_name, 'their admission year') || ')'
        || ' for this program / quota — add or widen a band'
      WHEN NOT s.has_profile   THEN 'No login profile'
      -- Ordered BEFORE the generic gender_ok branch: "not set" and "set but
      -- wrong" are different operator actions (fill the field vs fix the
      -- category), and this case previously reached neither branch at all.
      WHEN s.gender IS NULL    THEN
        'Gender is not set on this learner — set it on the learner profile, then re-run the preview'
      WHEN NOT s.gender_ok     THEN 'Gender does not match the resolved room category'
      WHEN NOT (s.physical_rule_ok OR s.overflow_room_ok) AND s.physical_ok_other_category THEN
        'Rooms they may occupy are a different room category than their eligible '
        || COALESCE(s.resolved_room_category_name, 'category')
        || ' — fix the reservation rooms or the Category-Eligibility band'
      WHEN NOT (s.physical_rule_ok OR s.overflow_room_ok) THEN
        CASE WHEN p_strict
          THEN 'No physical-room rule reserves a room for this cohort in any ' || p_hostel_type || ' block (strict mode)'
          ELSE 'No room they can occupy in their category — every room is reserved for other cohorts'
        END
      -- No free bed in a room THIS learner can reach. Two very different causes,
      -- and conflating them is what made the previous wording false: it claimed
      -- the category was exhausted while 17 free Classic beds sat in Girls
      -- Hostel A, every one of them reserved for a different cohort. That sent
      -- the operator looking for beds instead of at the rules.
      WHEN NOT s.bed_available THEN
        CASE
          -- Beds of their category DO exist — they just cannot reach any.
          WHEN s.category_free_beds_anywhere > 0 THEN
            COALESCE(s.resolved_room_category_name, 'Their category')
            || ': ' || s.category_free_beds_anywhere::text
            || ' free bed' || CASE WHEN s.category_free_beds_anywhere = 1 THEN '' ELSE 's' END
            || ' exist in the ' || p_hostel_type || ' blocks, but every one is in a room'
            || ' reserved for another cohort'
            || CASE WHEN p_allow_overflow
                 THEN ' and no unreserved room of this category exists — add this cohort'
                      || ' to a physical-room rule that covers one of those rooms'
                 ELSE ' (overflow is off, so unreserved rooms were not considered)'
               END
          -- Genuinely none left anywhere in this hostel type.
          ELSE
            COALESCE(s.resolved_room_category_name, 'Their category')
            || ' is exhausted in every ' || p_hostel_type
            || ' block — no free bed in any '
            || COALESCE(s.resolved_room_category_name, 'eligible')
            || ' room, reserved or unreserved'
        END
      ELSE NULL
    END AS exclusion_reason
  FROM scored s
  ORDER BY s.full_name;
$function$;


-- Grants survive CREATE OR REPLACE (no signature change), so none are re-issued.
-- fn_auto_allocate_classic is deliberately NOT re-issued here: it places beds
-- and never renders an exclusion reason, so it carries none of this text.
