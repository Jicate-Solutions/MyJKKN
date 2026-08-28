-- Purge 12 test staff records, at the user's explicit instruction (2026-08-28).
--
-- These are the no-login staff created 16–17 May 2026 at JKKN Main Office in
-- the Maintenance / Cooking Master / Store Keeper categories, carrying the
-- synthetic @nolog.jkkn.local addresses this app generates for staff without a
-- real mailbox.
--
-- WHAT WAS CHECKED BEFORE DELETING. Their HR footprint is empty — 0 attendance
-- records, leave applications, comp-off claims, regularizations, payroll,
-- salary and bank rows — and no auth.users row exists for any of them, so
-- nothing in the auth schema is touched. A full sweep of every foreign key
-- referencing staff and profiles found only what is handled below.
--
-- ONE OF THEM DID NOT LOOK LIKE TEST DATA and was confirmed anyway: KARTHIK V
-- owns three project_tasks created 2026-08-11 ("Set up Yes/No follow-up bot",
-- "Export 1,680 test-attended student records", "Create subdomain
-- jkkrct.jkkn.ac.in"). That FK is NO ACTION, so it would have blocked the
-- delete outright; the tasks are removed here on the same instruction.
--
-- BACKED UP FIRST, following the convention of the earlier purges
-- (hr_leave_applications_backup_20260824 and friends). The backup tables are
-- the only way back — nothing else in this migration is reversible.

BEGIN;

CREATE TEMP TABLE _purge_ids(staff_id uuid, profile_id uuid) ON COMMIT DROP;
INSERT INTO _purge_ids VALUES
  ('84ed3c57-af9f-4f26-8a40-77845e1286f2','10a4841a-5d45-472f-aa48-bdb33c1f6d2b'),
  ('4a49dc5d-0abb-43b7-a5e4-d2d049ca7eaf','a1f97455-f979-4545-843b-fdfc27f903b5'),
  ('8cdbfb23-ccfe-4d94-8114-53ebbfdb4def','59cccad3-e74a-4e1f-a6f1-4db3f81a8b8f'),
  ('aaeb98a7-4e02-4265-b00c-480665bae242','58083b22-7812-4b09-b92d-1309621008f8'),
  ('120d804b-bd0c-4f73-94c0-b875dcee547b','1bea833b-4a8e-473a-aef0-966a1d530412'),
  ('8fc3b9a8-c247-4655-b31e-93996d9334fb','d91e48bc-dc2a-4d31-b4c2-845cee8a20f4'),
  ('c265da93-2071-49de-9eed-13d1eb35dc8a','0ed3ac81-8ca7-4af5-b5ce-eb17a5846dba'),
  ('68db8ab7-bb0c-4d51-a1a0-d258936f12f7','4da14c94-1df2-431c-b871-ee2fd123c37d'),
  ('bf7bac3d-04ac-41ad-b893-1069738c0884','c7d11bb2-0b77-43f7-ab8f-1e57e7105948'),
  ('b53ed57d-1b42-4940-b3a8-e7465d71c131','237c74fc-89cd-4302-aae2-f76fb5d18059'),
  ('c24026c4-fb8a-4bbd-9a97-588cd8690f65','86217722-6757-47ed-afeb-fd9d6c15f462'),
  ('59c1dc1b-8c92-47e6-8012-deb22c86cac5','29fe2fa0-9952-45a9-9397-b9b357dfe79c');

-- ---- backups ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_backup_20260828_testpurge AS
  SELECT * FROM public.staff WHERE id IN (SELECT staff_id FROM _purge_ids);
CREATE TABLE IF NOT EXISTS public.profiles_backup_20260828_testpurge AS
  SELECT * FROM public.profiles WHERE id IN (SELECT profile_id FROM _purge_ids);
CREATE TABLE IF NOT EXISTS public.user_roles_backup_20260828_testpurge AS
  SELECT * FROM public.user_roles WHERE user_id IN (SELECT profile_id FROM _purge_ids);
CREATE TABLE IF NOT EXISTS public.jkkn_identities_backup_20260828_testpurge AS
  SELECT * FROM public.jkkn_identities WHERE team_member_id IN (SELECT staff_id FROM _purge_ids);
CREATE TABLE IF NOT EXISTS public.project_tasks_backup_20260828_testpurge AS
  SELECT * FROM public.project_tasks WHERE owner_staff_id IN (SELECT staff_id FROM _purge_ids);
CREATE TABLE IF NOT EXISTS public.hr_leave_balances_backup_20260828_testpurge AS
  SELECT * FROM public.hr_leave_balances WHERE employee_id IN (SELECT staff_id FROM _purge_ids);

-- ---- delete, in foreign-key order -----------------------------------------

-- 1. project_tasks: NO ACTION on staff, so this MUST precede the staff delete.
DELETE FROM public.project_tasks WHERE owner_staff_id IN (SELECT staff_id FROM _purge_ids);

-- 2. jkkn_identities: the FK is SET NULL, which would leave 12 live ID numbers
--    pointing at nobody. Deleted outright instead of orphaned.
DELETE FROM public.jkkn_identities WHERE team_member_id IN (SELECT staff_id FROM _purge_ids);

-- 3. staff. hr_leave_balances (72 rows) cascades from here.
DELETE FROM public.staff WHERE id IN (SELECT staff_id FROM _purge_ids);

-- 4. profiles. user_roles (12) and user_notifications (12) cascade from here.
--    No auth.users rows exist for these ids, so the auth schema is untouched.
DELETE FROM public.profiles WHERE id IN (SELECT profile_id FROM _purge_ids);

COMMIT;
