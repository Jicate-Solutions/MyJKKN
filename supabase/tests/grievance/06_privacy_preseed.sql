-- The state production is in BEFORE the anonymity / tracking migration
-- (20271010030000), on top of 00_stubs.sql + 05_preseed.sql + #4079's
-- migration. Carried from PR #4156 (06_privacy_preseed.sql), minus the ICC
-- reader fixtures and the 10-character description rule (those rulings are
-- not carried), and minus grievance_comments / grievance_history, which
-- 00_stubs.sql now creates:
--   * the satisfaction columns (live, types/supabase.ts);
--   * one legacy anonymous ticket that still carries its filer, and a comment
--     that filer wrote on it — what the backfill must scrub;
--   * one legacy anonymous ticket from the /accreditation form: raised_by_id
--     NULL, the filer only in filed_by, and a comment she wrote — scrubbed too;
--   * grievance_history rows the filers performed on their anonymous tickets
--     and a handler's row — the backfill must de-name the first, keep the last;
--   * a STAND-IN for a live-only history trigger that records auth.uid() as the
--     actor on every ticket UPDATE, and logs changed filer columns into
--     old_value / new_value — the shapes the scrub and the rating must not feed.
ALTER TABLE public.grievance_tickets
  ADD COLUMN IF NOT EXISTS satisfaction_rating integer,
  ADD COLUMN IF NOT EXISTS satisfaction_feedback text;

INSERT INTO institutions (id, name) VALUES
  ('11000000-0000-0000-0000-000000000001', 'College P');
INSERT INTO profiles (id, email, full_name, role, is_super_admin, institution_id) VALUES
  ('b0000000-0000-0000-0000-000000000002', 'handler@jkkn.ac.in',  'Handler H',     'handler', false, '11000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000003', 'filer@jkkn.ac.in',    'Filer F',       'staff', false, '11000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000004', 'other@jkkn.ac.in',    'Other O',       'staff', false, '11000000-0000-0000-0000-000000000001');
INSERT INTO custom_roles (role_key, role_name, permissions) VALUES
  ('handler', 'Grievance handler', '{"grievance.tickets.view": true, "grievance.tickets.edit": true}');
INSERT INTO grievance_categories (id, institution_id, name, default_sla_hours) VALUES
  ('c1000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'Other', 240);

INSERT INTO grievance_tickets (id, institution_id, ticket_number, category_id, subject, description, raised_by_type,
  raised_by_id, raised_by_name, raised_by_email, raised_by_phone, is_anonymous, anonymous_token, sla_deadline, status)
VALUES ('d1000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'x', 'c1000000-0000-0000-0000-000000000001',
  'Legacy anonymous', 'Filed before the scrub existed', 'staff',
  'b0000000-0000-0000-0000-000000000003', 'Filer F', 'filer_f@jkkn.ac.in', NULL, true, 'anon_legacy_token_000000000000000000', now() + interval '3 days', 'open');
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

INSERT INTO grievance_history (ticket_id, action, performed_by) VALUES
  ('d1000000-0000-0000-0000-000000000001', 'created',   'b0000000-0000-0000-0000-000000000003'),
  ('d1000000-0000-0000-0000-000000000001', 'commented', 'b0000000-0000-0000-0000-000000000002'),
  ('d1000000-0000-0000-0000-000000000005', 'created',   'b0000000-0000-0000-0000-000000000003');
-- Field-level rows an earlier edit left: one names the filer in new_value (must
-- be cleared), one is a handler's status change (must be kept).
INSERT INTO grievance_history (ticket_id, action, performed_by, old_value, new_value) VALUES
  ('d1000000-0000-0000-0000-000000000001', 'raised_by_name set', 'b0000000-0000-0000-0000-000000000002', NULL, 'FILER F (staff)'),
  ('d1000000-0000-0000-0000-000000000001', 'status changed',     'b0000000-0000-0000-0000-000000000002', 'open', 'in_progress');

CREATE FUNCTION public.stub_grievance_history_on_update() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO grievance_history (ticket_id, action, performed_by) VALUES (NEW.id, 'updated', auth.uid());
  -- Field-level change logging, the shape that would put the filer into
  -- old_value when the migration scrubs her off the ticket.
  IF OLD.raised_by_id IS DISTINCT FROM NEW.raised_by_id THEN
    INSERT INTO grievance_history (ticket_id, action, performed_by, old_value, new_value)
    VALUES (NEW.id, 'raised_by_id', auth.uid(), OLD.raised_by_id::text, NEW.raised_by_id::text);
  END IF;
  IF OLD.raised_by_name IS DISTINCT FROM NEW.raised_by_name THEN
    INSERT INTO grievance_history (ticket_id, action, performed_by, old_value, new_value)
    VALUES (NEW.id, 'raised_by_name', auth.uid(), OLD.raised_by_name, NEW.raised_by_name);
  END IF;
  IF OLD.raised_by_email IS DISTINCT FROM NEW.raised_by_email THEN
    INSERT INTO grievance_history (ticket_id, action, performed_by, old_value, new_value)
    VALUES (NEW.id, 'raised_by_email', auth.uid(), OLD.raised_by_email, NEW.raised_by_email);
  END IF;
  IF OLD.filed_by IS DISTINCT FROM NEW.filed_by THEN
    INSERT INTO grievance_history (ticket_id, action, performed_by, old_value, new_value)
    VALUES (NEW.id, 'filed_by', auth.uid(), OLD.filed_by::text, NEW.filed_by::text);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER stub_grievance_history_on_update AFTER UPDATE ON public.grievance_tickets
  FOR EACH ROW EXECUTE FUNCTION public.stub_grievance_history_on_update();
