/**
 * Pre-commit validation for a salary upload.
 * Created: 2026-08-21.
 *
 * Pure and synchronous, like lib/hr/biometric/validate-upload.ts, so the same
 * verdict backs the dry run and the commit and a test can exercise it with no
 * database.
 *
 * MATCHING IS ON staff.staff_id, VERBATIM. Codes are compared after trimming
 * only — never case-folded or whitespace-stripped in the middle. NOT148 and
 * NOT 148 are different people as far as this is concerned, because a silent
 * near-match here writes someone else's pay.
 *
 * A ROW IS IMPORTABLE ONLY IF IT RESOLVES TO A REAL, PAYABLE STAFF MEMBER.
 * Everything else is reported and skipped: an unmatched code cannot be paid,
 * and a matched one with no payroll organisation has nobody to pay it. The
 * instruction for this file was explicitly "leave the unmatched ids and proceed
 * with the matched only", so unmatched rows are a WARNING, not a hard block.
 */

export type SalaryRowStatus =
  | 'ok'
  | 'unmatched'          // no staff row carries this code
  | 'not_in_hr'          // matched, but their employment category is out of HR
  | 'no_payroll_org'     // matched, but hr_staff_payroll has no paying org
  | 'duplicate_in_file'  // the same code appears more than once
  | 'invalid_amount';    // missing, zero or negative monthly gross

export interface SalaryStaffRow {
  id: string;
  staff_id: string | null;
  first_name: string | null;
  last_name: string | null;
  is_active: boolean | null;
  /**
   * employment_categories.included_in_hr for this person's category.
   *
   * Carried rather than filtered out upstream so the verdict can say "this
   * person is not in HR" instead of "no staff record carries this code". Both
   * skip the row; only one of them sends the user hunting for a staff record
   * that exists and is sitting right in front of them.
   */
  included_in_hr: boolean;
  /** From hr_staff_payroll. Null when the person has no paying organisation. */
  hr_organization_id: string | null;
}

export interface SalaryValidationRow {
  row_number: number;
  employee_code: string;
  /** As printed in the sheet. Display only — never used to match. */
  employee_name_in_file: string | null;
  /** Resolved from staff, so a mistyped name in the sheet is visible. */
  staff_name: string | null;
  staff_uuid: string | null;
  hr_organization_id: string | null;
  monthly_gross: number | null;
  /** The type's own eligibility flags, carried through untouched. */
  status: SalaryRowStatus;
  importable: boolean;
  /** Relieved staff still import — see the block below. */
  is_relieved: boolean;
  /** Set when the sheet's own annual figure disagrees with monthly x 12. */
  annual_mismatch: boolean;
  /** Kept only so the mismatch message can quote both numbers. */
  annual_gross_in_file: number | null;
  /** Their salary already on file, when this upload would change it. */
  current_monthly_gross: number | null;
  reason: string | null;
}

export interface SalaryValidationBlock {
  kind: SalaryRowStatus | 'relieved_staff' | 'annual_mismatch' | 'no_change';
  severity: 'hard' | 'acknowledgeable' | 'info';
  count: number;
  message: string;
  detail: string[];
}

export interface SalaryUploadValidation {
  rows: SalaryValidationRow[];
  counts: {
    total: number;
    importable: number;
    unmatched: number;
    /** Matched a real person whose employment category is excluded from HR. */
    not_in_hr: number;
    no_payroll_org: number;
    duplicate_in_file: number;
    invalid_amount: number;
    /** Importable rows whose amount differs from what is already stored. */
    changed: number;
    /** Importable rows that would write the same number again. */
    unchanged: number;
  };
  blocks: SalaryValidationBlock[];
  can_import: boolean;
  requires_acknowledgement: boolean;
}

/** A long file should not produce a longer error message. */
const DETAIL_LIMIT = 50;

