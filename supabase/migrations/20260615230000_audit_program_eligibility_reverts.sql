-- TEMPORARY forensic audit on hostel_program_eligibility category/gender changes — to
-- pinpoint what keeps reverting the BDS 4.0-4.4L band (ruled out: committed seeds, DB
-- functions, the normalize trigger, and pg_cron). Captures the exact statement, DB role,
-- app user, application name and client IP per category/gender change.
-- REMOVE once the external source (admin UI save vs ad-hoc SQL session) is identified:
--   DROP TRIGGER trg_audit_prog_elig ON public.hostel_program_eligibility;
--   DROP FUNCTION public._audit_prog_elig_changes();   DROP TABLE public._audit_hostel_program_eligibility;
CREATE TABLE IF NOT EXISTS public._audit_hostel_program_eligibility (
  id            bigserial PRIMARY KEY,
  op            text,
  band_id       uuid,
  old_room_category_id uuid,
  new_room_category_id uuid,
  old_hostel_type text,
  new_hostel_type text,
  db_role       text,
  session_role  text,
  app_user      uuid,
  app_name      text,
  client_addr   inet,
  query         text,
  changed_at    timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION public._audit_prog_elig_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid; v_bid uuid; v_orc uuid; v_nrc uuid; v_oht text; v_nht text;
BEGIN
  BEGIN v_uid := auth.uid(); EXCEPTION WHEN OTHERS THEN v_uid := NULL; END;
  IF TG_OP = 'INSERT' THEN
    v_bid := NEW.id; v_nrc := NEW.room_category_id; v_nht := NEW.hostel_type;
  ELSIF TG_OP = 'DELETE' THEN
    v_bid := OLD.id; v_orc := OLD.room_category_id; v_oht := OLD.hostel_type;
  ELSE
    IF NEW.room_category_id IS NOT DISTINCT FROM OLD.room_category_id
       AND NEW.hostel_type IS NOT DISTINCT FROM OLD.hostel_type THEN
      RETURN NEW;
    END IF;
    v_bid := NEW.id; v_orc := OLD.room_category_id; v_nrc := NEW.room_category_id;
    v_oht := OLD.hostel_type; v_nht := NEW.hostel_type;
  END IF;
  INSERT INTO public._audit_hostel_program_eligibility (
    op, band_id, old_room_category_id, new_room_category_id, old_hostel_type, new_hostel_type,
    db_role, session_role, app_user, app_name, client_addr, query
  ) VALUES (
    TG_OP, v_bid, v_orc, v_nrc, v_oht, v_nht,
    current_user, session_user, v_uid,
    current_setting('application_name', true), inet_client_addr(), current_query()
  );
  RETURN COALESCE(NEW, OLD);
END $function$;

DROP TRIGGER IF EXISTS trg_audit_prog_elig ON public.hostel_program_eligibility;
CREATE TRIGGER trg_audit_prog_elig
  AFTER INSERT OR UPDATE OR DELETE ON public.hostel_program_eligibility
  FOR EACH ROW EXECUTE FUNCTION public._audit_prog_elig_changes();
