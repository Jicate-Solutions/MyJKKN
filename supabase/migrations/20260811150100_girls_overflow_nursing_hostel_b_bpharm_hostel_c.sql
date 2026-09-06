-- ============================================================================
-- Campus Living — House the 43 unallocatable girls: Nursing → Girls Hostel B,
-- B.Pharm → Girls Hostel C (2026-08-11)
-- ============================================================================
--
-- ── WHAT WAS MEASURED ───────────────────────────────────────────────────────
-- 43 active hostel girls hold no allocation and fn_auto_allocate_candidates
-- returns verdict='out' for EVERY one of them, all with the same reason:
--     "Classic Room: 12 free beds exist in the girls blocks, but every one is
--      in a room reserved for another cohort"
--
--     30  JKKN College of Nursing and Research — BSC (Nursing) Sem II/IV/VI/VIII
--     13  JKKN College of Pharmacy            — BPHARM       Sem II/IV/VI
--
-- Free beds in the girls blocks (2026-08-11): 151. Not a capacity problem in
-- aggregate — a REACHABILITY problem, on two independent axes:
--
--   axis 1  CATEGORY.  Both cohorts sit in a fee band (₹0–250,000) that grants
--           Classic Room and nothing else. Classic exists in ONE block:
--           Girls Hostel A, 218 beds, 206 occupied, 12 free — and those 12 are
--           each reserved by an explicit-room rule for Dental / Engineering /
--           Arts&Sci(Self) / PharmD. Nursing's own two rules cover 22 rooms
--           with ZERO free beds; the only B.Pharm rule holding free beds is
--           scoped to Sem VII/VIII and no unallocated B.Pharm girl is in those
--           semesters.
--
--   axis 2  BLOCK ACCESS.  hostel_block_institutions links Nursing to Girls
--           Hostel A ONLY. Girls Hostel A has 13 free beds in total against 30
--           Nursing girls, so at least 17 of them could never be housed no
--           matter how the rules were rewritten. That is arithmetic, not
--           configuration.
--
-- Nothing here is an engine bug. The engine correctly refused to put a learner
-- in a category she is not entitled to, or in a block her college does not use.
--
-- ── THE DECISION (operator, 2026-08-11) ─────────────────────────────────────
-- Split the two cohorts and let them take Deluxe:
--     Nursing 30 → Girls Hostel B (54 free Deluxe beds, Dental-only until now)
--     B.Pharm 13 → Girls Hostel C (37 free Deluxe beds, Pharmacy already linked)
-- and BILL THE ROOM'S REAL CATEGORY — Deluxe ₹35,000 vs Classic ₹27,500 for
-- 2026-2027. trg_allocation_sync_learner_categories copies the room's category
-- onto learners_profiles.hostel_category_id on allocation, so the higher fee
-- follows automatically; no fee override is created here.
--
-- Classic is NOT removed from either cohort, and 20260811150000 makes
-- fn_hostel_effective_room_categories return categories cheapest-first. So a
-- learner still takes a Classic bed whenever one is reachable and only spills
-- into Deluxe when it is not. That ordering migration is a hard prerequisite:
-- without it array_position over a two-element room_cats is planner-dependent
-- and these girls could be sent to a ₹35,000 bed with a ₹27,500 one free.
--
-- ── WHY 'girls' AND NOT 'both' ON THE NEW BANDS ─────────────────────────────
-- The existing Classic rows carry hostel_type='both' (the resolver remaps the
-- boys category to its girls sibling by name). Copying that would hand Nursing
-- and B.Pharm BOYS a Deluxe entitlement they were never granted — boys blocks
-- do have Deluxe rooms with free beds. hostel_type='girls' confines the change
-- to the reported cohort. The winner tuple is (program_id, quota_ids, fee_min,
-- fee_max) and does NOT include hostel_type, so for a girl both rows belong to
-- the same winning tuple and both categories are returned; for a boy the girls
-- row is filtered out before the tuple is chosen.
--
-- ── WHY EXPLICIT ROOMS AND NOT A BLOCK-WIDE RULE ────────────────────────────
-- Girls Hostel B carries one active rule (Dental, block-wide) and Girls Hostel
-- C two (Dental + PharmD, both block-wide). A rule with floor IS NULL and no
-- attached rooms covers the ENTIRE block, so the overflow tier added in
-- 20260810200000 can reach nothing in either block. Rather than dissolve those
-- reservations, each cohort gets its own rule listing named rooms. Rooms chosen
-- are the emptiest available, so existing residents are barely mixed:
--
--   Girls Hostel B → 15, 16, 25, 29, 35, 37, 38   = 32 free beds for 30 girls
--                    (15/16/35/37/38 are completely empty; 25 holds 2 Dental
--                     residents and 29 holds 1)
--   Girls Hostel C → 25, 28, 29                   = 14 free beds for 13 girls
--                    (all three completely empty)
--
-- Rules never evict: the Dental / PharmD block-wide rules still cover these
-- rooms, so those cohorts keep their residents and can still be placed here.
-- The only thing granted is ADDITIONAL access for Nursing / B.Pharm.
--
-- Side effects on other cohorts are nil by construction:
--   - v_has_covering for these rooms was already true (block-wide rules), so
--     no room changes reserved/unreserved status and the overflow tier is
--     unaffected.
--   - v_pinned for Nursing and Pharmacy was already true (both own rules in
--     Girls Hostel A), so the non-strict fallback is unchanged.
--
-- ── STILL UNPLACEABLE AFTER THIS (1 learner, reported not fixed) ────────────
-- ABINAYA (8aa1e1e0-…), JKKN College of Arts and Science (Aided), B.Sc.
-- Zoology Sem I, is a 44th unallocated girl who does not even appear in the
-- preview. Three independent blockers, none of which may be invented here:
--     1. her institution is linked to NO girls block at all
--     2. her institution has ZERO hostel_program_eligibility rows
--     3. fn_learner_band_academic_fee returns NULL — no usable academic bill
-- (2) and (3) are billing/setup data. Fixing (1) alone would still leave her
-- excluded. Left for the operator; 20260811150200 at least makes her VISIBLE.
-- ============================================================================


