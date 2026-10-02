-- Who may WRITE the salary suggestion rule (hr.salary_suggestion_rule).
-- Each identity tries each write; every attempt is rolled back afterwards, so
-- the attempts never affect one another. Prints, per attempt:
--   ALLOWED  n row(s) changed
--   REFUSED  <error>                     (the trigger, or an RLS check, raised)
--   REFUSED  0 rows (hidden by RLS)      (an UPDATE/DELETE the policies filtered out)
-- Expected, with #4111's policies and this PR's trigger in place:
--   the Director (super admin, on the list)  -> ALLOWED for every rule write
--   a super admin NOT on the list            -> REFUSED for every rule write (the trigger);
--                                               ALLOWED to update a pay-scales row (other keys untouched)
--   own-scope salary holder, no-role user    -> REFUSED for every write
--   anon                                     -> REFUSED for every write
--   service_role, and a session with no JWT  -> ALLOWED
DO $$
DECLARE
  u record; op record; n integer; msg text;
BEGIN
  FOR u IN SELECT * FROM (VALUES
    ('the Director',                  '00000000-0000-0000-0000-00000000aa06', 'authenticated', 'authenticated'),
    ('super admin, not on the list',  '00000000-0000-0000-0000-00000000aa04', 'authenticated', 'authenticated'),
    ('own-scope salary holder',       '00000000-0000-0000-0000-00000000aa01', 'authenticated', 'authenticated'),
    ('no staff row, no profile role', '00000000-0000-0000-0000-00000000aa07', 'authenticated', 'authenticated'),
    ('anon',                          NULL,                                   'anon',          'anon'),
    ('service_role',                  NULL,                                   'service_role',  'service_role'),
    ('no JWT (SQL console)',          NULL,                                   NULL,            NULL)) v(label, uid, claim_role, db_role)
  LOOP
    FOR op IN SELECT * FROM (VALUES
      ('update the rule',              1),
      ('insert a rule row',            2),
      ('delete the rule',              3),
      ('rename a pay row INTO the key',4),
      ('rename the rule OUT of the key',5),
      ('update a pay-scales row',      6)) w(label, k)
    LOOP
      BEGIN
        IF u.claim_role IS NULL THEN
          PERFORM set_config('request.jwt.claims', '', true);
        ELSE
          PERFORM set_config('request.jwt.claims',
            json_strip_nulls(json_build_object('sub', u.uid, 'role', u.claim_role))::text, true);
        END IF;
        IF u.db_role IS NOT NULL THEN
          EXECUTE format('SET LOCAL ROLE %I', u.db_role);
        END IF;

        IF op.k = 1 THEN
          UPDATE public.platform_policies SET value = '{"per_year_by_department":{}}'
           WHERE policy_key = 'hr.salary_suggestion_rule' AND scope_type = 'global';
        ELSIF op.k = 2 THEN
          INSERT INTO public.platform_policies (policy_key, scope_type, scope_id, value)
          VALUES ('hr.salary_suggestion_rule', 'institution', '00000000-0000-0000-0000-0000000000c3', '{}');
        ELSIF op.k = 3 THEN
          DELETE FROM public.platform_policies
           WHERE policy_key = 'hr.salary_suggestion_rule' AND scope_type = 'global';
        ELSIF op.k = 4 THEN
          UPDATE public.platform_policies SET policy_key = 'hr.salary_suggestion_rule'
           WHERE policy_key = 'hr.pay_scales' AND scope_id = '00000000-0000-0000-0000-0000000000a1';
        ELSIF op.k = 5 THEN
          UPDATE public.platform_policies SET policy_key = 'hr.salary_suggestion_rule_old'
           WHERE policy_key = 'hr.salary_suggestion_rule' AND scope_type = 'global';
        ELSE
          UPDATE public.platform_policies SET value = value
           WHERE policy_key = 'hr.pay_scales' AND scope_id = '00000000-0000-0000-0000-0000000000a1';
        END IF;
        GET DIAGNOSTICS n = ROW_COUNT;
        msg := CASE WHEN n = 0 THEN 'REFUSED  0 rows (hidden by RLS)' ELSE format('ALLOWED  %s row(s) changed', n) END;
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ROLLBACK:' || msg;
      EXCEPTION
        WHEN raise_exception THEN
          IF SQLERRM LIKE 'ROLLBACK:%' THEN msg := substr(SQLERRM, 10); ELSE msg := 'REFUSED  ' || SQLERRM; END IF;
          RESET ROLE;
          RAISE NOTICE 'WRITE    % % %', rpad(u.label, 30), rpad(op.label, 31), msg;
        WHEN OTHERS THEN
          RESET ROLE;
          RAISE NOTICE 'WRITE    % % REFUSED  % (%)', rpad(u.label, 30), rpad(op.label, 31), SQLERRM, SQLSTATE;
      END;
    END LOOP;
  END LOOP;
END $$;
