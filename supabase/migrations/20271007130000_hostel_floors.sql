-- Campus Living: floors become first-class, per-block, admin-managed records.
--
-- Before this, a floor was only the integer hostel_rooms.floor, so a floor with
-- no rooms could not exist, nothing could rename/delete one, and
-- hostel_blocks.total_floors was a free counter that drifted (34 rooms sat on a
-- floor >= total_floors). Rooms KEEP their `floor` integer — the 20 allocation /
-- eligibility / attendance functions and 14 other readers key on it — and a
-- composite FK now guarantees every room sits on a real floor of its own block.
--
-- Floor NUMBER is immutable (rooms, eligibility rules and attendance all key on
-- it); name + is_active are editable. Delete is blocked by the FKs while rooms
-- or an eligibility rule still use the floor. Writes are gated by the existing
-- campus_living.blocks.edit key — no new permission keys.

-- ── Table (RLS enabled in the same migration) ────────────────────────────────
CREATE TABLE public.hostel_floors (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id     uuid        NOT NULL REFERENCES public.hostel_blocks(id) ON DELETE CASCADE,
  floor_number integer     NOT NULL CHECK (floor_number BETWEEN 0 AND 50),
  name         text        CHECK (name IS NULL OR char_length(btrim(name)) BETWEEN 1 AND 60),
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hostel_floors_block_floor_key UNIQUE (block_id, floor_number)
);

COMMENT ON TABLE public.hostel_floors IS
  'One row per floor of a hostel block. floor_number is the same integer stored in hostel_rooms.floor (0 = Ground) and is immutable; name is an optional display override.';

ALTER TABLE public.hostel_floors ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.hostel_floors FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hostel_floors TO authenticated, service_role;

-- ── Policies: mirror hostel_blocks (gate on permission keys, never role names) ─
CREATE POLICY hostel_floors_select_permission ON public.hostel_floors
  FOR SELECT TO authenticated
  USING (
    (SELECT is_super_admin()) OR (SELECT is_admin())
    OR ((SELECT user_has_permission('campus_living.blocks.view'))
        AND role_has_hostel_block_scope(block_id, NULL::uuid))
  );

CREATE POLICY hostel_floors_select_own_allocation ON public.hostel_floors
  FOR SELECT TO authenticated
  USING (fn_user_allocated_block(block_id));

CREATE POLICY hostel_floors_insert_permission ON public.hostel_floors
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT is_super_admin()) OR (SELECT is_admin())
    OR ((SELECT user_has_permission('campus_living.blocks.edit'))
        AND role_has_hostel_block_scope(block_id, NULL::uuid))
  );

CREATE POLICY hostel_floors_update_permission ON public.hostel_floors
  FOR UPDATE TO authenticated
  USING (
    (SELECT is_super_admin()) OR (SELECT is_admin())
    OR ((SELECT user_has_permission('campus_living.blocks.edit'))
        AND role_has_hostel_block_scope(block_id, NULL::uuid))
  );

CREATE POLICY hostel_floors_delete_permission ON public.hostel_floors
  FOR DELETE TO authenticated
  USING (
    (SELECT is_super_admin()) OR (SELECT is_admin())
    OR ((SELECT user_has_permission('campus_living.blocks.edit'))
        AND role_has_hostel_block_scope(block_id, NULL::uuid))
  );

-- ── Triggers: updated_at + immutable identity ────────────────────────────────
CREATE TRIGGER trg_hostel_floors_updated_at
  BEFORE UPDATE ON public.hostel_floors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- A UI-only lock on floor_number would be decorative: the column is writable
-- through RLS, and a rename would orphan every room / rule that keys on it.
CREATE OR REPLACE FUNCTION public.fn_hostel_floors_identity_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.block_id IS DISTINCT FROM OLD.block_id
     OR NEW.floor_number IS DISTINCT FROM OLD.floor_number THEN
    RAISE EXCEPTION 'A floor''s block and floor number cannot be changed. Delete the empty floor and add a new one instead.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_hostel_floors_identity_guard
  BEFORE UPDATE ON public.hostel_floors
  FOR EACH ROW EXECUTE FUNCTION public.fn_hostel_floors_identity_guard();

