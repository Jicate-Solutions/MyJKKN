-- Phase 1 — Community & Caste DB foundation
--
-- Context: community & caste were stored as free TEXT on learners_profiles and
-- the caste taxonomy lived only in a static TS file
-- (lib/constants/community-caste-list.ts). community_categories already exists
-- (global lookup, fee-matrix dimension). This migration:
--   1. Creates `castes` as a child of community_categories (seeded next phase).
--   2. Adds learners_profiles.caste_id FK (community_category_id already exists).
--   3. Opens READ on community_categories + castes to anon so the PUBLIC QR
--      student form uses the same DB data instead of the static fallback
--      (root cause of the "community not pre-filled" bug). Writes stay gated on
--      the existing admission_fees.manage permission.
--
-- The legacy TEXT columns learners_profiles.community / .caste are KEPT as
-- denormalized shadows (community is NOT NULL); forms will write FKs and a
-- later phase mirrors the readable name into the text column for legacy readers.

-- ─── castes table ───────────────────────────────────────────────────────────
create table if not exists public.castes (
  id                    uuid primary key default gen_random_uuid(),
  community_category_id uuid not null references public.community_categories(id) on delete restrict,
  name                  text not null,
  aliases               text[] not null default '{}',
  notes                 text,
  sort_order            integer not null default 0,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid,
  updated_by            uuid,
  unique (community_category_id, name)
);

create index if not exists idx_castes_community_category_id on public.castes(community_category_id);
create index if not exists idx_castes_is_active            on public.castes(is_active);

-- updated_at touch trigger
create or replace function public.set_updated_at_castes()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_castes_updated_at on public.castes;
create trigger trg_castes_updated_at
  before update on public.castes
  for each row execute function public.set_updated_at_castes();

-- ─── learners_profiles.caste_id FK ──────────────────────────────────────────
alter table public.learners_profiles
  add column if not exists caste_id uuid references public.castes(id);

create index if not exists idx_learners_profiles_caste_id on public.learners_profiles(caste_id);

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.castes enable row level security;

-- Read: open to everyone incl. anon (public TN reservation taxonomy, non-sensitive).
drop policy if exists castes_read on public.castes;
create policy castes_read on public.castes
  for select to public
  using (true);

-- Write: admission fees managers only (reuse existing perm for consistency with
-- quotas / community_categories / accommodation_types).
drop policy if exists castes_write on public.castes;
create policy castes_write on public.castes
  for all to public
  using (user_has_permission('admission_fees.manage'))
  with check (user_has_permission('admission_fees.manage'));

-- Open community_categories read to anon (was authenticated-only — the reason
-- the public QR form fell back to the static list and mismatched saved values).
drop policy if exists community_categories_read on public.community_categories;
create policy community_categories_read on public.community_categories
  for select to public
  using (true);

-- Table-level grants for anon read (RLS filters; grant is still required).
grant select on public.castes to anon, authenticated;
grant select on public.community_categories to anon;
