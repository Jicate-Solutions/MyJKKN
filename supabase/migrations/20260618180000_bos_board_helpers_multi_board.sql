-- ─────────────────────────────────────────────────────────────────────────────
-- Make the board-scope RLS helpers multi-board aware.
--
-- is_bos_member_of_board / is_bos_chairman_of_board (from 20260514) match only
-- bos_compositions.board_id (the PRIMARY board). With multi-board compositions
-- (bos_composition_boards junction), a member/chairman of a composition that
-- governs board B via the junction would NOT match for board B — so the
-- bos_course_syllabi RLS (which calls these) would hide board B's syllabi at the
-- DB layer even though the app-level boardsOf grants access.
--
-- Fix: match the board via EITHER the primary board_id OR the junction. Keeps
-- the existing single-board behaviour (primary board still matches) and adds the
-- extra boards. Pure function redefinition — no policy or schema change.
-- ─────────────────────────────────────────────────────────────────────────────

-- Any active member of any active composition that governs this board
-- (primary board_id OR a junction board).
create or replace function public.is_bos_member_of_board(p_board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from bos_members m
    join bos_compositions c on c.id = m.composition_id
    join staff s on s.id = m.staff_id
    left join bos_composition_boards cb on cb.composition_id = c.id
    where s.profile_id = (select auth.uid())
      and (c.board_id = p_board_id or cb.board_id = p_board_id)
      and m.is_active = true
      and c.is_active = true
  );
$$;

grant execute on function public.is_bos_member_of_board(uuid) to authenticated;

-- Chairman of any active composition that governs this board
-- (primary board_id OR a junction board).
create or replace function public.is_bos_chairman_of_board(p_board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from bos_members m
    join bos_compositions c on c.id = m.composition_id
    join staff s on s.id = m.staff_id
    left join bos_composition_boards cb on cb.composition_id = c.id
    where s.profile_id = (select auth.uid())
      and (c.board_id = p_board_id or cb.board_id = p_board_id)
      and m.member_type = 'chairman'
      and m.is_active = true
      and c.is_active = true
  );
$$;

grant execute on function public.is_bos_chairman_of_board(uuid) to authenticated;
