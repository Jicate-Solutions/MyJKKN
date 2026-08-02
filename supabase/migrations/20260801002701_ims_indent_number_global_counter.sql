-- Fix: indent numbers collide across stores.
--
-- ims_indent_requests.indent_number is GLOBALLY UNIQUE and formatted
-- 'IND-YYMMDD-NNNNN' — it carries no store discriminator. But
-- ims_next_indent_number() drew NNNNN from a counter keyed
-- (store_id, counter_date), so the first indent of the day at EVERY store is
-- 00001.
--
-- With a single store per institution that never collided. Phase 1 made
-- multi-store real, and this now 23505s on the second store to raise an indent
-- on any given day. Reproduced live: JKKN Pharmacy held IND-260728-00001 and a
-- Dental warehouse push failed on ims_indent_requests_indent_number_key.
--
-- It also fails quietly. ImsIndentService.generateIndentNumber() catches the
-- error and falls back to `IND-<yymmdd>-<last 5 digits of Date.now()>`, so the
-- user gets a junk indent number instead of an error.
--
-- Fixed at the source so both callers — ImsIndentService.createIndent and
-- ims_create_push_transfer — are corrected at once. Counting per DATE globally
-- matches what the format already promises. Numbers stay 'IND-YYMMDD-NNNNN'
-- and stay chronological; they are simply no longer restarted per store.
--
-- ims_indent_number_counters (the old per-store table) is left in place: it is
-- historical record, and dropping it would lose the per-store issue history.

CREATE TABLE IF NOT EXISTS public.ims_indent_number_counters_global (
  counter_date date    PRIMARY KEY,
  last_number  integer NOT NULL DEFAULT 0
);

ALTER TABLE public.ims_indent_number_counters_global ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ims_indent_number_counters_global IS
  'One row per date; supplies the globally-unique NNNNN in IND-YYMMDD-NNNNN. Written only by ims_next_indent_number() (SECURITY DEFINER), hence RLS with no policies.';

-- Seed from numbers already issued so an existing one can never be re-issued.
INSERT INTO public.ims_indent_number_counters_global (counter_date, last_number)
SELECT to_date(substring(indent_number FROM 5 FOR 6), 'YYMMDD'),
       max((substring(indent_number FROM 12 FOR 5))::int)
  FROM public.ims_indent_requests
 WHERE indent_number ~ '^IND-\d{6}-\d{5}$'
 GROUP BY 1
ON CONFLICT (counter_date) DO UPDATE
   SET last_number = GREATEST(
         public.ims_indent_number_counters_global.last_number, EXCLUDED.last_number);

CREATE OR REPLACE FUNCTION public.ims_next_indent_number(
  p_store_id uuid,
  p_date     date DEFAULT CURRENT_DATE
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_next INTEGER;
BEGIN
    -- p_store_id is retained for signature compatibility with existing callers
    -- but deliberately unused: the number it feeds is globally unique, so the
    -- counter must be global too. The single-statement upsert is atomic, so
    -- concurrent callers at different stores cannot draw the same number.
    INSERT INTO public.ims_indent_number_counters_global (counter_date, last_number)
    VALUES (p_date, 1)
    ON CONFLICT (counter_date)
    DO UPDATE SET last_number = public.ims_indent_number_counters_global.last_number + 1
    RETURNING last_number INTO v_next;

    RETURN v_next;
END;
$function$;

-- Lock anon. The counter table is written ONLY by ims_next_indent_number()
-- (SECURITY DEFINER, runs as owner), and nothing reads it through PostgREST —
-- so it gets no grants at all, matching the "RLS with no policies" note above.
REVOKE ALL ON TABLE public.ims_indent_number_counters_global FROM anon, PUBLIC;

REVOKE EXECUTE ON FUNCTION public.ims_next_indent_number(uuid, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ims_next_indent_number(uuid, date) TO authenticated;
