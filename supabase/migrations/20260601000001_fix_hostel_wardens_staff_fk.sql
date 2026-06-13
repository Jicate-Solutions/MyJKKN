-- Fix hostel_wardens.staff_id foreign key target.
--
-- 20260222000020_campus_living_add_learner_fks.sql added:
--     FOREIGN KEY (staff_id) REFERENCES profiles(id)
-- but staff_id holds a staff.id everywhere in the application:
--   * write: warden-form-dialog sets staff_id = staff.id
--            (user_id holds the profiles id, which the block-access trigger uses)
--   * read:  wardens-table / columns.tsx / block wardens page all resolve the
--            warden's name via `staff WHERE id = staff_id`
-- The profiles reference is already provided by user_id (FK -> profiles(id)).
-- The staff_id -> profiles FK was a copy-paste slip and made every warden
-- INSERT fail with 23503 (foreign_key_violation). hostel_wardens is empty, so
-- repointing the FK to staff(id) carries no data risk.

ALTER TABLE public.hostel_wardens
  DROP CONSTRAINT IF EXISTS hostel_wardens_staff_id_fkey;

ALTER TABLE public.hostel_wardens
  ADD CONSTRAINT hostel_wardens_staff_id_fkey
  FOREIGN KEY (staff_id) REFERENCES public.staff(id);
