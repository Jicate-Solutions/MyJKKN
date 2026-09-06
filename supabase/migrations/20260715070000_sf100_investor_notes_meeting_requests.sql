-- SF100 Mentors/Investors — Phase 2 (investor notes) + Phase 3 (meeting requests)
-- Date: 2026-07-15
-- Spec: specs/sf100-mentors-investors-meetings-spec-2026-07-13.md §3, §6 Phase 2/3
-- Builds on Phase 1 (PR #2050): ss_external_access, sf100_training_needs,
-- ss_mentor_matches.sf100_enrollment_id. Additive, zero-risk.
--
-- No new SECURITY DEFINER RPC (all writes go through service-role routes gated by
-- permission, or the authenticated RLS path via sf100_can_write_enrollment — the
-- same discipline as Phase 1). Nothing new is anon-reachable.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2: sf100_investor_notes — an investor's private notes on an assigned team.
-- Visible to coordinators/NIF only (default per spec D6) — NOT the team. Written
-- by the investor from /external (no auth.uid → created_by null) or by staff.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.sf100_investor_notes (
  id             uuid primary key default gen_random_uuid(),
  enrollment_id  uuid not null references public.sf100_enrollments(id) on delete cascade,
  mentor_id      uuid not null references public.ss_mentors(id) on delete cascade, -- the investor
  note           text not null,
  interest_level text check (interest_level in ('high','medium','low','passed')),
  created_by     uuid references public.profiles(id),  -- null when written by external investor
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists sf100_investor_notes_enrollment_idx
  on public.sf100_investor_notes (enrollment_id);
create index if not exists sf100_investor_notes_mentor_idx
  on public.sf100_investor_notes (mentor_id);

alter table public.sf100_investor_notes enable row level security;

-- Service-role only. External investors have no Supabase session (their write goes
-- through a service-role route that verifies assignment + investor role); staff
-- coordinator/NIF reads go through a service-role route gated by permission. The
-- team must NOT see these notes, so there is deliberately no authenticated policy.
drop policy if exists sf100_investor_notes_service_all on public.sf100_investor_notes;
create policy sf100_investor_notes_service_all on public.sf100_investor_notes
  for all to service_role using (true) with check (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 3: sf100_meeting_requests — a team asks to meet someone; NIF approves/
-- declines + schedules (creating a meeting_bookings row on schedule).
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.sf100_meeting_requests (
  id                  uuid primary key default gen_random_uuid(),
  enrollment_id       uuid not null references public.sf100_enrollments(id) on delete cascade,
  -- requested person: a registry mentor/investor OR a free-text person
  requested_mentor_id uuid references public.ss_mentors(id) on delete set null,
  requested_name      text,     -- free-text name when not a registry contact
  requested_contact   text,     -- free-text email/phone for a free-text person
  reason              text not null,
  status              text not null default 'pending'
                        check (status in ('pending','approved','declined','scheduled','cancelled')),
  nif_decided_by      uuid references public.profiles(id),
  decided_at          timestamptz,
  decline_reason      text,
  booking_id          uuid references public.meeting_bookings(id) on delete set null,
  created_by          uuid not null references public.profiles(id),  -- the requesting team member
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- must name someone: a registry mentor OR a free-text name
  constraint sf100_meeting_requests_person_chk
    check (requested_mentor_id is not null or requested_name is not null)
);

create index if not exists sf100_meeting_requests_enrollment_idx
  on public.sf100_meeting_requests (enrollment_id);
create index if not exists sf100_meeting_requests_status_idx
  on public.sf100_meeting_requests (status);

alter table public.sf100_meeting_requests enable row level security;

-- Team members (accepted, via the canonical gate) create + read their own team's
-- requests; the actor is pinned to auth.uid().
drop policy if exists sf100_meeting_requests_insert_member on public.sf100_meeting_requests;
create policy sf100_meeting_requests_insert_member on public.sf100_meeting_requests
  for insert to authenticated
  with check (created_by = auth.uid()
              and public.sf100_can_write_enrollment(enrollment_id));

drop policy if exists sf100_meeting_requests_select_member on public.sf100_meeting_requests;
create policy sf100_meeting_requests_select_member on public.sf100_meeting_requests
  for select to authenticated
  using (public.sf100_can_write_enrollment(enrollment_id));

-- NIF decisions (approve/decline/schedule) + the NIF queue read run through
-- service-role routes gated by permission (NIF coordinators are not team members).
drop policy if exists sf100_meeting_requests_service_all on public.sf100_meeting_requests;
create policy sf100_meeting_requests_service_all on public.sf100_meeting_requests
  for all to service_role using (true) with check (true);

commit;
