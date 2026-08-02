-- ============================================================================
-- Migration: 20260809100500_accreditation_body_applicability_policy
-- Which of the ten outside bodies actually inspects which college.
-- Updated: 2026-08-09 — Director decision 3 (2026-08-01): "a body that does not
-- apply to a college must say 'does not apply' — never a blank, never a zero."
--
-- *** FILE ONLY. NOT APPLIED TO ANY DATABASE. Director-gated apply. ***
-- Carries no BEGIN;/COMMIT; of its own, so a BEGIN .. ROLLBACK rehearsal stays
-- a rehearsal. An inner COMMIT would turn the rehearsal into a live apply.
--
-- WHAT IT DOES
-- Seeds ONE row into the existing `platform_policies` substrate. Creates no
-- table, no function, no policy, no trigger. Alters no existing object and
-- writes no learner data. It is additive and reversible by deactivating the row.
--
-- WHY A CONFIG ROW AND NOT A CONSTANT IN TYPESCRIPT
-- `docs/architecture/config-table-pattern.md` names **mappings** in its own DOES
-- list. Which bodies inspect which college is a mapping that changes when a
-- college opens a programme, seeks an accreditation, or enters a ranking
-- exercise — none of which should cost a deploy. `platform_policies` is the
-- canonical substrate for exactly this (20260429000002), so no new table is
-- invented here; the reader is the existing `fn_get_policy` RPC and no new
-- SECURITY DEFINER function is created, so there is none to re-lock.
--
-- THE GAP IT CLOSES, STATED PLAINLY
-- Nothing in the database records which body inspects which institution. Every
-- institution therefore reads as subject to all ten, and a college holding no
-- PCI evidence renders as 0 — indistinguishable from a college failing an
-- inspection it was never subject to. A zero is a claim about performance;
-- "does not apply" is a claim about jurisdiction.
--
-- VERIFIED LIVE 2026-08-02: 14 institutions, of which 8 carry an `iqac_code`
-- (ALHD, ASAI, ASSF, DENT, EDUC, ENGG, NURS, PHAR). The other six — two
-- schools, the main office, the incubation forum, a test tenant and an external
-- company — carry none and are inspected by nobody. That coarse split is
-- already settled in `isInspectedByAccreditationBodies()`; this row is the
-- per-body refinement beneath it and never contradicts it.
--
-- THREE ANSWERS, AND WHY THE THIRD EXISTS
--   institution_wide — the body inspects institutions as a whole (NAAC, UGC).
--     `appliesTo` is empty on purpose: a ninth college gets the right answer the
--     day it is given an iqac_code, with no edit here.
--   discipline — the body's statute confines it to ONE field, so a college's
--     absence from `appliesTo` is itself verified (PCI, DCI, INC, NCTE).
--   partial — some pairings are established, the rest genuinely are not, and
--     absence renders "Not established yet" rather than "does not apply":
--       NBA / AICTE — technical education; ENGG is unambiguous, and whether
--         either reaches the other seven depends on which programmes each
--         college runs, which is not held anywhere in this database.
--       NIRF / QS — participation is a decision a college files, not a
--         jurisdiction held over it, and that decision is not recorded here.
--     Recording those as "does not apply" would commit the same error this
--     decision prevents, only in the opposite direction: quietly excusing a
--     college from an inspection it may well be subject to.
--
-- SEED PATTERN: WHERE NOT EXISTS, never ON CONFLICT. `platform_policies` is
-- keyed by an EXPRESSION unique index, so ON CONFLICT (policy_key, scope_type,
-- scope_id) fails with 42P10. Idempotent: re-running changes nothing and will
-- NOT reset a map a super administrator has since revised.
--
-- SCOPE-AWARE: seeded global. `fn_get_policy` resolves user > institution >
-- role > global, so a single college can be given its own overriding map with
-- no code change.
--
-- The JSON between the two markers below is asserted byte-identical to
-- DEFAULT_BODY_APPLICABILITY in
-- `app/(routes)/accreditation/_lib/body-applicability.ts` by
-- `__tests__/app/accreditation/body-applicability.test.ts`. The TypeScript copy
-- is the fallback used before this row is applied; if the two ever disagree the
-- fallback is lying, so the test fails rather than letting them drift.
-- ============================================================================

INSERT INTO public.platform_policies (
  policy_key, scope_type, scope_id, value, description, data_type,
  is_system, is_active, classification, ui_widget, ui_category, ui_consequence,
  publication_state
)
SELECT
  'accreditation.body_applicability.map',
  'global',
  NULL,
-- >>> BODY_APPLICABILITY_MAP_JSON_BEGIN
  '{
  "version": "2026-08-09",
  "bodies": [
    { "bodyCode": "NAAC",  "remit": "institution_wide", "appliesTo": [],         "remitNote": "whole institutions, across every discipline" },
    { "bodyCode": "UGC",   "remit": "institution_wide", "appliesTo": [],         "remitNote": "whole institutions offering higher education" },
    { "bodyCode": "PCI",   "remit": "discipline",       "appliesTo": ["PHAR"],   "remitNote": "pharmacy education" },
    { "bodyCode": "DCI",   "remit": "discipline",       "appliesTo": ["DENT"],   "remitNote": "dental education" },
    { "bodyCode": "INC",   "remit": "discipline",       "appliesTo": ["NURS"],   "remitNote": "nursing education" },
    { "bodyCode": "NCTE",  "remit": "discipline",       "appliesTo": ["EDUC"],   "remitNote": "teaching-qualification programmes" },
    { "bodyCode": "NBA",   "remit": "partial",          "appliesTo": ["ENGG"],   "remitNote": "programme-level technical accreditation" },
    { "bodyCode": "AICTE", "remit": "partial",          "appliesTo": ["ENGG"],   "remitNote": "technical education" },
    { "bodyCode": "NIRF",  "remit": "partial",          "appliesTo": [],         "remitNote": "a ranking exercise each college chooses to enter" },
    { "bodyCode": "QS",    "remit": "partial",          "appliesTo": [],         "remitNote": "an international ranking exercise each college chooses to enter" }
  ]
}'::jsonb,
-- >>> BODY_APPLICABILITY_MAP_JSON_END
  'Which of the ten outside bodies inspects which college, keyed by iqac_code. remit=institution_wide reaches every college carrying a code; remit=discipline makes absence a verified negative; remit=partial makes absence read as "not established yet". An institution with no iqac_code is inspected by nobody and never reaches this map.',
  'object',
  true,
  true,
  'major',
  'textarea',
  'Accreditation',
  'Changes what every accreditation screen says about a college it holds no evidence for. Moving a body to institution_wide, or adding a college to appliesTo, turns "not established yet" into a live expectation and the college begins to read as owing that evidence. Moving a body to discipline turns absence into a published "does not apply" — assert that only where the body''s own statute confines it to one field.',
  'published'
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
  WHERE policy_key = 'accreditation.body_applicability.map'
    AND scope_type = 'global'
    AND scope_id IS NULL
);