export function validateSalaryUpload(input: {
  rows: Array<{
    row_number: number;
    employee_code: string;
    employee_name: string | null;
    monthly_gross: number | null;
    annual_gross_in_file: number | null;
    /**
     * The statutory pair, optional so a caller that does not parse them (and
     * every existing test) keeps compiling. Read only to WARN about a figure
     * sitting beside a "No" — the import writes the flags either way, and the
     * RPC zeroes an unauthorised amount rather than refusing the row.
     */
    eligible_for_pf?: boolean;
    epf_amount?: number | null;
    eligible_for_esi?: boolean;
    esi_amount?: number | null;
  }>;
  /** FULL roster — needed to tell "not our employee" from "not payable". */
  staff: SalaryStaffRow[];
  /** staff.id -> the salary currently in force, for the change count. */
  currentByStaffId?: Map<string, number>;
}): SalaryUploadValidation {
  const { rows, staff, currentByStaffId } = input;

  const byCode = new Map<string, SalaryStaffRow>();
  for (const s of staff) {
    const code = (s.staff_id ?? '').trim();
    if (code && !byCode.has(code)) byCode.set(code, s);
  }

  // Duplicates are counted on the trimmed code, which is the same key the
  // lookup uses — counting raw strings would let " NOT148" pass as distinct
  // right up until it overwrote NOT148.
  const seen = new Map<string, number>();
  for (const r of rows) {
    const key = r.employee_code.trim();
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }

  const out: SalaryValidationRow[] = rows.map((r) => {
    const code = r.employee_code.trim();
    const match = byCode.get(code) ?? null;
    const name = match
      ? [match.first_name, match.last_name].filter(Boolean).join(' ').trim() || null
      : null;
    const current = match && currentByStaffId ? currentByStaffId.get(match.id) ?? null : null;

    const base = {
      row_number: r.row_number,
      employee_code: code,
      employee_name_in_file: r.employee_name,
      staff_name: name,
      staff_uuid: match?.id ?? null,
      hr_organization_id: match?.hr_organization_id ?? null,
      monthly_gross: r.monthly_gross,
      is_relieved: match?.is_active === false,
      annual_gross_in_file: r.annual_gross_in_file,
      annual_mismatch:
        r.annual_gross_in_file !== null &&
        r.monthly_gross !== null &&
        Math.abs(r.annual_gross_in_file - r.monthly_gross * 12) > 1,
      current_monthly_gross: current,
    };

    if ((seen.get(code) ?? 0) > 1) {
      return { ...base, status: 'duplicate_in_file' as const, importable: false,
        reason: 'This employee ID appears more than once in the file. Keep one row per person.' };
    }
    if (!match) {
      return { ...base, status: 'unmatched' as const, importable: false,
        reason: 'No staff record carries this employee ID. The row is skipped.' };
    }
    // Checked BEFORE the amount: someone outside HR is not paid through this
    // module whatever the sheet says, so quibbling about their figure first
    // would report the wrong problem.
    if (!match.included_in_hr) {
      return { ...base, status: 'not_in_hr' as const, importable: false,
        reason:
          'This employee’s employment category is excluded from HR, so they are ' +
          'not paid through payroll. The row is skipped.' };
    }
    if (r.monthly_gross === null || r.monthly_gross <= 0) {
      return { ...base, status: 'invalid_amount' as const, importable: false,
        reason: 'Basic Salary is missing, zero or negative.' };
    }
    if (!match.hr_organization_id) {
      return { ...base, status: 'no_payroll_org' as const, importable: false,
        reason: 'This staff member has no payroll organisation, so there is nobody to pay the salary.' };
    }
    return { ...base, status: 'ok' as const, importable: true, reason: null };
  });

  const importable = out.filter((r) => r.importable);
  const counts = {
    total: out.length,
    importable: importable.length,
    unmatched: out.filter((r) => r.status === 'unmatched').length,
    not_in_hr: out.filter((r) => r.status === 'not_in_hr').length,
    no_payroll_org: out.filter((r) => r.status === 'no_payroll_org').length,
    duplicate_in_file: out.filter((r) => r.status === 'duplicate_in_file').length,
    invalid_amount: out.filter((r) => r.status === 'invalid_amount').length,
    changed: importable.filter(
      (r) => r.current_monthly_gross === null || r.current_monthly_gross !== r.monthly_gross,
    ).length,
    unchanged: importable.filter((r) => r.current_monthly_gross === r.monthly_gross).length,
  };

  const blocks: SalaryValidationBlock[] = [];

  if (counts.duplicate_in_file > 0) {
    blocks.push({
      kind: 'duplicate_in_file',
      severity: 'hard',
      count: counts.duplicate_in_file,
      message:
        `${counts.duplicate_in_file} row(s) repeat an employee ID. One salary is in force per person, ` +
        'so the file cannot say which of the two it is.',
      detail: out.filter((r) => r.status === 'duplicate_in_file')
        .slice(0, DETAIL_LIMIT).map((r) => `row ${r.row_number}: ${r.employee_code}`),
    });
  }

  if (counts.importable === 0) {
    blocks.push({
      kind: 'unmatched', severity: 'hard', count: counts.total,
      message: `None of the ${counts.total} row(s) resolve to a payable staff member, so this import would write nothing.`,
      detail: [],
    });
  }

  if (counts.unmatched > 0) {
    blocks.push({
      kind: 'unmatched',
      severity: 'acknowledgeable',
      count: counts.unmatched,
      message:
        `${counts.unmatched} employee ID(s) match no staff record and will be skipped. ` +
        'Add them to the staff module first if they should be paid.',
      detail: out.filter((r) => r.status === 'unmatched')
        .slice(0, DETAIL_LIMIT).map((r) => `${r.employee_code} · ${r.employee_name_in_file ?? '(no name)'}`),
    });
  }

  // Skipped, not blocked — same treatment as an unmatched code. The category
  // flag is an HR-scope decision, not a data error in the sheet, so the rest of
  // the file still imports; the block just makes the exclusion visible instead
  // of letting these rows vanish into a bare "skipped" count.
  if (counts.not_in_hr > 0) {
    blocks.push({
      kind: 'not_in_hr',
      severity: 'acknowledgeable',
      count: counts.not_in_hr,
      message:
        `${counts.not_in_hr} employee ID(s) belong to an employment category excluded from HR ` +
        '(Ayaah, Driver, Security, Warden, Hostel, Cooking Master) and will be skipped. ' +
        'Turn on "Included in HR" for the category if they should be paid through payroll.',
      detail: out.filter((r) => r.status === 'not_in_hr')
        .slice(0, DETAIL_LIMIT).map((r) => `${r.employee_code} · ${r.staff_name ?? ''}`),
    });
  }

  if (counts.no_payroll_org > 0) {
    blocks.push({
      kind: 'no_payroll_org',
      severity: 'acknowledgeable',
      count: counts.no_payroll_org,
      message:
        `${counts.no_payroll_org} staff member(s) have no payroll organisation and will be skipped. ` +
        'Assign one in Payroll › Organisation, then re-upload.',
      detail: out.filter((r) => r.status === 'no_payroll_org')
        .slice(0, DETAIL_LIMIT).map((r) => `${r.employee_code} · ${r.staff_name ?? ''}`),
    });
  }

  if (counts.invalid_amount > 0) {
    blocks.push({
      kind: 'invalid_amount', severity: 'acknowledgeable', count: counts.invalid_amount,
      message: `${counts.invalid_amount} row(s) have no usable Basic Salary and will be skipped.`,
      detail: out.filter((r) => r.status === 'invalid_amount')
        .slice(0, DETAIL_LIMIT).map((r) => `row ${r.row_number}: ${r.employee_code}`),
    });
  }

  // Relieved staff are NOT blocked. A final settlement is paid to someone who
  // has already left, so refusing the row would be wrong — but it is worth
  // saying out loud before ₹ lands against an inactive record.
  const relieved = importable.filter((r) => r.is_relieved);
  if (relieved.length > 0) {
    blocks.push({
      kind: 'relieved_staff', severity: 'acknowledgeable', count: relieved.length,
      message: `${relieved.length} of the staff being imported are marked relieved (inactive).`,
      detail: relieved.slice(0, DETAIL_LIMIT).map((r) => `${r.employee_code} · ${r.staff_name ?? ''}`),
    });
  }

  // The sheet ships Gross_Annual_Salary as its own column. It held monthly x 12
  // on every row of the reference file; a row where it does not is a typo in
  // one of the two, and only a human can say which.
  const mismatched = out.filter((r) => r.annual_mismatch);
  if (mismatched.length > 0) {
    blocks.push({
      kind: 'annual_mismatch', severity: 'acknowledgeable', count: mismatched.length,
      message:
        `${mismatched.length} row(s) have a Gross Annual Salary that is not Basic x 12. ` +
        'The monthly figure is what gets stored — check these before continuing.',
      detail: mismatched.slice(0, DETAIL_LIMIT).map(
        (r) => `${r.employee_code}: ${r.monthly_gross} x 12 != ${r.annual_gross_in_file}`),
    });
  }

  // An EPF/ESI figure typed against a flag that reads "No". Informational, never
  // blocking: the amount is simply not stored, and aborting a 754-row import
  // over a leftover cell would be a worse outcome than a line of explanation.
  const orphanedContribution = rows.filter(
    (r) =>
      (!r.eligible_for_pf && (r.epf_amount ?? 0) > 0) ||
      (!r.eligible_for_esi && (r.esi_amount ?? 0) > 0)
  );
  if (orphanedContribution.length > 0) {
    blocks.push({
      kind: 'no_change', severity: 'info', count: orphanedContribution.length,
      message:
        `${orphanedContribution.length} row(s) carry an EPF or ESI amount while the matching ` +
        'eligibility column reads "No". Those amounts will not be stored — set the flag to Yes ' +
        'if the deduction is real.',
      detail: orphanedContribution.slice(0, DETAIL_LIMIT).map(
        (r) => `row ${r.row_number}: ${r.employee_code}`),
    });
  }

  if (counts.unchanged > 0) {
    blocks.push({
      kind: 'no_change', severity: 'info', count: counts.unchanged,
      message: `${counts.unchanged} row(s) already hold this exact salary and will be left alone.`,
      detail: [],
    });
  }

  return {
    rows: out,
    counts,
    blocks,
    can_import: !blocks.some((b) => b.severity === 'hard'),
    requires_acknowledgement: blocks.some((b) => b.severity === 'acknowledgeable'),
  };
}
