-- Fee-aware program eligibility — schema extension.
-- Adds quota + academic-fee band to the two existing (empty) eligibility tables.
-- A row with quota_id/fee_min/fee_max all NULL behaves identically to today's
-- program-only rule (current semantics are a strict subset).

-- ── Room eligibility ────────────────────────────────────────────────────────
ALTER TABLE public.hostel_program_room_eligibility
  ADD COLUMN IF NOT EXISTS quota_id uuid REFERENCES public.quotas(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS fee_min  numeric(12,2),
  ADD COLUMN IF NOT EXISTS fee_max  numeric(12,2);

ALTER TABLE public.hostel_program_room_eligibility
  DROP CONSTRAINT IF EXISTS chk_room_elig_fee_range;
ALTER TABLE public.hostel_program_room_eligibility
  ADD CONSTRAINT chk_room_elig_fee_range
  CHECK (fee_min IS NULL OR fee_max IS NULL OR fee_min < fee_max);

-- Replace bracket uniqueness so the same category can exist in different
-- quota/fee bands of the same (institution, program).
ALTER TABLE public.hostel_program_room_eligibility
  DROP CONSTRAINT IF EXISTS uq_room_elig_inst_prog_cat;
DROP INDEX IF EXISTS public.uq_room_elig_inst_default;
CREATE UNIQUE INDEX IF NOT EXISTS uq_room_elig_bracket ON public.hostel_program_room_eligibility (
  institution_id,
  COALESCE(program_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(quota_id,   '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(fee_min, -1),
  COALESCE(fee_max, -1),
  room_category_id
);
CREATE INDEX IF NOT EXISTS idx_room_elig_resolve
  ON public.hostel_program_room_eligibility (institution_id, program_id, quota_id, is_active);

-- ── Mess eligibility ────────────────────────────────────────────────────────
ALTER TABLE public.hostel_program_mess_eligibility
  ADD COLUMN IF NOT EXISTS quota_id uuid REFERENCES public.quotas(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS fee_min  numeric(12,2),
  ADD COLUMN IF NOT EXISTS fee_max  numeric(12,2);

ALTER TABLE public.hostel_program_mess_eligibility
  DROP CONSTRAINT IF EXISTS chk_mess_elig_fee_range;
ALTER TABLE public.hostel_program_mess_eligibility
  ADD CONSTRAINT chk_mess_elig_fee_range
  CHECK (fee_min IS NULL OR fee_max IS NULL OR fee_min < fee_max);

ALTER TABLE public.hostel_program_mess_eligibility
  DROP CONSTRAINT IF EXISTS uq_mess_elig_inst_prog_cat;
DROP INDEX IF EXISTS public.uq_mess_elig_inst_default;
CREATE UNIQUE INDEX IF NOT EXISTS uq_mess_elig_bracket ON public.hostel_program_mess_eligibility (
  institution_id,
  COALESCE(program_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(quota_id,   '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(fee_min, -1),
  COALESCE(fee_max, -1),
  mess_category_id
);
CREATE INDEX IF NOT EXISTS idx_mess_elig_resolve
  ON public.hostel_program_mess_eligibility (institution_id, program_id, quota_id, is_active);

-- ── Seed the PMSS quota (matrix has BDS-PMSS; it doesn't exist yet) ──────────
INSERT INTO public.quotas (code, name, is_active)
VALUES ('pmss', 'PMSS Quota', true)
ON CONFLICT (code) DO NOTHING;
