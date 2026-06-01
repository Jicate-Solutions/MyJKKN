-- Phase 6 fix — anon SELECT grant for the public QR student form.
--
-- The public /student-form page is anonymous. community_categories was missing
-- the anon table-level SELECT grant (only `authenticated` had it), so the
-- browser's anon client received 0 rows (no error) and the Community/Caste
-- dropdowns rendered empty even though the RLS policy was `USING(true)`.
-- Both the table GRANT and the RLS policy must allow anon. Re-grant both lookup
-- tables and reload the PostgREST schema cache.
grant usage on schema public to anon, authenticated;
grant select on public.community_categories to anon;
grant select on public.castes to anon;
notify pgrst, 'reload schema';
