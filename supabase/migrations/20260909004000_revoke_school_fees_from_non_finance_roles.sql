-- ============================================================================
-- 20260909004000 — Revoke school_fees.* from coo / seo / induction_lead / faculty
-- ============================================================================
-- These four roles held FIVE school-fee keys each — read, manage, activate,
-- generate, concession — which is the full authority over a school's fee
-- structure: edit the plan amounts, activate a version, raise the whole year's
-- bills for every learner, and assign concessions.
--
-- None of them is a finance role. `faculty` alone covers 394 users, so this is
-- also the widest of the four by a long way. The grants look like a broad
-- sweep rather than intent — note that none of the four was ever given
-- school_fees.collect, so nobody has been taking payments on them.
--
-- LEFT ALONE deliberately:
--   super_admin, administrator, accounts  — the finance/admin roles
--   accountant_assistant                  — read + collect only, correct as-is
--   system_admin, transport_head          — not in scope of this revocation
--
-- Removal only. No key is added anywhere and no other namespace is touched:
-- the `-` operator strips the named keys and leaves the rest of each role's
-- permissions object exactly as it was.
--
-- REVERSIBLE: re-granting is the same `|| jsonb` merge used by
-- 20260813100007. The keys removed here are listed above verbatim.
-- ============================================================================

UPDATE public.custom_roles
   SET permissions = permissions - ARRAY[
         'school_fees.read',
         'school_fees.manage',
         'school_fees.activate',
         'school_fees.generate',
         'school_fees.concession',
         -- Not currently held by any of the four, but named so a re-run after
         -- an accidental grant still cleans up.
         'school_fees.collect'
       ],
       updated_at  = now()
 WHERE role_key IN ('coo', 'seo', 'induction_lead', 'faculty')
   AND permissions ?| ARRAY[
         'school_fees.read',
         'school_fees.manage',
         'school_fees.activate',
         'school_fees.generate',
         'school_fees.concession',
         'school_fees.collect'
       ];