-- ── 1. Nursing gains access to Girls Hostel B ───────────────────────────────
-- fn_room_serves_institution is a plain EXISTS over this table and is the ONLY
-- institution gate in the engine — there is no room-level override.
INSERT INTO hostel_block_institutions (block_id, institution_id, is_primary)
SELECT b.id, i.id, false
FROM hostel_blocks b
CROSS JOIN institutions i
WHERE b.name = 'Girls Hostel B'
  AND b.hostel_type::text = 'girls'
  AND i.name = 'JKKN College of Nursing and Research'
ON CONFLICT DO NOTHING;


-- ── 2. Deluxe entitlement for the girls of both cohorts ─────────────────────
-- Derived from the rows that resolve to Classic today rather than hardcoding a
-- band, so the new row lands on exactly the same winning tuple. Restricted to
-- Classic sources on purpose: a future band granting Premium must NOT silently
-- acquire a cheaper Deluxe sibling, because cheapest-first ordering would then
-- demote that cohort.
INSERT INTO hostel_program_eligibility (
  institution_id, program_id, quota_ids, fee_min, fee_max,
  hostel_type, room_category_id, is_active
)
SELECT e.institution_id, e.program_id, e.quota_ids, e.fee_min, e.fee_max,
       'girls', dlx.id, true
