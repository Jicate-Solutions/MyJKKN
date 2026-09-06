/**
 * Standalone check for the biometric parser + day evaluator.
 * Run:  npx tsx scripts/biometric-parser.test.ts [path-to-report.xls]
 *
 * Matches the repo's existing standalone *.test.ts convention (see
 * scripts/staff-search.test.ts) — there is no npm test harness.
 *
 * The expected numbers are the verified facts from the 2026-08-06 analysis of
 * "Main Office July 2026 Report.xls". If the parser ever drifts, these fail.
 * When the real file is absent the file-backed section is skipped and only the
 * pure evaluator cases run, so this is still useful on any machine.
 */

import fs from 'node:fs';
import { parseMonthlyReportFile } from '../lib/hr/biometric/parse-monthly-report';
import { evaluateDay } from '../lib/hr/biometric/evaluate-day';
import { normBiometricCode } from '../lib/hr/biometric/normalize-code';
import { validateUpload, finaliseValidation, type ValidationStaffRow } from '../lib/hr/biometric/validate-upload';
import type { BiometricEmployee } from '../lib/hr/biometric/parse-monthly-report';
import type { ResolvedShiftTiming } from '../types/hr-shift-timings';

let failures = 0;
const check = (name: string, cond: boolean, detail = '') => {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

// --- a Main Office working day: 09:00-13:00 / 12:30-16:30, grace 5 ---------
const workingDay: ResolvedShiftTiming = {
  timing_id: 'timing-1',
  institution_id: 'inst-1',
  staff_scope: 'non_teaching',
  employment_category_id: null,
  day_of_week: 3,
  is_working_day: true,
  first_half_start: '09:00:00',
  first_half_end: '13:00:00',
  second_half_start: '12:30:00',
  second_half_end: '16:30:00',
  grace_minutes: 5,
  grace_deadline: '09:05:00',
  matched_by: 'non_teaching',
};
const sunday: ResolvedShiftTiming = {
  ...workingDay, day_of_week: 7, is_working_day: false,
  first_half_start: null, first_half_end: null,
  second_half_start: null, second_half_end: null, grace_deadline: null,
};

// --- normaliser parity with SQL fn_norm_biometric_code --------------------
// Expected values captured from the live database on 2026-08-06. The SQL
// version backs the unique index on staff; this one does the import-time
// matching. If they drift, a code that saved fine stops matching on import.
console.log('=== normaliser (must match SQL fn_norm_biometric_code) ===');
{
  const cases: Array<[string | null, string | null]> = [
    ['00002', '2'], ['002', '2'], ['2', '2'],
    ['30', '30'], ['0030', '30'], ['605', '605'], ['04158', '4158'],
    ['A12', 'A12'], [' cop083 ', 'COP083'],
    ['', null], [null, null],
    ['20021169440', '20021169440'],
  ];
  for (const [input, expected] of cases) {
    const got = normBiometricCode(input);
    check(`norm(${JSON.stringify(input)}) = ${JSON.stringify(expected)}`, got === expected, JSON.stringify(got));
  }
}

console.log('');
console.log('=== evaluator ===');
{
  const r = evaluateDay({ inTime: '08:58', outTime: '18:15', timing: workingDay });
  check('full day (08:58 -> 18:15) = PRESENT/FULL', r.verdict === 'PRESENT' && r.dayCalc === 'FULL', r.verdict);
  check('  on time -> lateMinutes 0', r.lateMinutes === 0, String(r.lateMinutes));
}
{
  // Velayutham K, day 18 in the real file: machine said P, WORK 04:20.
  const r = evaluateDay({ inTime: '08:52', outTime: '13:12', timing: workingDay });
  check('morning only (08:52 -> 13:12) = HALF_DAY', r.verdict === 'HALF_DAY' && r.dayCalc === 'HALF', r.verdict);
  check('  first half yes, second half no', r.firstHalfAttended === true && r.secondHalfAttended === false);
}
{
  const r = evaluateDay({ inTime: '12:25', outTime: '16:35', timing: workingDay });
  check('afternoon only (12:25 -> 16:35) = HALF_DAY', r.verdict === 'HALF_DAY', r.verdict);
  check('  first half no, second half yes', r.firstHalfAttended === false && r.secondHalfAttended === true);
}
{
  const r = evaluateDay({ inTime: '09:40', outTime: '16:35', timing: workingDay });
  check('late arrival (09:40 -> 16:35) = HALF_DAY (afternoon only)', r.verdict === 'HALF_DAY', r.verdict);
  check('  lateMinutes = 35', r.lateMinutes === 35, String(r.lateMinutes));
}
{
  const r = evaluateDay({ inTime: '09:05', outTime: '16:30', timing: workingDay });
  check('exactly on the grace deadline still counts FULL', r.verdict === 'PRESENT', r.verdict);
  check('  lateMinutes = 0 at the boundary', r.lateMinutes === 0, String(r.lateMinutes));
}
{
  const r = evaluateDay({ inTime: '11:00', outTime: '14:00', timing: workingDay });
  check('covers neither window (11:00 -> 14:00) = ABSENT/NONE', r.verdict === 'ABSENT' && r.dayCalc === 'NONE', r.verdict);
}

// --- approved permissions reinstate a half they fully cover ----------------
// Main Office: grace deadline 09:05, morning ends 13:00, afternoon 12:30-16:30.
{
  const r = evaluateDay({
    inTime: '09:24', outTime: '17:48', timing: workingDay,
    permissions: [{ id: 'p1', from: '09:05', to: '09:35' }],
  });
  check('19 min late, 09:05-09:35 permission = PRESENT', r.verdict === 'PRESENT' && r.dayCalc === 'FULL', r.verdict);
  check('  morning reinstated', r.firstHalfAttended === true);
  check('  lateMinutes stays raw at 19', r.lateMinutes === 19, String(r.lateMinutes));
  check('  excusedMinutes = 19 (the gap, not the permission)', r.excusedMinutes === 19, String(r.excusedMinutes));
  check('  names the permission', r.excusedBy.length === 1 && r.excusedBy[0] === 'p1', JSON.stringify(r.excusedBy));
}
{
  const r = evaluateDay({
    inTime: '09:24', outTime: '17:48', timing: workingDay,
    permissions: [{ id: 'p1', from: '15:00', to: '15:30' }],
  });
  check('afternoon permission cannot pay for a morning gap', r.verdict === 'HALF_DAY', r.verdict);
  check('  nothing excused', r.excusedMinutes === 0 && r.excusedBy.length === 0);
}
{
  const r = evaluateDay({
    inTime: '09:40', outTime: '17:48', timing: workingDay,
    permissions: [{ id: 'p1', from: '09:05', to: '09:35' }],
  });
  check('permission shorter than the gap reinstates nothing', r.verdict === 'HALF_DAY', r.verdict);
  check('  all-or-nothing: excusedMinutes 0', r.excusedMinutes === 0, String(r.excusedMinutes));
}
{
  // Leaving early — the mirror case. Afternoon ends 16:30; out at 16:00.
  const r = evaluateDay({
    inTime: '08:58', outTime: '16:00', timing: workingDay,
    permissions: [{ id: 'p2', from: '16:00', to: '16:30' }],
  });
  check('early departure covered by a permission = PRESENT', r.verdict === 'PRESENT', r.verdict);
  check('  afternoon reinstated, excused 30', r.secondHalfAttended === true && r.excusedMinutes === 30, String(r.excusedMinutes));
}
{
  // Two permissions meeting end-to-end must cover a gap neither covers alone.
  const r = evaluateDay({
    inTime: '10:05', outTime: '17:48', timing: workingDay,
    permissions: [
      { id: 'a', from: '09:05', to: '09:35' },
      { id: 'b', from: '09:35', to: '10:05' },
    ],
  });
  check('two back-to-back permissions cover a 60 min gap', r.verdict === 'PRESENT', r.verdict);
  check('  both named', r.excusedBy.length === 2, JSON.stringify(r.excusedBy));
}
{
  const r = evaluateDay({ inTime: '08:58', outTime: '18:15', timing: workingDay, permissions: [] });
  check('an on-time day is unaffected by the permission path', r.verdict === 'PRESENT' && r.excusedMinutes === 0);
}
{
  // A permission must never make a passing half fail: 12:31 keeps the midpoint
  // tolerance on the afternoon.
  const r = evaluateDay({ inTime: '12:31', outTime: '16:35', timing: workingDay });
  check('12:31 arrival still earns the afternoon', r.secondHalfAttended === true, r.verdict);
}
{
  // A lone punch is a full-day absence, with the reason preserved.
  const r = evaluateDay({ inTime: '09:00', outTime: null, timing: workingDay });
  check('lone IN = ABSENT/NONE, not EXCEPTION', r.verdict === 'ABSENT' && r.dayCalc === 'NONE', r.verdict);
  check('  reason kept for notes', (r.exceptionReason ?? '').includes('Missing OUT'), String(r.exceptionReason));
  check('  neither half attended', r.firstHalfAttended === false && r.secondHalfAttended === false);
}
{
  const r = evaluateDay({ inTime: null, outTime: '17:30', timing: workingDay });
  check('lone OUT = ABSENT too', r.verdict === 'ABSENT', r.verdict);
  check('  reason names the missing IN', (r.exceptionReason ?? '').includes('Missing IN'), String(r.exceptionReason));
}
{
  // Genuinely unjudgeable days stay EXCEPTION — a missing RULE, not missing
  // attendance.
  const r = evaluateDay({ inTime: '17:00', outTime: '09:00', timing: workingDay });
  check('OUT before IN stays EXCEPTION', r.verdict === 'EXCEPTION', r.verdict);
}
{
  // Sekar, day 11: machine printed a lone 17:31 in the IN row.
  const r = evaluateDay({ inTime: '17:31', outTime: null, timing: workingDay });
  check('lone 17:31 = ABSENT, never a 17:31 arrival', r.verdict === 'ABSENT', r.verdict);
}
{
  const r = evaluateDay({ inTime: null, outTime: null, timing: sunday });
  check('Sunday = WEEKLY_OFF (machine says A)', r.verdict === 'WEEKLY_OFF' && r.dayCalc === 'NONE', r.verdict);
}
{
  const r = evaluateDay({ inTime: '09:00', outTime: '17:00', timing: sunday });
  check('Sunday stays WEEKLY_OFF even with punches', r.verdict === 'WEEKLY_OFF', r.verdict);
}
{
  const r = evaluateDay({ inTime: null, outTime: null, timing: workingDay });
  check('working day, no punch = ABSENT', r.verdict === 'ABSENT', r.verdict);
}
{
  const r = evaluateDay({ inTime: '09:00', outTime: '17:00', timing: null });
  check('no shift configured = EXCEPTION', r.verdict === 'EXCEPTION', r.verdict);
}

// --- parser, against the real export --------------------------------------
const file = process.argv[2] ?? 'C:/Users/Admin/Downloads/Main Office July 2026 Report.xls';
console.log('');
console.log('=== parser ===');
if (!fs.existsSync(file)) {
  console.log(`SKIP  real export not found at ${file}`);
} else {
  const buf = fs.readFileSync(file);
  const report = parseMonthlyReportFile(new Uint8Array(buf));

  check('48 employees', report.employees.length === 48, String(report.employees.length));
  check('institution code = "main office"', report.institutionCode.toLowerCase() === 'main office', report.institutionCode);
  check('institution name = "JKKN"', report.institutionName === 'JKKN', report.institutionName);
  check('month resolves to July 2026', report.year === 2026 && report.month === 7, `${report.monthLabel} -> ${report.year}-${report.month}`);
  check('no parser warnings', report.warnings.length === 0, report.warnings.join(' | '));

  const days = report.employees.flatMap((e) => e.days);
  check('1488 day cells (48 x 31)', days.length === 1488, String(days.length));
  check('every day has an ISO date', days.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.workDate)));

  const p = days.filter((d) => d.deviceStatus === 'P').length;
  const a = days.filter((d) => d.deviceStatus === 'A').length;
  check('924 P / 564 A from the machine', p === 924 && a === 564, `P=${p} A=${a}`);

  const oneSided = days.filter((d) => Boolean(d.inTime) !== Boolean(d.outTime)).length;
  check('33 single-punch days', oneSided === 33, String(oneSided));

  const first = report.employees[0];
  check('first employee is 00002 Gunasekaran S', first.code === '00002' && first.name === 'Gunasekaran S', `${first.code} ${first.name}`);
  check('  summary present=27 absent=4 WO=0', first.summary.present === 27 && first.summary.absent === 4 && first.summary.weeklyOff === 0);
  check('  Total Work 212:30 -> 12750 min', first.summary.totalWorkMinutes === 12750, String(first.summary.totalWorkMinutes));
  check('  Total OT 20:50 -> 1250 min', first.summary.totalOvertimeMinutes === 1250, String(first.summary.totalOvertimeMinutes));

  const d1 = first.days[0];
  check('  day 1 = 2026-07-01 Wed, 08:58 -> 18:15', d1.workDate === '2026-07-01' && d1.weekday === 'Wed' && d1.inTime === '08:58' && d1.outTime === '18:15');
  check('  day 1 WORK 08:30 -> 510 min, OT 00:46 -> 46 min', d1.workMinutes === 510 && d1.overtimeMinutes === 46);

  // The malformed "219:4" total in the real file must still parse.
  const ranganathan = report.employees.find((e) => e.code === '00009');
  check('malformed "219:4" total parses to 13144 min', ranganathan?.summary.totalWorkMinutes === 13144, String(ranganathan?.summary.totalWorkMinutes));

  // Sundays: the machine marks them all A.
  const sundays = days.filter((d) => d.weekday === 'Sun');
  check('192 Sundays, all marked A by the machine', sundays.length === 192 && sundays.every((d) => d.deviceStatus === 'A'), String(sundays.length));

  // End-to-end: those Sundays must come out WEEKLY_OFF under our config.
  const flipped = sundays.filter((d) => evaluateDay({ inTime: d.inTime, outTime: d.outTime, timing: sunday }).verdict === 'WEEKLY_OFF').length;
  check('all 192 Sundays evaluate to WEEKLY_OFF, not ABSENT', flipped === 192, String(flipped));

  // --- reconciliation: the machine's own totals grade our arithmetic -------
  // Machine P = any day with a punch; machine A = everything else, Sundays included.
  // So machine P should equal our present + half + needs-review, and machine A
  // should equal our absent + weekly off.
  console.log('');
  console.log('=== reconciliation (machine totals vs our verdicts) ===');
  let agree = 0;
  const disagreements: string[] = [];
  for (const e of report.employees) {
    const mine = { PRESENT: 0, HALF_DAY: 0, ABSENT: 0, WEEKLY_OFF: 0, EXCEPTION: 0 };
    for (const d of e.days) {
      const t = d.weekday === 'Sun' ? sunday : workingDay;
      mine[evaluateDay({ inTime: d.inTime, outTime: d.outTime, timing: t }).verdict] += 1;
    }
    const okP = e.summary.present === null || e.summary.present === mine.PRESENT + mine.HALF_DAY + mine.EXCEPTION;
    const okA = e.summary.absent === null || e.summary.absent === mine.ABSENT + mine.WEEKLY_OFF;
    if (okP && okA) agree++;
    else {
      disagreements.push(
        `${e.code} ${e.name}: machine P=${e.summary.present} A=${e.summary.absent} | ` +
        `ours P=${mine.PRESENT} H=${mine.HALF_DAY} A=${mine.ABSENT} WO=${mine.WEEKLY_OFF} X=${mine.EXCEPTION}`,
      );
    }
  }
  console.log(`  ${agree} of ${report.employees.length} employees reconcile`);
  for (const d of disagreements.slice(0, 10)) console.log(`  · ${d}`);
  if (disagreements.length > 10) console.log(`  · …and ${disagreements.length - 10} more`);

  // Not asserted as a hard pass: a mismatch is a finding about the DATA, not a
  // parser bug. It is reported so a real discrepancy is visible rather than silent.
  check('reconciliation ran for every employee', agree + disagreements.length === report.employees.length);
}

