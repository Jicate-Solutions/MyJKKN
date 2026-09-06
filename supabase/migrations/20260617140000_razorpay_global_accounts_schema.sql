-- 20260617140000_razorpay_global_accounts_schema.sql
--
-- Global (institution-agnostic) Razorpay accounts: institution_id IS NULL means
-- "common to ALL institutions for this fee_head" (e.g. one transport MID group-wide).
-- Extends 20260613130000 (institution x fee-head routing).

-- 1. Allow global rows.
ALTER TABLE public.razorpay_accounts ALTER COLUMN institution_id DROP NOT NULL;

COMMENT ON COLUMN public.razorpay_accounts.institution_id IS
  'Institution this account serves; NULL = GLOBAL (common to all institutions for its fee_head).';

-- 2. Global-aware uniqueness. Postgres treats bare NULLs as distinct in a unique index,
--    so coalesce the nullable institution to the nil UUID — keeps "one ACTIVE account per
--    (institution|global, fee_head)" and "one DRAFT per slot" true for global rows too.
DROP INDEX IF EXISTS public.razorpay_accounts_active_inst_feehead_uidx;
CREATE UNIQUE INDEX razorpay_accounts_active_inst_feehead_uidx
  ON public.razorpay_accounts
     (COALESCE(institution_id, '00000000-0000-0000-0000-000000000000'::uuid),
      COALESCE(fee_head, '__default__'))
  WHERE is_active;

DROP INDEX IF EXISTS public.razorpay_accounts_draft_inst_feehead_uidx;
CREATE UNIQUE INDEX razorpay_accounts_draft_inst_feehead_uidx
  ON public.razorpay_accounts
     (COALESCE(institution_id, '00000000-0000-0000-0000-000000000000'::uuid),
      COALESCE(fee_head, '__default__'))
  WHERE key_id IS NULL;
