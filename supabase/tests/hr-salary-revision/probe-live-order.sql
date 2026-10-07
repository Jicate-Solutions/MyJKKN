\ir probe-settled-common.sql
-- Review round 10 (8 Oct 2026, the reviewer's minor): today's live pass of
-- hr_target_schedule_needs takes the people least recently recorded on the day
-- itself first (never: first of all), not the lowest ids, so with more people in
-- play than the limit the same people are not left out of the live record every
-- night. Two people in the schedule ranges on M6, neither recorded on M6: the
-- lower id last recorded live on the day before, the higher id two days before.
\set sA '00000000-0000-0000-0000-000000020002'
\set sB '00000000-0000-0000-0000-000000020023'
SELECT count(*) AS both_in FROM public.hr_target_schedule_ranges(:'m6') WHERE staff_id IN (:'sA', :'sB') \gset
DELETE FROM public.hr_target_scheduled_periods WHERE staff_id IN (:'sA', :'sB') AND day >= (:'m6'::date - 2);
UPDATE public.hr_target_scheduled_periods SET recorded_live = false WHERE staff_id IN (:'sA', :'sB');
SELECT public.hr_target_schedule_record(:'sA', (:'m6'::date - 1), '[]'::jsonb, 'probe', (:'m6'::date - 1)) AS ra \gset
SELECT public.hr_target_schedule_record(:'sB', (:'m6'::date - 2), '[]'::jsonb, 'probe', (:'m6'::date - 2)) AS rb \gset
SELECT t.info('R10-L live rows on m6: ' || (SELECT string_agg(n.staff_id::text || '#' || n.ord, ' ' ORDER BY n.ord)
  FROM public.hr_target_schedule_needs(:'m6', 1000) WITH ORDINALITY n(staff_id, day, institution_ids, reason, holiday_key, ord)
 WHERE n.reason = 'live'));
SELECT t.check('R10-L today''s live pass takes the people least recently recorded on the day itself first, not the lowest ids',
  :'both_in'::int = 2
  AND (SELECT min(n.ord) FILTER (WHERE n.staff_id = :'sB') < min(n.ord) FILTER (WHERE n.staff_id = :'sA')
         FROM public.hr_target_schedule_needs(:'m6', 1000) WITH ORDINALITY n(staff_id, day, institution_ids, reason, holiday_key, ord)
        WHERE n.reason = 'live'));