FROM hostel_program_eligibility e
JOIN institutions i    ON i.id  = e.institution_id
JOIN hostel_categories src ON src.id = e.room_category_id
LEFT JOIN programs pr  ON pr.id = e.program_id
CROSS JOIN LATERAL (
  SELECT id FROM hostel_categories WHERE name = 'Deluxe Room' AND type = 'girls' LIMIT 1
) dlx
WHERE e.is_active
  AND src.name = 'Classic Room'
  AND e.hostel_type IN ('both', 'girls')
  AND (
        (i.name = 'JKKN College of Nursing and Research' AND e.program_id IS NULL)
     OR (i.name = 'JKKN College of Pharmacy'             AND pr.program_name = 'BPHARM')
      )
  AND NOT EXISTS (
    SELECT 1 FROM hostel_program_eligibility x
    WHERE x.institution_id = e.institution_id
      AND x.program_id IS NOT DISTINCT FROM e.program_id
      AND x.quota_ids  IS NOT DISTINCT FROM e.quota_ids
      AND x.fee_min    IS NOT DISTINCT FROM e.fee_min
      AND x.fee_max    IS NOT DISTINCT FROM e.fee_max
      AND x.room_category_id = dlx.id
  );


-- ── 3. Physical-room rules ──────────────────────────────────────────────────
-- rule_name is the idempotency key: re-running attaches any missing room
-- without creating a second rule. degree_id / department_id / program_id NULL
-- and semester_ids '{}' are wildcards in fn_learner_strictly_eligible_for_room,
-- so the Nursing rule covers every Nursing girl regardless of programme or
-- semester. The B.Pharm rule names its programme so PharmD — which already has
-- a block-wide rule in Girls Hostel C — is not widened.

INSERT INTO hostel_room_eligibility_rules (
  institution_id, block_id, floor, degree_id, department_id, program_id,
  rule_name, is_active, semester_ids
)
SELECT i.id, b.id, NULL, NULL, NULL, NULL,
       'Nursing — Girls Hostel B overflow (2026-08-11)', true, '{}'::uuid[]
FROM hostel_blocks b
CROSS JOIN institutions i
WHERE b.name = 'Girls Hostel B' AND b.hostel_type::text = 'girls'
  AND i.name = 'JKKN College of Nursing and Research'
  AND NOT EXISTS (
    SELECT 1 FROM hostel_room_eligibility_rules r
    WHERE r.rule_name = 'Nursing — Girls Hostel B overflow (2026-08-11)'
  );

INSERT INTO hostel_room_eligibility_rule_rooms (rule_id, room_id)
SELECT r.id, rm.id
FROM hostel_room_eligibility_rules r
JOIN hostel_rooms rm       ON rm.block_id = r.block_id AND rm.room_purpose = 'student'
JOIN hostel_categories hc  ON hc.id = rm.category_id AND hc.name = 'Deluxe Room'
WHERE r.rule_name = 'Nursing — Girls Hostel B overflow (2026-08-11)'
  AND rm.room_number IN ('15','16','25','29','35','37','38')
ON CONFLICT DO NOTHING;

INSERT INTO hostel_room_eligibility_rules (
  institution_id, block_id, floor, degree_id, department_id, program_id,
  rule_name, is_active, semester_ids
)
SELECT i.id, b.id, NULL, NULL, NULL, pr.id,
       'B.Pharm — Girls Hostel C overflow (2026-08-11)', true, '{}'::uuid[]
FROM hostel_blocks b
CROSS JOIN institutions i
CROSS JOIN programs pr
WHERE b.name = 'Girls Hostel C' AND b.hostel_type::text = 'girls'
  AND i.name = 'JKKN College of Pharmacy'
  AND pr.program_name = 'BPHARM'
  AND NOT EXISTS (
    SELECT 1 FROM hostel_room_eligibility_rules r
    WHERE r.rule_name = 'B.Pharm — Girls Hostel C overflow (2026-08-11)'
  );

INSERT INTO hostel_room_eligibility_rule_rooms (rule_id, room_id)
SELECT r.id, rm.id
FROM hostel_room_eligibility_rules r
JOIN hostel_rooms rm       ON rm.block_id = r.block_id AND rm.room_purpose = 'student'
JOIN hostel_categories hc  ON hc.id = rm.category_id AND hc.name = 'Deluxe Room'
WHERE r.rule_name = 'B.Pharm — Girls Hostel C overflow (2026-08-11)'
  AND rm.room_number IN ('25','28','29')
ON CONFLICT DO NOTHING;
