-- ============================================================================
-- Campus Walk — routine check schedules (preventive maintenance seed)
-- Created: 2026-10-01
--
-- Director rulings, 30 Sep 2026: MyJKKN creates routine check jobs BY ITSELF
-- each month and sends them straight to the fixer (no approval). The daily
-- job app/api/cron/routine-checks reads resource_maintenance_schedules; this
-- file seeds those schedules from the Resource Management registry.
--
-- DATA ONLY. No table, column, function, policy or grant is created or
-- changed, so there is nothing to REVOKE. resource_maintenance_schedules
-- already has RLS enabled (supabase/setup/03_policies.sql).
--
-- Evidence: old InstaSolver data, 2,019 reports Nov 2024 – Sep 2026
-- (artifacts/2026-09-30-old-instasolver-repeat-faults.html). About 1 fix in 6
-- failed again within 90 days; electrical and plumbing faults peak Oct–Nov.
--
-- THE RULES (every college; one schedule per item; every 30 days)
-- ┌────┬──────────────────────────────────────────────┬────────────────────────────────────┬──────────────────────────────────────────────┬───────┬────────────┐
-- │ #  │ Items (parent category / sub-category)        │ What to check                      │ Why (repeat reports in old InstaSolver)      │ Items │ First due  │
-- ├────┼──────────────────────────────────────────────┼────────────────────────────────────┼──────────────────────────────────────────────┼───────┼────────────┤
-- │ R1 │ IT & Digital Resources / Computers           │ PC + UPS test                      │ Arts SF multidisciplinary block labs: 68;    │   38  │ apply day  │
-- │ R2 │ Laboratories / Computer Lab,                 │ PC + UPS test                      │ Engineering CSE/IT labs: 23                  │    8  │ apply day  │
-- │    │               AI & Data Science Lab          │                                    │                                              │       │            │
-- │ R3 │ IT & Digital Resources / Printers & Scanners │ Toner stock / refill               │ Pharmacy office printers: 28                 │    4  │ apply day  │
-- │ R4 │ Laboratories / every other sub-category      │ Fans, lights, sockets, taps, kit   │ Director spec "Laboratories: monthly";       │   48  │ apply + 7  │
-- │    │                                              │                                    │ electrical + plumbing peak Oct–Nov           │       │            │
-- │ R5 │ any sub-category named like "hostel"         │ Fans, lights, taps                 │ Boys Hostel rooms: 28; Girls Hostel A: 18    │    0  │ apply day  │
-- └────┴──────────────────────────────────────────────┴────────────────────────────────────┴──────────────────────────────────────────────┴───────┴────────────┘
-- "Items" = matching rows in production on 30 Sep 2026 (554 resources, 8
-- colleges, all status 'available'). R5 matches NOTHING today: no hostel room
-- is registered in Resource Management (hostel rooms live in Campus Living).
-- The rule is kept so it applies if hostel rooms are ever registered and this
-- file's statements are re-run; it seeds zero rows now.
-- R4 starts a week after the others so the first month's jobs arrive in two
-- smaller batches instead of one.
--
-- First due date = the date in INDIA on the day this runs (the database's
-- CURRENT_DATE is UTC). The daily job acts ONLY on rows carrying one of the
-- five texts below (lib/campus-walk/routine-checks.ts SEEDED_ROUTINE_CHECK_TEXTS;
-- a unit test keeps them identical) — change a text here and there together.
--
-- Owner is NOT stored here (assigned_to_user_id stays NULL): the daily job
-- resolves caretaker → estate office (EAO) → principal at the moment it
-- creates each job, so a caretaker change is honoured automatically.
--
-- IDEMPOTENT: an item that already has a 'preventive' schedule is skipped, so
-- re-running this file adds nothing, and a schedule someone created on the
-- maintenance screen is never duplicated. Retired / inactive items are skipped.
-- ============================================================================

-- R1 — computers: monthly PC + UPS test
INSERT INTO public.resource_maintenance_schedules
  (resource_id, maintenance_type, frequency_days, next_maintenance_date, is_active,
   reminder_days_before, description)
SELECT r.id, 'preventive', 30, (now() AT TIME ZONE 'Asia/Kolkata')::date, true, 0,
       'Monthly PC + UPS test: switch on each computer, check it boots, keyboard, mouse and screen work, and the UPS keeps it running when mains power is switched off.'
