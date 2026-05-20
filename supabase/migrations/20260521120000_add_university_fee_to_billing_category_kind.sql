-- ============================================================================
-- 20260521120000 — Add 'university_fee' to billing_category_kind enum
-- ============================================================================
-- Step 1 of a 2-migration sequence. ALTER TYPE...ADD VALUE cannot run in the
-- same transaction as DML that references the new value (Postgres rule), so
-- the reclassification UPDATE + RPC change + trigger creation live in the
-- next migration (20260521120100).
--
-- Why: "University Fee" bills (a small registration fee paid to the
-- university board) are currently classified as kind='other', so they don't
-- count toward Gate A of evaluate_learner_status_after_payment which gates
-- the account → reserved promotion on (application_fee paid + tuition paid).
-- Per product decision 2026-05-21, the actual gating universals are
-- application_fee + university_fee (not the large multi-year tuition).
-- We introduce a dedicated 'university_fee' kind rather than overloading
-- 'tuition' so the semantics stay clear and the kind label still reads
-- naturally to operators editing categories.
-- ============================================================================

ALTER TYPE public.billing_category_kind ADD VALUE IF NOT EXISTS 'university_fee';
