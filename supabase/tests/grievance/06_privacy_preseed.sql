-- The state production is in BEFORE the complaint-privacy migration, on top of
-- 00_stubs.sql + 05_preseed.sql + #4079's migration:
--   * the satisfaction columns (live, types/supabase.ts);
--   * the LIVE 10-character description constraint (defined by no migration);
--   * grievance_comments (production shape, types/supabase.ts);
--   * one legacy anonymous ticket that still carries its filer, and a comment
--     that filer wrote on it — what the backfill must scrub.
ALTER TABLE public.grievance_tickets
  ADD COLUMN IF NOT EXISTS satisfaction_rating integer,
  ADD COLUMN IF NOT EXISTS satisfaction_feedback text;
ALTER TABLE public.grievance_tickets
  ADD CONSTRAINT grievance_tickets_description_check CHECK (char_length(description) >= 10);

CREATE TABLE public.grievance_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.grievance_tickets(id) ON DELETE CASCADE,
  author_id uuid, author_name varchar NOT NULL, author_type varchar NOT NULL,
  content text NOT NULL, is_internal boolean DEFAULT false, created_at timestamptz DEFAULT now());

INSERT INTO institutions (id, name) VALUES
  ('11000000-0000-0000-0000-000000000001', 'College With ICC'),
  ('11000000-0000-0000-0000-000000000002', 'College Without ICC');
INSERT INTO profiles (id, email, full_name, role, is_super_admin, institution_id) VALUES
  -- the superior-route person: deliberately NOT a super admin or admin, to
  -- prove the routed-assignee policy is what lets her open an ICC-only row.
  ('b0000000-0000-0000-0000-000000000001', 'jointmd@jkkn.ac.in',  'Joint MD',      'staff', false, NULL),
  ('b0000000-0000-0000-0000-000000000002', 'handler@jkkn.ac.in',  'Handler H',     'handler', false, '11000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000003', 'filer@jkkn.ac.in',    'Filer F',       'staff', false, '11000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000004', 'other@jkkn.ac.in',    'Other O',       'staff', false, '11000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000005', 'plain.as@jkkn.ac.in', 'Plain Assignee','staff', false, '11000000-0000-0000-0000-000000000002');
INSERT INTO custom_roles (role_key, role_name, permissions) VALUES
  ('handler', 'Grievance handler', '{"grievance.tickets.view": true, "grievance.tickets.edit": true}');
INSERT INTO grievance_categories (id, institution_id, name, default_sla_hours) VALUES
  ('c1000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'Other', 240),
  ('c1000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000002', 'Sexual Harassment (ICC)', 72);

INSERT INTO grievance_tickets (id, institution_id, ticket_number, category_id, subject, description, raised_by_type,
  raised_by_id, raised_by_name, raised_by_email, raised_by_phone, is_anonymous, anonymous_token, sla_deadline, status)
VALUES ('d1000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'x', 'c1000000-0000-0000-0000-000000000001',
  'Legacy anonymous', 'Filed before the scrub existed', 'staff',
  'b0000000-0000-0000-0000-000000000003', NULL, NULL, NULL, true, 'anon_legacy_token_000000000000000000', now() + interval '3 days', 'open');
INSERT INTO grievance_comments (ticket_id, author_id, author_name, author_type, content) VALUES
  ('d1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', 'Filer F', 'staff', 'More detail from me'),
  ('d1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'Handler H', 'staff', 'Looking into it');
