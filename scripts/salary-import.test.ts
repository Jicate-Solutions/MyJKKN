/**
 * Standalone checks for the salary import parser + validator.
 * Run: npx tsx scripts/salary-import.test.ts
 *
 * No test runner is wired into npm in this repo; this follows
 * scripts/biometric-parser.test.ts, which is exercised the same way.
 */
import { parseSalarySheet } from '../lib/hr/payroll/parse-salary-sheet';
import { validateSalaryUpload, type SalaryStaffRow } from '../lib/hr/payroll/validate-salary-upload';

let pass = 0, fail = 0;
function check(label: string, ok: boolean, got?: string) {
  if (ok) { pass++; console.log(`PASS  ${label}${got ? `  — ${got}` : ''}`); }
  else { fail++; console.log(`FAIL  ${label}${got ? `  — ${got}` : ''}`); }
}

const staff = (over: Partial<SalaryStaffRow> & { staff_id: string }): SalaryStaffRow => ({
  id: `id-${over.staff_id}`, first_name: 'A', last_name: 'B',
  is_active: true, included_in_hr: true, hr_organization_id: 'org-1', ...over,
});

console.log('=== validator ===');
{
  const v = validateSalaryUpload({
    rows: [{ row_number: 3, employee_code: 'NOT100', employee_name: 'X', monthly_gross: 26500, annual_gross_in_file: 318000 }],
    staff: [staff({ staff_id: 'NOT100' })],
  });
  check('a clean row is importable', v.counts.importable === 1 && v.can_import);
}
{
  const v = validateSalaryUpload({
    rows: [{ row_number: 3, employee_code: 'GHOST', employee_name: 'X', monthly_gross: 100, annual_gross_in_file: 1200 }],
    staff: [staff({ staff_id: 'NOT100' })],
  });
  check('unmatched is skipped, not blocked', v.counts.unmatched === 1 && v.counts.importable === 0);
  check('  but zero importable IS a hard block', !v.can_import);
}
{
  const v = validateSalaryUpload({
    rows: [
      { row_number: 3, employee_code: 'NOT100', employee_name: 'X', monthly_gross: 100, annual_gross_in_file: 1200 },
      { row_number: 4, employee_code: 'GHOST', employee_name: 'Y', monthly_gross: 100, annual_gross_in_file: 1200 },
    ],
    staff: [staff({ staff_id: 'NOT100' })],
  });
  check('matched imports alongside an unmatched', v.counts.importable === 1 && v.can_import);
  check('  and the skip is acknowledgeable', v.requires_acknowledgement);
}
{
  const v = validateSalaryUpload({
    rows: [
      { row_number: 3, employee_code: 'NOT100', employee_name: 'X', monthly_gross: 100, annual_gross_in_file: 1200 },
      { row_number: 4, employee_code: 'NOT100', employee_name: 'X', monthly_gross: 200, annual_gross_in_file: 2400 },
    ],
    staff: [staff({ staff_id: 'NOT100' })],
  });
  check('a repeated employee ID is a HARD block', !v.can_import && v.counts.duplicate_in_file === 2);
}
{
  const v = validateSalaryUpload({
    rows: [{ row_number: 3, employee_code: 'NOT100', employee_name: 'X', monthly_gross: 500, annual_gross_in_file: 1200 }],
    staff: [staff({ staff_id: 'NOT100' })],
  });
  check('annual != monthly x 12 is flagged, not blocked', v.rows[0].annual_mismatch && v.can_import);
}
{
  const v = validateSalaryUpload({
    rows: [{ row_number: 3, employee_code: 'NOT100', employee_name: 'X', monthly_gross: 0, annual_gross_in_file: 0 }],
    staff: [staff({ staff_id: 'NOT100' })],
  });
  check('zero salary is skipped', v.counts.invalid_amount === 1);
}
{
  const v = validateSalaryUpload({
    rows: [{ row_number: 3, employee_code: 'NOT100', employee_name: 'X', monthly_gross: 100, annual_gross_in_file: 1200 }],
    staff: [staff({ staff_id: 'NOT100', hr_organization_id: null })],
  });
  check('no payroll organisation is skipped', v.counts.no_payroll_org === 1);
}
{
  const v = validateSalaryUpload({
    rows: [{ row_number: 3, employee_code: 'NOT100', employee_name: 'X', monthly_gross: 100, annual_gross_in_file: 1200 }],
    staff: [staff({ staff_id: 'NOT100', is_active: false })],
  });
  check('relieved staff still import, with a warning', v.counts.importable === 1 && v.rows[0].is_relieved);
}
{
  const v = validateSalaryUpload({
    rows: [
      { row_number: 3, employee_code: 'NOT100', employee_name: 'X', monthly_gross: 100, annual_gross_in_file: 1200 },
      { row_number: 4, employee_code: 'NOT102', employee_name: 'Y', monthly_gross: 300, annual_gross_in_file: 3600 },
    ],
    staff: [staff({ staff_id: 'NOT100' }), staff({ staff_id: 'NOT102' })],
    currentByStaffId: new Map([['id-NOT100', 100]]),
  });
  check('unchanged vs changed are counted apart', v.counts.unchanged === 1 && v.counts.changed === 1,
    `${v.counts.unchanged}/${v.counts.changed}`);
}
{
  const v = validateSalaryUpload({
    rows: [{ row_number: 3, employee_code: ' NOT100 ', employee_name: 'X', monthly_gross: 100, annual_gross_in_file: 1200 }],
    staff: [staff({ staff_id: 'NOT100' })],
  });
  check('surrounding whitespace is trimmed, not a new person', v.counts.importable === 1);
}

// employment_categories.included_in_hr gates the whole HR module. The read
// screen has always been on v_hr_staff; the import resolves against the base
// staff table under the service role, so this branch is the only thing standing
// between an Ayaah's employee code and a salary row.
{
  const v = validateSalaryUpload({
    rows: [{ row_number: 3, employee_code: 'AYA001', employee_name: 'X', monthly_gross: 9000, annual_gross_in_file: 108000 }],
    staff: [staff({ staff_id: 'AYA001', included_in_hr: false })],
  });
  check('an excluded category is skipped, not imported',
    v.counts.not_in_hr === 1 && v.counts.importable === 0);
  check('  and is NOT reported as unmatched', v.counts.unmatched === 0);
  check('  the row names the category, not a missing staff record',
    (v.rows[0]?.reason ?? '').includes('employment category'));
  check('  the person still resolves, so the verdict can name them',
    v.rows[0]?.staff_uuid === 'id-AYA001');
}
{
  const v = validateSalaryUpload({
    rows: [
      { row_number: 3, employee_code: 'NOT100', employee_name: 'X', monthly_gross: 100, annual_gross_in_file: 1200 },
      { row_number: 4, employee_code: 'AYA001', employee_name: 'Y', monthly_gross: 900, annual_gross_in_file: 10800 },
    ],
    staff: [staff({ staff_id: 'NOT100' }), staff({ staff_id: 'AYA001', included_in_hr: false })],
  });
  check('an excluded row does not block the rest of the file',
    v.counts.importable === 1 && v.can_import);
  check('  but it must be acknowledged first', v.requires_acknowledgement);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
