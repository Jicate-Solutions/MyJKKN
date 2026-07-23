-- ─────────────────────────────────────────────────────────────────────────────
-- BoS Course-Scheme: why is the Programme dropdown empty for this user?
--
-- One-shot diagnostic. Walks the EXACT chain used by /api/bos/programs:
--     auth.users.id
--       → profiles.id            (role, institution_id, is_super_admin)
--       → staff.profile_id       (must be linked!)
--       → bos_members.staff_id   (is_active = true)
--       → bos_compositions       (is_active = true) ⇒ board_id
--       → bos_board_programmes   (board_id IN ..., is_active = true)
--           ⇒ programme_codes the user can see
--
-- Each CTE returns a one-row "status" plus the raw evidence. Read top-to-bottom
-- — the FIRST CTE that reports 0 rows is the broken link.
--
-- USAGE: replace the email below, then run the whole file. Re-runnable; no writes.
-- ─────────────────────────────────────────────────────────────────────────────

WITH
-- ── INPUT ────────────────────────────────────────────────────────────────────
target AS (
  SELECT 'testuser@jkkn.ac.in'::text AS email
),

-- ── Step 1: auth.users ───────────────────────────────────────────────────────
step1_auth AS (
  SELECT u.id, u.email, u.last_sign_in_at
  FROM auth.users u, target t
  WHERE u.email = t.email
),

-- ── Step 2: profiles ─────────────────────────────────────────────────────────
step2_profile AS (
  SELECT p.id, p.role, p.is_super_admin, p.institution_id, p.first_name, p.last_name
  FROM profiles p
  JOIN step1_auth a ON a.id = p.id
),

-- ── Step 3: staff (THE most common failure point) ────────────────────────────
step3_staff AS (
  SELECT s.id AS staff_id, s.profile_id, s.first_name, s.last_name,
         s.role_key, s.category_id, s.institution_id
  FROM staff s
  JOIN step2_profile p ON s.profile_id = p.id
),

-- ── Step 4: bos_members (active rows pointing at this staff) ─────────────────
step4_members AS (
  SELECT m.id AS member_id, m.composition_id, m.member_type, m.is_active,
         m.display_name, m.staff_id
  FROM bos_members m
  JOIN step3_staff s ON m.staff_id = s.staff_id
),

-- ── Step 5: bos_compositions joined to bos_members (active filter applied) ───
step5_compositions AS (
  SELECT c.id AS composition_id, c.board_id, c.institutions_id,
         c.composition_title, c.is_active AS comp_active,
         m.member_type, m.is_active AS member_active
  FROM bos_compositions c
  JOIN step4_members m ON m.composition_id = c.id
),

-- ── Step 6: bos_board_programmes for boards the user is on (active filter) ──
step6_board_programmes AS (
  SELECT bp.id, bp.board_id, bp.programme_code, bp.programme_name,
         bp.institutions_id AS bp_institutions_id, bp.is_active
  FROM bos_board_programmes bp
  WHERE bp.board_id IN (SELECT board_id FROM step5_compositions WHERE comp_active AND member_active)
),

-- ── Summary: which step is empty? ────────────────────────────────────────────
summary AS (
  SELECT
    (SELECT count(*) FROM step1_auth)             AS step1_auth_users,
    (SELECT count(*) FROM step2_profile)          AS step2_profiles,
    (SELECT count(*) FROM step3_staff)            AS step3_staff_linked,
    (SELECT count(*) FROM step4_members)          AS step4_bos_members_rows,
    (SELECT count(*) FROM step4_members WHERE is_active) AS step4_bos_members_active,
    (SELECT count(*) FROM step5_compositions WHERE comp_active AND member_active) AS step5_active_compositions,
    (SELECT count(*) FROM step6_board_programmes WHERE is_active) AS step6_visible_programmes
)

-- Pick what you want to inspect (uncomment one at a time):

SELECT '── SUMMARY: first 0 is your broken link ──' AS readme, * FROM summary;
-- SELECT 'step1_auth'        AS what, * FROM step1_auth;
-- SELECT 'step2_profile'     AS what, * FROM step2_profile;
-- SELECT 'step3_staff'       AS what, * FROM step3_staff;
-- SELECT 'step4_members'     AS what, * FROM step4_members;
-- SELECT 'step5_compositions' AS what, * FROM step5_compositions;
-- SELECT 'step6_board_programmes' AS what, * FROM step6_board_programmes;
