-- The state production is in BEFORE the complaint-privacy migration, on top of
-- 00_stubs.sql + 05_preseed.sql + #4079's migration:
--   * the satisfaction columns (live, types/supabase.ts);
--   * the LIVE 10-character description constraint (defined by no migration);
--   * grievance_comments (production shape, types/supabase.ts);
--   * one legacy anonymous ticket that still carries its filer, and a comment
--     that filer wrote on it — what the backfill must scrub;
--   * one legacy anonymous ticket from the /accreditation form: raised_by_id
--     NULL, the filer only in filed_by, and a comment she wrote through the
--     filed_by comment branch — what the backfill must also scrub;
--   * custom_roles.institution_scope and user_institution_access (production
--     shape, types/supabase.ts), which fn_grievance_icc_reader_exists reads.
--   * grievance_history (production shape, types/supabase.ts; defined by no
--     migration), with rows the filers performed on their anonymous tickets and
--     a handler's row — the backfill must de-name the first and keep the last;
--   * a STAND-IN for a live-only history trigger that records auth.uid() as the
--     actor on every ticket UPDATE — the shape the rating path must not feed.
ALTER TABLE public.grievance_tickets
  ADD COLUMN IF NOT EXISTS satisfaction_rating integer,
  ADD COLUMN IF NOT EXISTS satisfaction_feedback text;
ALTER TABLE public.grievance_tickets
  ADD CONSTRAINT grievance_tickets_description_check CHECK (char_length(description) >= 10);

ALTER TABLE public.custom_roles ADD COLUMN IF NOT EXISTS institution_scope varchar(10) DEFAULT 'own';
CREATE TABLE public.user_institution_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id), access_type text NOT NULL DEFAULT 'full',
  is_active boolean NOT NULL DEFAULT true);

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

INSERT INTO grievance_tickets (id, institution_id, ticket_number, category_id, subject, description, raised_by_type,
  raised_by_id, filed_by, is_anonymous, anonymous_token, sla_deadline, status)
VALUES ('d1000000-0000-0000-0000-000000000005', '11000000-0000-0000-0000-000000000001', 'x', 'c1000000-0000-0000-0000-000000000001',
  'Legacy accreditation anonymous', 'Typed in on the accreditation form', 'staff',
  NULL, 'b0000000-0000-0000-0000-000000000003', true, 'anon_legacy_accr_token_000000000000000', now() + interval '3 days', 'open');
INSERT INTO grievance_comments (ticket_id, author_id, author_name, author_type, content) VALUES
  ('d1000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000003', 'Filer F', 'staff', 'Adding a date, from the form filer'),
  ('d1000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000002', 'Handler H', 'staff', 'Handler on the accreditation one');

CREATE TABLE public.grievance_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.grievance_tickets(id) ON DELETE CASCADE,
  action text NOT NULL, performed_by uuid, performed_at timestamptz DEFAULT now(),
  old_value text, new_value text);
GRANT SELECT ON public.grievance_history TO authenticated;  -- so the rehearsal can look, as the filer
INSERT INTO grievance_history (ticket_id, action, performed_by) VALUES
  ('d1000000-0000-0000-0000-000000000001', 'created',   'b0000000-0000-0000-0000-000000000003'),
  ('d1000000-0000-0000-0000-000000000001', 'commented', 'b0000000-0000-0000-0000-000000000002'),
  ('d1000000-0000-0000-0000-000000000005', 'created',   'b0000000-0000-0000-0000-000000000003');

CREATE FUNCTION public.stub_grievance_history_on_update() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO grievance_history (ticket_id, action, performed_by) VALUES (NEW.id, 'updated', auth.uid());
  RETURN NEW;
END $$;
CREATE TRIGGER stub_grievance_history_on_update AFTER UPDATE ON public.grievance_tickets
  FOR EACH ROW EXECUTE FUNCTION public.stub_grievance_history_on_update();
