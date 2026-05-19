-- ---------------------------------------------------------------------
-- CDC seed — populate cdc_workshop_types with 8 placement-prep categories
-- ---------------------------------------------------------------------
-- Workstream B2: substrate left this master table empty for "phase-2
-- school workshop feature." We're seeding the placement-prep categories
-- now so the workshop module (when it ships) has the standard catalogue
-- ready, and so the master-data admin UI has rows to show.
--
-- Aligned with the existing seed style in
-- 20260518_cdc_substrate_01_masters_enums_roles_policies.sql
-- (cdc_drive_types / cdc_industry_sectors / cdc_offer_types).
--
-- Idempotent: ON CONFLICT (config_key) DO NOTHING — re-running is safe.
-- ---------------------------------------------------------------------

INSERT INTO public.cdc_workshop_types (config_key, display_name, description, is_system, sort_order) VALUES
  ('resume_workshop',      'Resume Workshop',           'CV building, formatting, tailoring per role.',                         true, 10),
  ('mock_interview',       'Mock Interview',            'Behavioural + technical practice rounds with feedback.',               true, 20),
  ('aptitude_bootcamp',    'Aptitude Bootcamp',         'Quantitative, logical and verbal reasoning preparation.',              true, 30),
  ('soft_skills',          'Soft Skills',               'Communication, presentation and teamwork training.',                   true, 40),
  ('gd_practice',          'Group Discussion Practice', 'Structured GD facilitation with peer + facilitator feedback.',         true, 50),
  ('coding_sprint',        'Coding Sprint',             'DSA and competitive programming intensive.',                           true, 60),
  ('hr_round_prep',        'HR Round Prep',             'Salary, expectations and gap-explanation interview prep.',             true, 70),
  ('salary_negotiation',   'Salary Negotiation',        'Offer evaluation and counter-offer strategy workshop.',                true, 80)
ON CONFLICT (config_key) DO NOTHING;