// --- upload validation ----------------------------------------------------
// Fixture mirrors the real July export's shapes: a code-linked person, a person
// present in staff but unlinked, a duplicated name, and a device user who is
// nobody. 'Mr. RADHA KRISHNAN T' vs 'Radhakrishnan T' is the real honorific case.
console.log('');
console.log('=== upload validation ===');
{
  const staff: ValidationStaffRow[] = [
    { id: 'u1', staff_id: 'NOT100', first_name: 'Mr. RADHA KRISHNAN', last_name: 'T',
      institution_id: 'inst-1', biometric_id: '00002', biometric_institution_id: 'mach-1' },
    { id: 'u2', staff_id: 'CAS140', first_name: 'PRIYA', last_name: 'S',
      institution_id: 'inst-1', biometric_id: null, biometric_institution_id: null },
    // staff_id null AND institution with no HR organization -> both warnings
    { id: 'u3', staff_id: null, first_name: 'ARUN', last_name: 'K',
      institution_id: 'inst-2', biometric_id: '30', biometric_institution_id: 'mach-1' },
    { id: 'u4', staff_id: 'M1', first_name: 'MOHAN', last_name: 'R',
      institution_id: 'inst-1', biometric_id: null, biometric_institution_id: null },
    { id: 'u5', staff_id: 'M2', first_name: 'MOHAN', last_name: 'R',
      institution_id: 'inst-1', biometric_id: null, biometric_institution_id: null },
  ];
  const orgs = new Map<string, string>([['inst-1', 'org-1']]); // inst-2 deliberately absent

  const emp = (code: string, name: string): BiometricEmployee => ({
    code, name,
    summary: { present: null, weeklyOff: null, absent: null,
               totalWorkMinutes: null, totalOvertimeMinutes: null },
    days: [],
  });

  const v = validateUpload({
    employees: [
      emp('002', 'Radhakrishnan T'),  // linked via code (00002 -> 2, 002 -> 2)
      emp('0030', 'Arun K'),          // linked via code (30)
      emp('77', 'Priya S'),           // unlinked_match — one name hit
      emp('88', 'Mohan R'),           // ambiguous_match — two name hits
      emp('99', 'Nobody Here'),       // absent
    ],
    staff, machineInstitutionId: 'mach-1', organisationByInstitution: orgs,
  });

  check('counts.total is 5', v.counts.total === 5, String(v.counts.total));
  check('counts.importable is 2', v.counts.importable === 2, String(v.counts.importable));
  check('counts.unlinked_match is 1', v.counts.unlinked_match === 1, String(v.counts.unlinked_match));
  check('counts.ambiguous_match is 1', v.counts.ambiguous_match === 1, String(v.counts.ambiguous_match));
  check('counts.absent is 1', v.counts.absent === 1, String(v.counts.absent));

  const byCode = new Map(v.employees.map((e) => [e.code, e]));
  check('002 linked to u1', byCode.get('002')?.match === 'linked' && byCode.get('002')?.staff_uuid === 'u1');
  check('002 is importable', byCode.get('002')?.importable === true);
  check('77 is unlinked_match', byCode.get('77')?.match === 'unlinked_match');
  check('77 is NOT importable', byCode.get('77')?.importable === false);
  check('88 is ambiguous with 2 candidates',
    byCode.get('88')?.match === 'ambiguous_match' && byCode.get('88')?.candidate_count === 2);
  check('99 is absent', byCode.get('99')?.match === 'absent');

  const kinds = new Set(v.blocks.map((b) => b.kind));
  check('unknown_staff_present raised', kinds.has('unknown_staff_present'));
  check('unknown_staff_present counts 2 (ambiguous + absent)',
    v.blocks.find((b) => b.kind === 'unknown_staff_present')?.count === 2);
  check('unknown_staff_present is acknowledgeable',
    v.blocks.find((b) => b.kind === 'unknown_staff_present')?.severity === 'acknowledgeable');
  check('no hard block on the happy fixture', !v.blocks.some((b) => b.severity === 'hard'));

  const warn = new Map(v.warnings.map((w) => [w.kind, w]));
  check('missing_staff_code counts 1 (u3)', warn.get('missing_staff_code')?.count === 1);
  check('missing_organisation counts 1 (u3, inst-2)', warn.get('missing_organisation')?.count === 1);

  // phase 2 — no unreconciled employees
  const clean = finaliseValidation(v, []);
  check('can_import true when only acknowledgeable blocks', clean.can_import === true);
  check('requires_acknowledgement true', clean.requires_acknowledgement === true);

  // phase 2 — with unreconciled employees
  const shaky = finaliseValidation(v, [{ code: '002', name: 'Radhakrishnan T' }]);
  check('unreconciled_totals block appended',
    shaky.blocks.some((b) => b.kind === 'unreconciled_totals' && b.severity === 'acknowledgeable'));
  check('unreconciled does not make it a hard block', shaky.can_import === true);

  // --- duplicate normalised codes -> HARD block ---------------------------
  const dup = finaliseValidation(validateUpload({
    employees: [emp('0017', 'Priya S'), emp('017', 'Priya Sundaram')],
    staff, machineInstitutionId: 'mach-1', organisationByInstitution: orgs,
  }), []);
  check('0017 and 017 detected as one duplicated code',
    dup.blocks.some((b) => b.kind === 'duplicate_code_in_file' && b.count === 1));
  check('duplicate is a hard block',
    dup.blocks.find((b) => b.kind === 'duplicate_code_in_file')?.severity === 'hard');
  check('duplicate makes can_import false', dup.can_import === false);

  // --- blank code -> HARD block -------------------------------------------
  const blank = finaliseValidation(validateUpload({
    employees: [emp('   ', 'Ghost User'), emp('002', 'Radhakrishnan T')],
    staff, machineInstitutionId: 'mach-1', organisationByInstitution: orgs,
  }), []);
  check('blank code raises invalid_code_in_file',
    blank.blocks.some((b) => b.kind === 'invalid_code_in_file' && b.severity === 'hard'));
  check('blank code makes can_import false', blank.can_import === false);

  // --- nothing linked -> HARD block (today's real state: 0 staff mapped) ---
  const none = finaliseValidation(validateUpload({
    employees: [emp('77', 'Priya S'), emp('99', 'Nobody Here')],
    staff: staff.map((s) => ({ ...s, biometric_id: null, biometric_institution_id: null })),
    machineInstitutionId: 'mach-1', organisationByInstitution: orgs,
  }), []);
  check('zero importable raises zero_importable',
    none.blocks.some((b) => b.kind === 'zero_importable' && b.severity === 'hard'));
  check('zero importable makes can_import false', none.can_import === false);
}

console.log('');
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
