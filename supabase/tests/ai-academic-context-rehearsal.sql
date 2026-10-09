-- ai-academic-context-rehearsal.sql — OFF PRODUCTION ONLY. Ends in a thrown REPORT.
-- EXPECT over the fixed body: REPORT PASS 7/7. Over the live body (control): FAIL.
DO $r$
DECLARE
  cases text[][] := ARRAY[
    ['00000000-0000-0000-0000-00000000000a','A: six active years (like Engineering)', '2026-2027'],
    ['00000000-0000-0000-0000-00000000000b','B: today between two years',            'past'],
    ['00000000-0000-0000-0000-00000000000c','C: only upcoming years active',          'soon'],
    ['00000000-0000-0000-0000-00000000000d','D: Additional shadow row, same start',   'Current'],
    ['00000000-0000-0000-0000-00000000000e','E: two plain rows, same start',          'A-year']];
  i int; got text; pass int := 0; fails text := '';
BEGIN
  FOR i IN 1..array_length(cases,1) LOOP
    PERFORM set_config('test.uid', cases[i][1], true);
    got := public.ai_rpc_academic_context(NULL)->>'academic_year_name';
    IF got IS NOT DISTINCT FROM cases[i][3] THEN pass := pass + 1;
    ELSE fails := fails || format('%s: got %s want %s; ', cases[i][2], got, cases[i][3]); END IF;
  END LOOP;
  PERFORM set_config('test.uid', '', true);
  IF (public.ai_rpc_academic_context(NULL)->'error'->>'code') = 'UNAUTHORIZED' THEN pass := pass + 1; ELSE fails := fails || 'unauth not refused; '; END IF;
  IF NOT has_function_privilege('anon','public.ai_rpc_academic_context(uuid)','EXECUTE') THEN pass := pass + 1; ELSE fails := fails || 'anon can execute; '; END IF;
  RAISE EXCEPTION 'REPORT % %/7 %', CASE WHEN pass = 7 THEN 'PASS' ELSE 'FAIL' END, pass, fails;
END
$r$;