FROM public.resources r
JOIN public.resource_parent_categories pc ON pc.id = r.parent_category_id
JOIN public.resource_sub_categories sc ON sc.id = r.subcategory_id
WHERE lower(btrim(pc.name)) = 'it & digital resources'
  AND lower(btrim(sc.name)) = 'computers'
  AND r.status::text NOT IN ('retired', 'inactive')
  AND NOT EXISTS (
    SELECT 1 FROM public.resource_maintenance_schedules s
    WHERE s.resource_id = r.id AND s.maintenance_type = 'preventive'
  );

-- R2 — computer labs: monthly PC + UPS test
INSERT INTO public.resource_maintenance_schedules
  (resource_id, maintenance_type, frequency_days, next_maintenance_date, is_active,
   reminder_days_before, description)
SELECT r.id, 'preventive', 30, (now() AT TIME ZONE 'Asia/Kolkata')::date, true, 0,
       'Monthly PC + UPS test for the whole room: switch on every computer, check it boots, keyboard, mouse and screen work, and each UPS keeps its computers running when mains power is switched off.'
FROM public.resources r
JOIN public.resource_parent_categories pc ON pc.id = r.parent_category_id
JOIN public.resource_sub_categories sc ON sc.id = r.subcategory_id
WHERE lower(btrim(pc.name)) = 'laboratories'
  AND lower(btrim(sc.name)) IN ('computer lab', 'ai & data science lab')
  AND r.status::text NOT IN ('retired', 'inactive')
  AND NOT EXISTS (
    SELECT 1 FROM public.resource_maintenance_schedules s
    WHERE s.resource_id = r.id AND s.maintenance_type = 'preventive'
  );

-- R3 — printers: monthly toner check
INSERT INTO public.resource_maintenance_schedules
  (resource_id, maintenance_type, frequency_days, next_maintenance_date, is_active,
   reminder_days_before, description)
SELECT r.id, 'preventive', 30, (now() AT TIME ZONE 'Asia/Kolkata')::date, true, 0,
       'Monthly printer check: print a test page, check the toner level and that a spare toner or refill is in stock.'
FROM public.resources r
JOIN public.resource_parent_categories pc ON pc.id = r.parent_category_id
JOIN public.resource_sub_categories sc ON sc.id = r.subcategory_id
WHERE lower(btrim(pc.name)) = 'it & digital resources'
  AND lower(btrim(sc.name)) = 'printers & scanners'
  AND r.status::text NOT IN ('retired', 'inactive')
  AND NOT EXISTS (
    SELECT 1 FROM public.resource_maintenance_schedules s
    WHERE s.resource_id = r.id AND s.maintenance_type = 'preventive'
  );

-- R4 — every other laboratory: monthly check
INSERT INTO public.resource_maintenance_schedules
  (resource_id, maintenance_type, frequency_days, next_maintenance_date, is_active,
   reminder_days_before, description)
SELECT r.id, 'preventive', 30, (now() AT TIME ZONE 'Asia/Kolkata')::date + 7, true, 0,
       'Monthly room check: fans, lights and power sockets work; taps and drains do not leak; the equipment switches on and responds.'
FROM public.resources r
JOIN public.resource_parent_categories pc ON pc.id = r.parent_category_id
LEFT JOIN public.resource_sub_categories sc ON sc.id = r.subcategory_id
WHERE lower(btrim(pc.name)) = 'laboratories'
  AND lower(btrim(coalesce(sc.name, ''))) NOT IN ('computer lab', 'ai & data science lab')
  AND r.status::text NOT IN ('retired', 'inactive')
  AND NOT EXISTS (
    SELECT 1 FROM public.resource_maintenance_schedules s
    WHERE s.resource_id = r.id AND s.maintenance_type = 'preventive'
  );

-- R5 — hostel rooms: monthly fans / lights / taps (matches 0 items on 30 Sep 2026)
INSERT INTO public.resource_maintenance_schedules
  (resource_id, maintenance_type, frequency_days, next_maintenance_date, is_active,
   reminder_days_before, description)
SELECT r.id, 'preventive', 30, (now() AT TIME ZONE 'Asia/Kolkata')::date, true, 0,
       'Monthly hostel check: every fan and light works, taps and flushes do not leak.'
FROM public.resources r
JOIN public.resource_sub_categories sc ON sc.id = r.subcategory_id
WHERE lower(sc.name) LIKE '%hostel%'
  AND r.status::text NOT IN ('retired', 'inactive')
  AND NOT EXISTS (
    SELECT 1 FROM public.resource_maintenance_schedules s
    WHERE s.resource_id = r.id AND s.maintenance_type = 'preventive'
  );
