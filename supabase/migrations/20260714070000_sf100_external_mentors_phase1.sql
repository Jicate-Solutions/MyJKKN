-- SF100 Mentors/Investors — Phase 1: external identity + team assignment substrate
-- Date: 2026-07-14
-- Spec: specs/sf100-mentors-investors-meetings-spec-2026-07-13.md (§6 Phase 1)
--
-- Builds three things, all additive, zero-risk (ss_mentors/ss_mentor_matches are 0-row):
--   1. ss_mentor_matches: allow a match to target an SF100 ENROLLMENT (any of the
--      18 teams), not only a NIF candidate. candidate_id becomes nullable; exactly
--      ONE of (candidate_id, sf100_enrollment_id) must be set.
--   2. ss_external_access: the account-less code credential for external
--      mentors/investors (no JKKN account). Mirrors the parent-portal credential
--      shape (hash + attempts + lockout). Raw 6-digit code is NEVER stored.
--   3. sf100_training_needs: a team's recorded help-needs, feeding "assign a
--      fitting mentor". Written by ACCEPTED team members (same canonical ownership
--      gate as the participant write-path, fn sf100_can_write_enrollment).
--
-- NOTE on mentor_type: prod CHECK already allows 'investor' (category axis:
--   resident/visiting/industry_expert/academic/investor/alumni/functional).
--   internal-vs-external is carried by user_id null-ness + presence of an
--   ss_external_access row — NOT by mentor_type. So NO mentor_type change here.
--
-- NOTE on RPCs: no new SECURITY DEFINER function is added. All code-generation,
--   hashing, and login run in Node service-role routes (mirroring the parent
--   portal), so there is no new anon-reachable surface to REVOKE.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ss_mentor_matches: target an SF100 enrollment OR a NIF candidate
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.ss_mentor_matches
  alter column candidate_id drop not null;

alter table public.ss_mentor_matches
  add column if not exists sf100_enrollment_id uuid
    references public.sf100_enrollments(id) on delete cascade;

-- Exactly one target per match row (a NIF candidate XOR an SF100 team).
alter table public.ss_mentor_matches
  drop constraint if exists ss_mentor_matches_one_target_chk;
alter table public.ss_mentor_matches
  add constraint ss_mentor_matches_one_target_chk
    check (num_nonnulls(candidate_id, sf100_enrollment_id) = 1);

-- The existing UNIQUE(mentor_id, candidate_id) treats NULLs as distinct, so it
-- does NOT prevent duplicate mentor↔team rows. Add a partial unique index for
-- the SF100 side (a mentor is assigned to a given team at most once).
create unique index if not exists ss_mentor_matches_mentor_enrollment_uq
  on public.ss_mentor_matches (mentor_id, sf100_enrollment_id)
  where sf100_enrollment_id is not null;

create index if not exists ss_mentor_matches_sf100_enrollment_idx
  on public.ss_mentor_matches (sf100_enrollment_id)
  where sf100_enrollment_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ss_external_access: account-less code credential for external mentors/investors
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.ss_external_access (
  id             uuid primary key default gen_random_uuid(),
  mentor_id      uuid not null unique
                   references public.ss_mentors(id) on delete cascade,
  code_hash      text not null,          -- HMAC-SHA256(secret, mentor_id:code); raw code NEVER stored
  is_active      boolean not null default true,
  attempts       integer not null default 0,
  max_attempts   integer not null default 5,
  locked_until   timestamptz,
  last_login_at  timestamptz,
  created_by     uuid references public.profiles(id),
  deactivated_by uuid references public.profiles(id),
  deactivated_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.ss_external_access enable row level security;

-- Service-role only. All login/crypto/status-read runs in Node service-role
-- routes (external users have a custom JWT, not a Supabase session, so RLS on
-- auth.uid() cannot serve them). No anon, no direct authenticated access.
drop policy if exists ss_external_access_service_all on public.ss_external_access;
create policy ss_external_access_service_all on public.ss_external_access
  for all to service_role using (true) with check (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. sf100_training_needs: a team's recorded help-needs
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.sf100_training_needs (
  id            uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null
                  references public.sf100_enrollments(id) on delete cascade,
  category      text not null
                  check (category in ('pitching','tech','finance','legal','marketing','other')),
  detail        text,
  status        text not null default 'open'
                  check (status in ('open','addressed','archived')),
  created_by    uuid not null references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists sf100_training_needs_enrollment_idx
  on public.sf100_training_needs (enrollment_id);

alter table public.sf100_training_needs enable row level security;

-- Accepted team members (and admins, via the helper's is_admin bypass) write
-- their own team's needs; the actor column is pinned to auth.uid().
drop policy if exists sf100_training_needs_insert_member on public.sf100_training_needs;
create policy sf100_training_needs_insert_member on public.sf100_training_needs
  for insert to authenticated
  with check (created_by = auth.uid()
              and public.sf100_can_write_enrollment(enrollment_id));

drop policy if exists sf100_training_needs_select_member on public.sf100_training_needs;
create policy sf100_training_needs_select_member on public.sf100_training_needs
  for select to authenticated
  using (public.sf100_can_write_enrollment(enrollment_id));

drop policy if exists sf100_training_needs_update_member on public.sf100_training_needs;
create policy sf100_training_needs_update_member on public.sf100_training_needs
  for update to authenticated
  using (public.sf100_can_write_enrollment(enrollment_id))
  with check (public.sf100_can_write_enrollment(enrollment_id));

-- Service-role full (coordinator/NIF read + admin tooling go through service-role routes).
drop policy if exists sf100_training_needs_service_all on public.sf100_training_needs;
create policy sf100_training_needs_service_all on public.sf100_training_needs
  for all to service_role using (true) with check (true);

commit;
