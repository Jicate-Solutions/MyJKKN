-- =====================================================================
-- Orchestration Console — risk tier on tracked pull requests
-- Migration: 2026-11-05
-- =====================================================================
-- Adds the persisted risk classification the ship-policy layer reads:
--   risk_tier            HELD | LOW | NORMAL  (see lib/services/orchestration/risk-tier.ts)
--   risk_reasons         which pattern decided the tier, for the console badge
--   changed_files_count  how many files GitHub reported for the PR
--
-- Written by app/api/cron/orchestration-sync (steady state) and by the manual
-- POST /api/admin/orchestration/sync when the caller supplies changed files.
-- Read by the console page, the batch endpoint and the merge action (which
-- ALSO re-classifies live from GitHub at click time — the stored value is a
-- badge, never the final word).
--
-- TIER-0: additive only. Existing rows default to NORMAL, which keeps the
-- pre-existing merge behaviour (confirm: true) for every PR until the next
-- sync tick classifies it. No RLS change — the table's super_admin-only
-- policy from 20261003000001_orchestration_console.sql already covers the
-- new columns.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS). This file is NOT applied to any
-- database by its PR — the Director applies it via the
-- "Apply Supabase migrations" workflow.
-- =====================================================================

alter table public.orchestration_prs
  add column if not exists risk_tier text not null default 'NORMAL';

alter table public.orchestration_prs
  add column if not exists risk_reasons text[] not null default '{}';

alter table public.orchestration_prs
  add column if not exists changed_files_count integer;

-- The CHECK is added separately so a re-run of this file is a no-op instead
-- of a duplicate-constraint error.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'orchestration_prs_risk_tier_check'
       and conrelid = 'public.orchestration_prs'::regclass
  ) then
    alter table public.orchestration_prs
      add constraint orchestration_prs_risk_tier_check
      check (risk_tier in ('HELD', 'LOW', 'NORMAL'));
  end if;
end $$;

comment on column public.orchestration_prs.risk_tier is
  'Ship-policy tier: HELD (money/marks/exams/schema — needs tierAck), LOW (docs/types/tests only — may merge unattended), NORMAL (confirm only). Re-derived live at merge time.';
comment on column public.orchestration_prs.risk_reasons is
  'Which pattern decided risk_tier — file path keyword, migration path, title keyword, or the LOW/NORMAL summary.';
comment on column public.orchestration_prs.changed_files_count is
  'Number of changed file paths GitHub reported at the last sync.';

notify pgrst, 'reload schema';
