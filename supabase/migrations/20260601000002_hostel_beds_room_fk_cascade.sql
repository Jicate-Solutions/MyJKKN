-- Make hostel_beds cascade-delete with their room.
--
-- Beds are auto-generated structural sub-units of a hostel_room (one row per
-- bed-capacity). Every other structural child of hostel_rooms already has
-- ON DELETE CASCADE (hostel_room_amenity_tags, hostel_room_billable_amenities,
-- hostel_room_eligibility_rule_rooms, room_institution_access,
-- hostel_premium_vacancies) — only hostel_beds was left as NO ACTION, so
-- deleting any room with beds failed with 23503 (hostel_beds_room_id_fkey),
-- which the rooms page mislabeled as "active residents".
--
-- The genuine "don't delete an occupied room" guard stays intact: the
-- hostel_allocations.room_id and hostel_allocations.bed_id FKs remain NO ACTION,
-- so a room (or bed) referenced by a resident allocation still blocks deletion.

ALTER TABLE public.hostel_beds
  DROP CONSTRAINT IF EXISTS hostel_beds_room_id_fkey;

ALTER TABLE public.hostel_beds
  ADD CONSTRAINT hostel_beds_room_id_fkey
  FOREIGN KEY (room_id) REFERENCES public.hostel_rooms(id) ON DELETE CASCADE;
