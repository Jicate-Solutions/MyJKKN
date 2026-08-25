-- =====================================================================
-- Orchestration Console — Phase 1 (read layer + Run AI)
-- Migration: 2026-10-03
-- =====================================================================
-- Backs /admin/orchestration — a super-admin page that mirrors what the AI
-- orchestration ("tower") session is doing across every module, plus one
-- "Run AI" action. See artifacts/orchestration-console-spec.html for the
-- full spec. Phase 1 ships the four tables + RLS + realtime only:
--   - orchestration_modules       one row per module (status + explainer text)
--   - orchestration_prs           one row per tracked pull request
--   - orchestration_actions       audit log — every button press (run_ai/merge/deploy)
--   - orchestration_session_state the heartbeat — who's driving, how fresh
--
-- Phase 1 wires ONLY "Run AI" (writes an orchestration_actions row + best-effort
-- trigger via the existing ai-routines path). Merge and Deploy columns/kinds
-- exist here so Phase 2 doesn't need another migration, but Phase 2 wires the
-- actual merge/deploy server routes — not this PR.
--
-- Access: super_admin only, at every layer. Policies mirror the repo's current
-- RLS-initplan-wrapped standard: `(select auth.uid())` so Postgres evaluates
-- the auth check once per query (InitPlan), not once per row.
--
-- DDL is idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS) so a re-run is safe.
-- This file is NOT applied to any database by this PR — the Director applies it.
-- =====================================================================

-- ── TABLES ────────────────────────────────────────────────────────────────

create table if not exists public.orchestration_modules (
  id             uuid primary key default gen_random_uuid(),
  key            text unique not null,
  title          text not null,
  module_url     text,
  status         text not null default 'idle'
                   check (status in ('idle', 'working', 'gated', 'blocked')),
  blocked_reason text,
  blocked_impact text,
  does_text      text,
  output_text    text,
  impact_text    text,
  updated_at     timestamptz not null default now()
);

create table if not exists public.orchestration_prs (
  id             uuid primary key default gen_random_uuid(),
  number         integer not null,
  module_key     text,
  title          text,
  mergeable      text,
  ci_state       text,
  ci_checked_at  timestamptz,
  gate_state     text,
  is_draft       boolean default false,
  updated_at     timestamptz not null default now(),
  unique (number)
);
create index if not exists idx_orchestration_prs_module_key on public.orchestration_prs (module_key);

create table if not exists public.orchestration_actions (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('run_ai', 'merge', 'deploy')),
  target     text,
  actor_id   uuid,
  status     text not null default 'pending',
  result     jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_orchestration_actions_created_at on public.orchestration_actions (created_at desc);

create table if not exists public.orchestration_session_state (
  session_id       text primary key,
  name             text,
  last_seen_at     timestamptz not null default now(),
  current_activity text
);

comment on table public.orchestration_modules is
  'Phase 1 of the Orchestration Console (/admin/orchestration). One row per module — status + plain-language does/output/impact text. Super-admin only.';
comment on table public.orchestration_prs is
  'One row per pull request the orchestration tower is tracking, keyed by GitHub PR number. Super-admin only.';
comment on table public.orchestration_actions is
  'Audit log — every Run AI / Merge / Deploy button press, who pressed it, and the result. Super-admin only.';
comment on table public.orchestration_session_state is
  'Heartbeat rows from tower sessions — powers the "updated Xm ago" freshness stamp. Super-admin only.';

-- ── RLS ──────────────────────────────────────────────────────────────────

alter table public.orchestration_modules       enable row level security;
alter table public.orchestration_prs           enable row level security;
alter table public.orchestration_actions       enable row level security;
alter table public.orchestration_session_state enable row level security;

revoke all on public.orchestration_modules       from anon;
revoke all on public.orchestration_prs           from anon;
revoke all on public.orchestration_actions       from anon;
revoke all on public.orchestration_session_state from anon;

drop policy if exists orchestration_modules_super_admin_all on public.orchestration_modules;
create policy orchestration_modules_super_admin_all
  on public.orchestration_modules
  for all
  using (
    exists (
      select 1 from public.profiles
       where id = (select auth.uid())
         and (role = 'super_admin' or is_super_admin = true)
    )
  )
  with check (
    exists (
      select 1 from public.profiles
       where id = (select auth.uid())
         and (role = 'super_admin' or is_super_admin = true)
    )
  );

drop policy if exists orchestration_prs_super_admin_all on public.orchestration_prs;
create policy orchestration_prs_super_admin_all
  on public.orchestration_prs
  for all
  using (
    exists (
      select 1 from public.profiles
       where id = (select auth.uid())
         and (role = 'super_admin' or is_super_admin = true)
    )
  )
  with check (
    exists (
      select 1 from public.profiles
       where id = (select auth.uid())
         and (role = 'super_admin' or is_super_admin = true)
    )
  );

drop policy if exists orchestration_actions_super_admin_all on public.orchestration_actions;
create policy orchestration_actions_super_admin_all
  on public.orchestration_actions
  for all
  using (
    exists (
      select 1 from public.profiles
       where id = (select auth.uid())
         and (role = 'super_admin' or is_super_admin = true)
    )
  )
  with check (
    exists (
      select 1 from public.profiles
       where id = (select auth.uid())
         and (role = 'super_admin' or is_super_admin = true)
    )
  );

drop policy if exists orchestration_session_state_super_admin_all on public.orchestration_session_state;
create policy orchestration_session_state_super_admin_all
  on public.orchestration_session_state
  for all
  using (
    exists (
      select 1 from public.profiles
       where id = (select auth.uid())
         and (role = 'super_admin' or is_super_admin = true)
    )
  )
  with check (
    exists (
      select 1 from public.profiles
       where id = (select auth.uid())
         and (role = 'super_admin' or is_super_admin = true)
    )
  );

-- ── REALTIME ─────────────────────────────────────────────────────────────
-- Idempotent add: ALTER PUBLICATION ... ADD TABLE errors if the table is
-- already a member, so guard each add with a pg_publication_tables check.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'orchestration_modules'
  ) then
    execute 'alter publication supabase_realtime add table public.orchestration_modules';
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'orchestration_prs'
  ) then
    execute 'alter publication supabase_realtime add table public.orchestration_prs';
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'orchestration_actions'
  ) then
    execute 'alter publication supabase_realtime add table public.orchestration_actions';
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'orchestration_session_state'
  ) then
    execute 'alter publication supabase_realtime add table public.orchestration_session_state';
  end if;
end $$;

notify pgrst, 'reload schema';