-- ── Backfill: the floors that actually exist today (no phantom floors) ───────
INSERT INTO public.hostel_floors (block_id, floor_number)
SELECT block_id, floor FROM public.hostel_rooms
 WHERE floor BETWEEN 0 AND 50
UNION
SELECT block_id, floor FROM public.hostel_room_eligibility_rules
 WHERE block_id IS NOT NULL AND floor BETWEEN 0 AND 50
ON CONFLICT (block_id, floor_number) DO NOTHING;

-- ── Referential integrity: rooms + eligibility rules must sit on a real floor ─
-- idx_hostel_rooms_block (block_id) does not cover the (block_id, floor) probe
-- the FK runs on every floor delete.
CREATE INDEX IF NOT EXISTS idx_hostel_rooms_block_floor
  ON public.hostel_rooms (block_id, floor);

ALTER TABLE public.hostel_rooms
  ADD CONSTRAINT hostel_rooms_block_floor_fkey
  FOREIGN KEY (block_id, floor)
  REFERENCES public.hostel_floors (block_id, floor_number)
  ON UPDATE RESTRICT ON DELETE RESTRICT;

-- MATCH SIMPLE (default): a rule with floor NULL = "whole block" is not checked.
ALTER TABLE public.hostel_room_eligibility_rules
  ADD CONSTRAINT hostel_room_eligibility_rules_block_floor_fkey
  FOREIGN KEY (block_id, floor)
  REFERENCES public.hostel_floors (block_id, floor_number)
  ON UPDATE RESTRICT ON DELETE RESTRICT;

-- ── hostel_blocks.total_floors is now DERIVED from hostel_floors ─────────────
-- SECURITY DEFINER is required: the block-insert seeding below runs for a
-- creator who cannot see the new block yet (hostel_block_institutions is
-- granted AFTER the block exists). Both functions take no caller-supplied ids —
-- they act on NEW/OLD only — so there is nothing to spoof.
CREATE OR REPLACE FUNCTION public.fn_hostel_floors_sync_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_block uuid := COALESCE(NEW.block_id, OLD.block_id);
BEGIN
  UPDATE public.hostel_blocks b
     SET total_floors = (SELECT count(*) FROM public.hostel_floors f WHERE f.block_id = v_block)
   WHERE b.id = v_block;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_hostel_floors_sync_total
  AFTER INSERT OR DELETE ON public.hostel_floors
  FOR EACH ROW EXECUTE FUNCTION public.fn_hostel_floors_sync_total();

-- A new block still takes "Number of Floors" on the create form: seed floors
-- 0..n-1 (0 = Ground). Capped at the table's 0..50 range.
CREATE OR REPLACE FUNCTION public.fn_hostel_blocks_seed_floors()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.hostel_floors (block_id, floor_number)
  SELECT NEW.id, g
    FROM generate_series(0, least(COALESCE(NEW.total_floors, 0), 51) - 1) AS g
  ON CONFLICT (block_id, floor_number) DO NOTHING;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_hostel_blocks_seed_floors
  AFTER INSERT ON public.hostel_blocks
  FOR EACH ROW EXECUTE FUNCTION public.fn_hostel_blocks_seed_floors();

REVOKE ALL ON FUNCTION public.fn_hostel_floors_sync_total()  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_hostel_blocks_seed_floors() FROM PUBLIC, anon, authenticated;

-- One-time reset: the stored counter becomes the real floor count
-- (Boys Hostel B, Girls Hostel B, Girls Hostel C: 3 -> 2).
UPDATE public.hostel_blocks b
   SET total_floors = (SELECT count(*) FROM public.hostel_floors f WHERE f.block_id = b.id)
 WHERE b.total_floors IS DISTINCT FROM (SELECT count(*) FROM public.hostel_floors f WHERE f.block_id = b.id);
