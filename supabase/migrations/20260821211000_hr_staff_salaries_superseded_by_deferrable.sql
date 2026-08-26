-- superseded_by must be DEFERRABLE.
--
-- fn_hr_set_staff_salary mints the new id, points the incumbent at it, then
-- inserts. That order is forced: hr_staff_salaries_one_current is a partial
-- UNIQUE INDEX, and indexes are checked immediately and cannot be deferred, so
-- the new row cannot exist while the old one is still current.
--
-- Which leaves the FK as the thing that has to wait. Checked immediately it
-- raises 23503 on the UPDATE, because the row it points at is inserted one
-- statement later. INITIALLY DEFERRED moves the check to commit, by which time
-- both rows exist and both constraints hold.
--
-- Testing note: a DEFERRED constraint is never checked inside a transaction
-- that only rolls back. A probe must end with SET CONSTRAINTS ALL IMMEDIATE or
-- it proves nothing.

ALTER TABLE public.hr_staff_salaries
  DROP CONSTRAINT IF EXISTS hr_staff_salaries_superseded_by_fkey;

ALTER TABLE public.hr_staff_salaries
  ADD CONSTRAINT hr_staff_salaries_superseded_by_fkey
  FOREIGN KEY (superseded_by) REFERENCES public.hr_staff_salaries(id)
  DEFERRABLE INITIALLY DEFERRED;
