#!/usr/bin/env bash
# Rehearse 20270523090000 on a THROWAWAY local PostgreSQL 16 database.
# NEVER point this at production.
#
#   PGPORT=55439 PGHOST=/tmp bash supabase/tests/hr-payslips-basic-pay-nullable-run.sh
#
# Run from the repo root. Creates a fresh database, loads the stub schema, then
# loads VERBATIM from the repo (sed line ranges, so a moved line fails loudly):
#   - is_super_admin() / is_admin(uuid) from supabase/setup/02_functions.sql
#   - 20260628000000, which creates hr_payslips and its row rules
#   - the 20260519000000 recursion fix for hr_payroll_periods' read rule
#   - main's final hr_payroll_periods + hr_payslips rule bodies (initplan sweep)
#   - the restrictive hr_included_gate + helper from 20260906160000
# and then runs the rehearsal, which applies the migration twice.
set -euo pipefail

PSQL=${PSQL:-/opt/homebrew/opt/postgresql@16/bin/psql}
DB=${REHEARSAL_DB:-payslip_basic_rehearsal}
case "${PGHOST:-}" in
  ""|/tmp|/private/tmp|localhost|127.0.0.1) ;;
  *) echo "refusing: PGHOST=$PGHOST is not local"; exit 2 ;;
esac

"$PSQL" -X -q -d postgres -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB"
run() { "$PSQL" -X -q -v ON_ERROR_STOP=1 -d "$DB" "$@"; }

run -f supabase/tests/hr-payslips-basic-pay-nullable-stub-schema.sql

# Helpers, verbatim.
FUNCS=$(awk '/^CREATE OR REPLACE FUNCTION public.is_super_admin\(\)/{on=1} on{print} on&&/^\$\$;/{n++; if(n==1){on=0}}' supabase/setup/02_functions.sql
        awk '/^CREATE OR REPLACE FUNCTION public.is_admin\(user_id uuid DEFAULT auth.uid\(\)\)/{on=1} on{print} on&&/^\$\$;/{on=0; exit}' supabase/setup/02_functions.sql)
[ "$(printf '%s\n' "$FUNCS" | grep -c 'CREATE OR REPLACE FUNCTION')" = 2 ] || { echo "helper extraction failed"; exit 3; }
printf '%s\n' "$FUNCS" | run

# The table and its original row rules.
run -f supabase/migrations/20260628000000_t4_3_payroll_periods_approvals_payslips.sql

# The recursion fix for hr_payroll_periods' read rule (it joined hr_payslips).
run -f supabase/migrations/20260519000000_t4_3_pr3_fix_rls_recursion.sql

# main's final rule bodies for hr_payroll_periods and hr_payslips (the initplan
# sweep rewrote all eight). Each statement runs to the next ALTER POLICY.
SWEEP=$(awk '/^ALTER POLICY /{on = ($0 ~ /^ALTER POLICY "(hr_payroll_periods|hr_payslips)_/)} on{print}' supabase/migrations/rls_initplan_wrap_sweep.sql)
[ "$(printf '%s\n' "$SWEEP" | grep -c '^ALTER POLICY ')" = 8 ] || { echo "sweep extraction failed"; exit 3; }
printf '%s\n' "$SWEEP" | run

# The restrictive institution gate on hr_payslips and its helper.
GATE_FN=$(awk '/^CREATE OR REPLACE FUNCTION public.fn_hr_staff_institution_included/{on=1} on{print} on&&/^\$function\$;/{exit}' supabase/migrations/20260906160000_hr_institution_gate_restrictive_policies.sql)
GATE=$(awk '/^DROP POLICY IF EXISTS hr_included_gate ON public.hr_payslips;/{on=1} on{print} on&&/;$/&&/USING/{exit}' supabase/migrations/20260906160000_hr_institution_gate_restrictive_policies.sql)
[ -n "$GATE_FN" ] && [ "$(printf '%s\n' "$GATE" | grep -c 'hr_included_gate')" = 2 ] || { echo "gate extraction failed"; exit 3; }
printf '%s\n%s\n' "$GATE_FN" "$GATE" | run

run -f supabase/tests/hr-payslips-basic-pay-nullable-rehearsal.sql
