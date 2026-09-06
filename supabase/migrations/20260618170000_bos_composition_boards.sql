-- ─────────────────────────────────────────────────────────────────────────────
-- Multi-board BoS compositions: a composition may govern MULTIPLE boards.
--
-- bos_compositions.board_id stays as the PRIMARY board (NOT NULL) for back-compat
-- — all existing routes/RLS that read a single board_id keep working. This
-- junction holds the full board set; scope resolution reads it so members of a
-- multi-board composition reach every board's courses/syllabi/programmes.
--
-- Decisions: shared member roster across all boards; meetings cover all the
-- composition's boards; primary board = the first one assigned.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.bos_composition_boards (
  composition_id uuid not null references public.bos_compositions(id) on delete cascade,
  board_id       uuid not null,
  is_primary     boolean not null default false,
  created_at     timestamptz not null default now(),
  primary key (composition_id, board_id)
);

create index if not exists idx_bos_composition_boards_composition
  on public.bos_composition_boards (composition_id);
create index if not exists idx_bos_composition_boards_board
  on public.bos_composition_boards (board_id);

comment on table public.bos_composition_boards is
  'Boards governed by a BoS composition (multi-board). bos_compositions.board_id mirrors the is_primary=true row.';

-- Backfill: every existing composition becomes a single-board composition whose
-- one board is the current bos_compositions.board_id (marked primary).
insert into public.bos_composition_boards (composition_id, board_id, is_primary)
select id, board_id, true
  from public.bos_compositions
 where board_id is not null
on conflict (composition_id, board_id) do nothing;

-- RLS. Writes go through the API via service-role after chairman/creator authz
-- (same pattern as bos_compositions writes), so no write policy is defined.
-- SELECT is allowed to super-admin, active members of the composition, and its
-- creator — so resolveBosBoardScope's user-context read of the junction works
-- (mirrors how it reads bos_members) and direct reads are scoped defensively.
alter table public.bos_composition_boards enable row level security;

drop policy if exists bos_composition_boards_select on public.bos_composition_boards;
create policy bos_composition_boards_select
  on public.bos_composition_boards
  for select
  using (
    exists (
      select 1 from public.profiles p
       where p.id = auth.uid()
         and (p.is_super_admin = true or p.role = 'super_admin')
    )
    or exists (
      select 1
        from public.bos_members m
        join public.staff s on s.id = m.staff_id
       where m.composition_id = bos_composition_boards.composition_id
         and m.is_active = true
         and s.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.bos_compositions c
       where c.id = bos_composition_boards.composition_id
         and c.created_by = auth.uid()
    )
  );
