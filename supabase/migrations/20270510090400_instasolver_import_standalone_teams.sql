-- =============================================================================
-- InstaSolver — import the standalone app's categories, maintenance teams and
-- members  (2026-10-01)
--
-- Source: the live standalone InstaSolver (Supabase xbodlspdmecprphtjflt), read
-- on 2026-10-01. Without this the desk had no teams, so "Assign team" /
-- "Assign member" had nobody to offer and no "My work" queue existed.
--
--   · Categories: every standalone category (both kinds) with its description,
--     order and active flag — including the ones added there after the seed
--     (Plumbing, Water Supply, Carpentry, Civil Works, Sports and Games, Gym,
--     ID Cards, Flex Printing). "Plumbing and Water Supply" is inactive there
--     and so here. The E2E fixture "Assignment authority test" is not copied.
--   · Teams: all 17 real teams, each with the category it covers and its
--     email. The test team "testing" (aiarts@) is not copied. All are
--     organisation-wide (institution NULL), as in the standalone.
--   · Members: matched to MyJKKN profiles by EMAIL, active profiles only.
--     (The standalone's myjkkn_user_id values are not MyJKKN profile ids.)
--     Not matched, so not added — they have no active MyJKKN login:
--       vanitha.r@ (House Keeping supervisor), pradeepraj.jns@ (Plumping
--       Supervisor), girlshostel@ (Flex Printing), hamsaveni@ (Girls Hostel
--       Supervisor), and nandhagopalan@ whose MyJKKN profile is INACTIVE
--       (Electrical, Furniture, Water Supply). Add them from
--       /instasolver/admin/teams once their accounts exist / are active.
--
-- Idempotent: categories upsert on (kind, name), teams skip on name,
-- memberships skip on (team_id, user_id). No issues are imported here.
-- =============================================================================

INSERT INTO public.instasolver_categories (kind, name, description, sort_order, is_active) VALUES
  ('issue', 'Electrical', 'Power, lighting, wiring, fans and fittings', 10, true),
  ('issue', 'Plumbing and Water Supply', 'Taps, pipes, drainage, water purifiers and tanks', 20, false),
  ('issue', 'Computer, IT and CCTV Equipment', 'Desktops, projectors, printers, CCTV cameras and peripherals', 40, true),
  ('issue', 'Furniture', 'Desks, seating, cupboards and fixtures', 50, true),
  ('issue', 'Learning Studio Maintenance', 'Condition of learning studios: boards, doors, windows, flooring', 60, true),
  ('issue', 'Learning Lab Equipment', 'Instruments, apparatus and equipment in the learning labs', 70, true),
  ('issue', 'Learning Auditorium Facilities', 'Seating, stage, acoustics and audio-visual equipment', 80, true),
  ('issue', 'Learning Commons', 'Reading spaces, shelving, catalogues and quiet study areas', 90, true),
  ('issue', 'Air Conditioning and Ventilation', 'Air conditioning, exhaust and ventilation', 100, true),
  ('issue', 'Housekeeping and Sanitation', 'Cleaning, waste, washrooms and hygiene', 110, true),
  ('issue', 'Hostel Facilities', 'Residential blocks, rooms, mess and common areas', 120, true),
  ('issue', 'Safety and Security', 'Fire safety, alarms, access control and surveillance', 130, true),
  ('issue', 'Transport', 'Buses, vehicles, parking and transport scheduling', 140, true),
  ('issue', 'Grounds and Landscaping', 'Playing fields, pathways, gardens and outdoor lighting', 150, true),
  ('issue', 'Learner Concern', 'Facility concerns raised on behalf of learners', 160, true),
  ('issue', 'Senior Learner Request', 'Facility requests raised by Senior Learners', 170, true),
  ('issue', 'Team Member Facilities', 'Work areas, rest areas and amenities for team members', 180, true),
  ('issue', 'Plumbing', 'Taps, pipes, drains and blockages', 190, true),
  ('issue', 'Water Supply', 'RO plant and water supply to buildings', 200, true),
  ('issue', 'Carpentry', 'Wooden fittings, doors and repairs', 210, true),
  ('issue', 'Civil Works', 'Building fabric, masonry and structural repairs', 220, true),
  ('issue', 'Sports and Games', 'Sports facilities, equipment and events', 230, true),
  ('issue', 'Gym', 'Gym equipment and facilities', 240, true),
  ('issue', 'ID Cards', 'Printing and issue of identity cards', 250, true),
  ('issue', 'Flex Printing', 'Design, approval, printing and erection of flex', 260, true),
  ('issue', 'Other', 'Anything that does not fit the categories above', 999, true),
  ('requirement', 'Computer, IT and CCTV Equipment', 'Hardware, peripherals, CCTV cameras and networking equipment', 10, true),
  ('requirement', 'Software and Licences', 'Applications, subscriptions and licence renewals', 20, true),
  ('requirement', 'Learning Lab Equipment', 'Instruments and apparatus for the learning labs', 30, true),
  ('requirement', 'Learning Lab Consumables', 'Reagents, glassware, disposables and consumable stock', 40, true),
  ('requirement', 'Medical and Clinical Supplies', 'Clinical consumables, instruments and dressings', 50, true),
  ('requirement', 'Furniture', 'Desks, seating, storage and fixtures', 60, true),
  ('requirement', 'Books and Journals', 'Titles, subscriptions and reference material', 70, true),
  ('requirement', 'Stationery and Printing', 'Office supplies, printing and reprographics', 80, true),
  ('requirement', 'Electrical Fittings', 'Fittings, fixtures and electrical spares', 90, true),
  ('requirement', 'Maintenance Spares', 'Spare parts for building and equipment upkeep', 100, true),
  ('requirement', 'Housekeeping Supplies', 'Cleaning materials, hygiene and waste supplies', 110, true),
  ('requirement', 'Sports Equipment', 'Equipment and kit for sports and physical activity', 120, true),
  ('requirement', 'Audio Visual Equipment', 'Projectors, displays, microphones and sound systems', 130, true),
  ('requirement', 'Other', 'Anything that does not fit the categories above', 999, true)
ON CONFLICT (kind, name) DO UPDATE SET description = EXCLUDED.description, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- MyJKKN seeded these two under their pre-rename / pre-split names; the standalone retired them.
UPDATE public.instasolver_categories SET is_active = FALSE WHERE kind = 'requirement' AND name = 'Computer and IT Equipment';

INSERT INTO public.instasolver_maintenance_teams (name, description, email, is_active, category_id) VALUES
  ('System Administrator', 'Computer Systems, Printers, Xerox Machines, Networking, Internet, Camera,  LAN work, Biometric Machines', 'kavinkumar_d@jkkn.ac.in', true, (SELECT id FROM public.instasolver_categories WHERE kind = 'issue' AND name = 'Computer, IT and CCTV Equipment')),
  ('Electrical Supervisor', 'All Electrical Related Work, Fan, Light, etc & Plumbing Related Work', 'nandhagopalan@jkkn.ac.in', true, (SELECT id FROM public.instasolver_categories WHERE kind = 'issue' AND name = 'Electrical')),
  ('Dental Hospital Manager', 'All issues related to Dental Chairs, Out Patient Issues', 'sureshs@jkkn.ac.in', true, (SELECT id FROM public.instasolver_categories WHERE kind = 'issue' AND name = 'Learning Lab Equipment')),
  ('Furniture Maintenance Supervisor', 'All Wooden and Steel Furniture related issues', 'nandhagopalan@jkkn.ac.in', true, (SELECT id FROM public.instasolver_categories WHERE kind = 'issue' AND name = 'Furniture')),
  ('Transport Supervisor', 'All Bus related issues', 'sekar.s@jkkn.ac.in', true, (SELECT id FROM public.instasolver_categories WHERE kind = 'issue' AND name = 'Transport')),
  ('House Keeping supervisor', 'Supervising all cleaning issues', 'vanitha.r@jkkn.ac.in', true, (SELECT id FROM public.instasolver_categories WHERE kind = 'issue' AND name = 'Housekeeping and Sanitation')),
  ('Plumping Supervisor', 'Supervice All Plumbing issues', 'pradeepraj.jns@jkkn.ac.in', true, (SELECT id FROM public.instasolver_categories WHERE kind = 'issue' AND name = 'Plumbing')),
  ('Water Supply', 'To monitor RO water supply and water supply to all places.', 'nandhagopalan@jkkn.ac.in', true, (SELECT id FROM public.instasolver_categories WHERE kind = 'issue' AND name = 'Water Supply')),
  ('Civil Maintenance Supervisor', 'All civil related works', 'krishnakumar_r@jkkn.ac.in', true, (SELECT id FROM public.instasolver_categories WHERE kind = 'issue' AND name = 'Civil Works')),
  ('ID Cards Supply and Issue', 'DEALS ALL COOEGES ID CARD PRINTING AND ISSUES', 'dhuraimurugan.g@jkkn.ac.in', true, (SELECT id FROM public.instasolver_categories WHERE kind = 'issue' AND name = 'ID Cards')),
  ('Flex Printing', 'To Design and get approval from management, follow the printing process and arrange errection.', 'girlshostel@jkkn.ac.in', true, (SELECT id FROM public.instasolver_categories WHERE kind = 'issue' AND name = 'Flex Printing')),
  ('Sports and Games', 'Resposible for conducting sports and Games Events and Short out the students grivences', 'sathish.s@jkkn.ac.in', true, (SELECT id FROM public.instasolver_categories WHERE kind = 'issue' AND name = 'Sports and Games')),
  ('Gym Maintenance', 'Supervice Gym related issues', 'sathish.s@jkkn.ac.in', true, (SELECT id FROM public.instasolver_categories WHERE kind = 'issue' AND name = 'Gym')),
  ('Carpentry Supervisor', NULL, 'krishnakumar_r@jkkn.ac.in', true, (SELECT id FROM public.instasolver_categories WHERE kind = 'issue' AND name = 'Carpentry')),
  ('Boys Hostel Warden', NULL, 'boyshostel@jkkn.ac.in', true, (SELECT id FROM public.instasolver_categories WHERE kind = 'issue' AND name = 'Hostel Facilities')),
  ('Girls Hostel Supervisor', NULL, 'hamsaveni@jkkn.ac.in', true, (SELECT id FROM public.instasolver_categories WHERE kind = 'issue' AND name = 'Hostel Facilities')),
  ('LAB EQUIPMENTS PURCHASE AND COMPLAINTS ENGINEERING COLLEGE', 'NEED TO CALL FOR QUOTQTION FROM 3 VENDORS', 'radhakrishnan.t@jkkn.ac.in', true, (SELECT id FROM public.instasolver_categories WHERE kind = 'issue' AND name = 'Learning Lab Equipment'))
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.instasolver_team_members (team_id, user_id, is_team_lead)
SELECT t.id, p.id, m.lead
FROM (VALUES
  ('System Administrator', 'kavinkumar_d@jkkn.ac.in', false),
  ('System Administrator', 'sampath.v@jkkn.ac.in', false),
  ('System Administrator', 'sakthivel_mr@jkkn.ac.in', false),
  ('Electrical Supervisor', 'nandhagopalan@jkkn.ac.in', false),
  ('Dental Hospital Manager', 'sureshs@jkkn.ac.in', false),
  ('Furniture Maintenance Supervisor', 'nandhagopalan@jkkn.ac.in', false),
  ('Transport Supervisor', 'sekar.s@jkkn.ac.in', false),
  ('House Keeping supervisor', 'vanitha.r@jkkn.ac.in', false),
  ('Plumping Supervisor', 'pradeepraj.jns@jkkn.ac.in', false),
  ('Water Supply', 'nandhagopalan@jkkn.ac.in', false),
  ('Civil Maintenance Supervisor', 'krishnakumar_r@jkkn.ac.in', false),
  ('ID Cards Supply and Issue', 'dhuraimurugan.g@jkkn.ac.in', false),
  ('Flex Printing', 'girlshostel@jkkn.ac.in', false),
  ('Sports and Games', 'sathish.s@jkkn.ac.in', false),
  ('Gym Maintenance', 'sathish.s@jkkn.ac.in', false),
  ('Carpentry Supervisor', 'krishnakumar_r@jkkn.ac.in', false),
  ('Boys Hostel Warden', 'boyshostel@jkkn.ac.in', false),
  ('Girls Hostel Supervisor', 'hamsaveni@jkkn.ac.in', false),
  ('LAB EQUIPMENTS PURCHASE AND COMPLAINTS ENGINEERING COLLEGE', 'radhakrishnan.t@jkkn.ac.in', false)
) AS m(team_name, email, lead)
JOIN public.instasolver_maintenance_teams t ON t.name = m.team_name
JOIN public.profiles p ON lower(p.email) = m.email AND p.is_active
ON CONFLICT (team_id, user_id) DO NOTHING;
