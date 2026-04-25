-- =====================================================================
-- Migration: Patch Privilege Resolvers for YUVA Separation
-- Date:      2026-04-22
-- Purpose:   Fix tier-leak bug in _resolver_privilege_lc_members and
--            add YUVA Chapter Chair / Vertical Chair as independent
--            privilege source_kinds.
--
-- BACKGROUND
-- ----------
-- Before PR #301 (2026-04-21), YUVA was a sub-section of Learners Council
-- and YUVA Chapter Chairs were persisted in `lc_members` alongside LC
-- representatives. PR #301 declared YUVA independent at the UI level:
-- distinct top-level tab, URL moved to /learners-council/yuva/*, and
-- the Positions page filters yuva_chapter tier out via .neq filter.
--
-- However, storage is still shared — distinguished by `lc_positions.tier`:
--     tier_1        → LC proper (President/VP/Sec/Treasurer + 27 reps)
--     yuva_chapter  → YUVA Chapter Chairs & Co-Chairs
--
-- The existing `_resolver_privilege_lc_members` view (live on production
-- but never committed to this repo — applied via Supabase MCP) joined
-- only on institution_id, ignoring tier. Consequence: every "Learners
-- Council — <institution>" privilege group was silently pulling in
-- YUVA chairs for that institution.
--
-- Measured leak on prod (2026-04-22 07:10 IST) before this fix:
--
--     Group                     | LC reps | YUVA leaked |
--     Learners Council — AHS    |   3     |     +3      |  6
--     Learners Council — Arts   |   3     |     +2      |  5
--     Learners Council — Dental |   3     |     +2      |  5
--     Learners Council — Engg   |   3     |     +2      |  5
--     Learners Council — Nursing|   3     |     +3      |  6
--     Learners Council — Pharma |   3     |     +3      |  6
--
-- WHAT THIS MIGRATION DOES
-- ------------------------
-- 1. Registers `yuva_chapter_chairs` and `yuva_vertical_chairs` as
--    available source_kinds (via privilege_source_types).
-- 2. Patches `_resolver_privilege_lc_members` to require tier='tier_1'
--    (brings the DDL into the repo for the first time as the
--    source-of-truth).
-- 3. Creates `_resolver_privilege_yuva_chapter_chairs` — joins lc_members
--    → lc_positions WHERE tier='yuva_chapter' AND category IN
--    ('yuva_chair', 'yuva_co_chair').
-- 4. Creates `_resolver_privilege_yuva_vertical_chairs` — joins
--    yuva_vertical_members → yuva_chapters on chapter.institution_id =
--    pg.institution_id, filters role ILIKE '%chair%'. Returns 0 rows
--    today (yuva_vertical_members is empty), ready for Phase 2.
-- 5. Rebuilds `v_privilege_memberships_effective` as UNION ALL across
--    all four resolvers.
--
-- IDEMPOTENCY & SAFETY
-- --------------------
-- * All statements use CREATE OR REPLACE VIEW — safe to re-run.
-- * INSERT uses ON CONFLICT DO UPDATE — safe to re-run.
-- * Zero destructive operations; no row deletes.
-- * Rollback = revert this migration file + re-apply prior resolver DDL.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- STEP 1: Register new source_kinds
-- ---------------------------------------------------------------------
INSERT INTO public.privilege_source_types (kind, display_name, description, is_available, sort_order)
VALUES
    (
        'yuva_chapter_chairs',
        'YUVA Chapter Chairs',
        'Chapter Chair and Co-Chairs for a YUVA chapter. Reads from lc_members where lc_positions.tier = ''yuva_chapter''. Institution-scoped per chapter.',
        true,
        30
    ),
    (
        'yuva_vertical_chairs',
        'YUVA Vertical Chairs',
        'Chairs of YUVA verticals (e.g. Sports, Cultural, Health) within a chapter. Reads from yuva_vertical_members filtered by role ILIKE ''%chair%''. Institution-scoped via chapter.',
        true,
        31
    )
ON CONFLICT (kind) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    is_available = EXCLUDED.is_available,
    sort_order = EXCLUDED.sort_order,
    updated_at = NOW();

-- ---------------------------------------------------------------------
-- STEP 2: Patched LC Members resolver (tier='tier_1' only)
-- ---------------------------------------------------------------------
-- This view was previously applied directly to production DB but never
-- committed to the repo. We bring it in here as source-of-truth, with
-- the tier filter added.
CREATE OR REPLACE VIEW public._resolver_privilege_lc_members AS
SELECT
    uuid_generate_v5(
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
        (pg.id::text || ':'::text) || p.learner_id::text
    ) AS id,
    pg.id AS group_id,
    p.learner_id,
    CASE
        WHEN lc.status::text = 'active'::text THEN 'active'::text
        ELSE 'revoked'::text
    END AS status,
    lc.appointed_at::date AS start_date,
    lc.ended_at::date AS end_date,
    NULL::timestamp with time zone AS revoked_at,
    NULL::uuid AS revoked_by,
    NULL::text AS revoke_reason,
    NULL::text AS review_notes,
    'active'::text AS renewal_status,
    NULL::uuid AS created_by,
    lc.created_at,
    lc.updated_at,
    'lc_members'::text AS source_kind
FROM public.privilege_groups pg
JOIN public.lc_members lc
    ON lc.institution_id = pg.institution_id
    AND lc.status::text = 'active'::text
JOIN public.lc_positions lp
    ON lp.id = lc.position_id
    AND lp.tier = 'tier_1'   -- NEW: exclude yuva_chapter rows
JOIN public.profiles p
    ON p.id = lc.user_id
WHERE pg.source_kind = 'lc_members'::text
    AND p.learner_id IS NOT NULL;

COMMENT ON VIEW public._resolver_privilege_lc_members IS
    'Resolver for source_kind=''lc_members''. Emits LC proper (tier_1) members only. YUVA chairs are excluded via tier filter and served by _resolver_privilege_yuva_chapter_chairs instead.';

-- ---------------------------------------------------------------------
-- STEP 3: NEW — YUVA Chapter Chairs resolver
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public._resolver_privilege_yuva_chapter_chairs AS
SELECT
    uuid_generate_v5(
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
        (pg.id::text || ':'::text) || p.learner_id::text
    ) AS id,
    pg.id AS group_id,
    p.learner_id,
    CASE
        WHEN lc.status::text = 'active'::text THEN 'active'::text
        ELSE 'revoked'::text
    END AS status,
    lc.appointed_at::date AS start_date,
    lc.ended_at::date AS end_date,
    NULL::timestamp with time zone AS revoked_at,
    NULL::uuid AS revoked_by,
    NULL::text AS revoke_reason,
    NULL::text AS review_notes,
    'active'::text AS renewal_status,
    NULL::uuid AS created_by,
    lc.created_at,
    lc.updated_at,
    'yuva_chapter_chairs'::text AS source_kind
FROM public.privilege_groups pg
JOIN public.lc_members lc
    ON lc.institution_id = pg.institution_id
    AND lc.status::text = 'active'::text
JOIN public.lc_positions lp
    ON lp.id = lc.position_id
    AND lp.tier = 'yuva_chapter'
    AND lp.category IN ('yuva_chair', 'yuva_co_chair')
JOIN public.profiles p
    ON p.id = lc.user_id
WHERE pg.source_kind = 'yuva_chapter_chairs'::text
    AND p.learner_id IS NOT NULL;

COMMENT ON VIEW public._resolver_privilege_yuva_chapter_chairs IS
    'Resolver for source_kind=''yuva_chapter_chairs''. Emits YUVA Chapter Chair + Co-Chairs for the privilege_group''s institution. Backed by lc_members + lc_positions where tier=yuva_chapter.';

-- ---------------------------------------------------------------------
-- STEP 4: NEW — YUVA Vertical Chairs resolver
-- ---------------------------------------------------------------------
-- NOTE: yuva_vertical_members is empty on production as of 2026-04-22.
-- This resolver returns zero rows until Phase 2 YUVA permissions land
-- (brief P2 task). Including it now for forward-compatibility.
CREATE OR REPLACE VIEW public._resolver_privilege_yuva_vertical_chairs AS
SELECT
    uuid_generate_v5(
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
        (pg.id::text || ':'::text) || p.learner_id::text
    ) AS id,
    pg.id AS group_id,
    p.learner_id,
    CASE
        WHEN yvm.is_active = true THEN 'active'::text
        ELSE 'revoked'::text
    END AS status,
    yvm.appointed_at::date AS start_date,
    yvm.ended_at::date AS end_date,
    NULL::timestamp with time zone AS revoked_at,
    NULL::uuid AS revoked_by,
    NULL::text AS revoke_reason,
    NULL::text AS review_notes,
    'active'::text AS renewal_status,
    NULL::uuid AS created_by,
    yvm.created_at,
    yvm.updated_at,
    'yuva_vertical_chairs'::text AS source_kind
FROM public.privilege_groups pg
JOIN public.yuva_chapters yc
    ON yc.institution_id = pg.institution_id
    AND yc.is_active = true
JOIN public.yuva_vertical_members yvm
    ON yvm.chapter_id = yc.id
    AND yvm.is_active = true
    AND yvm.role ILIKE '%chair%'   -- catches chair, Chair, co-chair, Co-Chair, vice-chair
JOIN public.profiles p
    ON p.id = yvm.user_id
WHERE pg.source_kind = 'yuva_vertical_chairs'::text
    AND p.learner_id IS NOT NULL;

COMMENT ON VIEW public._resolver_privilege_yuva_vertical_chairs IS
    'Resolver for source_kind=''yuva_vertical_chairs''. Emits chairs of YUVA verticals within a chapter. Backed by yuva_vertical_members filtered by role ILIKE ''%chair%''. Returns 0 rows until Phase 2 populates yuva_vertical_members.';

-- ---------------------------------------------------------------------
-- STEP 5: Rebuild unified effective memberships view
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_privilege_memberships_effective AS
SELECT
    id, group_id, learner_id, status, start_date, end_date,
    revoked_at, revoked_by, revoke_reason, review_notes,
    renewal_status, created_by, created_at, updated_at, source_kind
FROM public._resolver_privilege_manual
UNION ALL
SELECT
    id, group_id, learner_id, status, start_date, end_date,
    revoked_at, revoked_by, revoke_reason, review_notes,
    renewal_status, created_by, created_at, updated_at, source_kind
FROM public._resolver_privilege_lc_members
UNION ALL
SELECT
    id, group_id, learner_id, status, start_date, end_date,
    revoked_at, revoked_by, revoke_reason, review_notes,
    renewal_status, created_by, created_at, updated_at, source_kind
FROM public._resolver_privilege_yuva_chapter_chairs
UNION ALL
SELECT
    id, group_id, learner_id, status, start_date, end_date,
    revoked_at, revoked_by, revoke_reason, review_notes,
    renewal_status, created_by, created_at, updated_at, source_kind
FROM public._resolver_privilege_yuva_vertical_chairs;

COMMENT ON VIEW public.v_privilege_memberships_effective IS
    'Unified effective memberships across all privilege source_kinds. UNION ALL of manual + lc_members (tier_1 only) + yuva_chapter_chairs + yuva_vertical_chairs resolvers. Read-only; the Privileges module reads this view instead of privilege_members for backed groups.';

COMMIT;

-- =====================================================================
-- POST-APPLY VERIFICATION QUERIES (run manually after merge+deploy)
-- =====================================================================
--
-- 1. LC groups drop from 5-6 members to exactly 3 (no YUVA bleed):
--    SELECT pg.name, count(*) FROM privilege_groups pg
--    JOIN v_privilege_memberships_effective v ON v.group_id = pg.id
--    WHERE pg.source_kind = 'lc_members'
--    GROUP BY pg.id, pg.name ORDER BY pg.name;
--
-- 2. New source_kinds visible for Privileges UI dropdown:
--    SELECT kind, display_name, is_available FROM privilege_source_types
--    WHERE kind LIKE 'yuva_%' ORDER BY sort_order;
--
-- 3. Chapter chair resolver returns expected 24 rows per group
--    once groups are created (currently zero — no YUVA groups yet):
--    SELECT count(*) FROM _resolver_privilege_yuva_chapter_chairs;
--
-- 4. Vertical chair resolver returns zero rows (expected — table empty):
--    SELECT count(*) FROM _resolver_privilege_yuva_vertical_chairs;
-- =====================================================================
