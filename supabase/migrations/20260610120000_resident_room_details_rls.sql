-- 20260610120000_resident_room_details_rls.sql
-- My Hostel page: residents could read their own hostel_allocations row (own-row
-- policy, 20260531090100) but NOT the block/room/bed it points to — those tables
-- gate SELECT on staff perms (campus_living.blocks/rooms/beds.view), all false for
-- the student role. The embedded joins silently returned NULL, so the "Current Room
-- Allocation" card rendered Block/Room/Bed as em-dashes.
--
-- Fix: additive SELECT policies letting a user read any block/room/bed referenced
-- by one of their OWN allocations (learner_id = auth.uid(); profiles.id = auth id).
-- Helpers are SECURITY DEFINER so the hostel_allocations lookup bypasses RLS —
-- inlining the EXISTS would risk transitive policy recursion (42P17).
CREATE OR REPLACE FUNCTION public.fn_user_allocated_block(p_block_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM hostel_allocations a
    WHERE a.block_id = p_block_id AND a.learner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.fn_user_allocated_room(p_room_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM hostel_allocations a
    WHERE a.room_id = p_room_id AND a.learner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.fn_user_allocated_bed(p_bed_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM hostel_allocations a
    WHERE a.bed_id = p_bed_id AND a.learner_id = auth.uid()
  );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_user_allocated_block(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_user_allocated_room(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_user_allocated_bed(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_user_allocated_block(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_user_allocated_room(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_user_allocated_bed(uuid) TO authenticated;

DROP POLICY IF EXISTS hostel_blocks_select_own_allocation ON public.hostel_blocks;
CREATE POLICY hostel_blocks_select_own_allocation ON public.hostel_blocks
  FOR SELECT USING (fn_user_allocated_block(id));

DROP POLICY IF EXISTS hostel_rooms_select_own_allocation ON public.hostel_rooms;
CREATE POLICY hostel_rooms_select_own_allocation ON public.hostel_rooms
  FOR SELECT USING (fn_user_allocated_room(id));

DROP POLICY IF EXISTS hostel_beds_select_own_allocation ON public.hostel_beds;
CREATE POLICY hostel_beds_select_own_allocation ON public.hostel_beds
  FOR SELECT USING (fn_user_allocated_bed(id));
