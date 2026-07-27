export const dynamic = 'force-dynamic';

// app/api/billing/schedule/bills/import/route.ts

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import {
  STUDENT_BILL_HEADER_ALIASES,
  STUDENT_BILL_LEGACY_COLUMN_ORDER,
  formatLearnerName,
  normalizeHeaderKey,
  normalizeNameKey,
  normalizeRollKey,
  type ImportError,
  type ImportResult,
  type ImportSuccessRow,
  type LearnerMatchMode,
  type StudentBillField
} from '@/lib/utils/mappings/student-bill-excel-mappings';

/**
 * POST /api/billing/schedule/bills/import
 *
 * Bulk-creates Learner Bills from an uploaded Excel file. Each Excel row
 * is treated as one self-contained bill. Validation runs row-by-row;
 * valid rows commit even when other rows fail (partial-success contract).
 *
 * Columns are resolved BY HEADER TEXT, not by position — see buildColumnMap.
 * The recognised fields are:
 *
 *   Roll Number      → identifies the learner (see resolveLearner)
 *   First Name       → identifies the learner
 *   Last Name        → identifies the learner
 *   Billing Category (required)  → resolves to billing_categories.id
 *   Bill Description (optional)
 *   Due Date         (required)  → ISO yyyy-mm-dd
 *   Billing Amount   (required)  → number ≥ 0
 *   Remarks          (optional)
 *   Academic Year    (optional)  → resolves to academic_years.id, scoped to
 *                                  the learner's institution; blank → NULL
 *
 * A row must carry a roll number, a name, or both. Name-only rows exist
 * because reserved / admitted learners have no roll number yet, and were
 * therefore unbillable through this flow entirely.
 *
 * Note there is deliberately NO lifecycle_status filter: bills are created
 * against nearly every status in production (reserved, rejected, account,
 * waitlisted…), so an allowlist here would break live workflows.
 *
 * Response: { success, successCount, errorCount, totalRows, errors[] }
 */

// ----------------------------------------------------------------------
// Schema for the cleaned, type-coerced row before DB lookup
// ----------------------------------------------------------------------
const billRowSchema = z
  .object({
    // Identity fields are individually optional; the refinement below
    // requires at least one of them per row.
    roll_number: z.string().optional().nullable(),
    first_name: z.string().optional().nullable(),
    last_name: z.string().optional().nullable(),
    billing_category_name: z.string().min(1, 'Billing category is required'),
    bill_description: z.string().optional().nullable(),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Due date must be yyyy-mm-dd'),
    billing_amount: z.number().nonnegative('Billing amount must be ≥ 0'),
    remarks: z.string().optional().nullable(),
    academic_year_name: z.string().optional().nullable()
  })
  .refine(
    (r) =>
      Boolean(
        r.roll_number?.trim() || r.first_name?.trim() || r.last_name?.trim()
      ),
    {
      message:
        'Provide a Roll Number, or a First/Last Name, to identify the learner.',
      path: ['Roll Number']
    }
  );

type CleanedRow = z.infer<typeof billRowSchema>;

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function cellToNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const cleaned = String(value).replace(/[, ₹]/g, '').trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Fields without which a sheet cannot be a bills sheet. Used to decide
 * whether the header row was understood at all.
 */
const REQUIRED_HEADER_FIELDS: StudentBillField[] = [
  'billing_category_name',
  'due_date',
  'billing_amount'
];

/**
 * Maps a sheet's header row to canonical field keys.
 *
 * Reading by header rather than by position is what lets the name columns
 * be inserted at B and C without breaking sheets downloaded before they
 * existed — an old 7-column template still carries recognisable headers, so
 * it maps correctly and simply has no name columns. It also means a user who
 * reorders or hides columns still gets a correct import.
 */
function buildColumnMap(headerCells: unknown[]): Map<StudentBillField, number> {
  const map = new Map<StudentBillField, number>();
  headerCells.forEach((cell, index) => {
    const field = STUDENT_BILL_HEADER_ALIASES[normalizeHeaderKey(cell)];
    // First occurrence wins, so a stray duplicate header further right
    // cannot hijack a column that was already correctly identified.
    if (field && !map.has(field)) map.set(field, index);
  });
  return map;
}

/** Truncates a candidate list for error messages so they stay readable. */
function summarizeNames(names: string[], limit = 5): string {
  const shown = names.slice(0, limit).join(', ');
  return names.length > limit
    ? `${shown}, +${names.length - limit} more`
    : shown;
}

function cellToISODate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  // Excel date serial (number of days since 1900-01-00)
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = Math.round((value - 25569) * 86400 * 1000); // 25569 = days from 1900-01-01 to 1970-01-01
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  // String — accept yyyy-mm-dd directly, otherwise try Date.parse
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

// ----------------------------------------------------------------------
// Route handler
// ----------------------------------------------------------------------

export async function POST(request: NextRequest) {
  await connection();
  try {
    // -- Auth ----------------------------------------------------------
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set(name, value, options);
          },
          remove(name: string, options: any) {
            cookieStore.set(name, '', { ...options, maxAge: 0 });
          }
        }
      }
    );

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // -- File ----------------------------------------------------------
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      return NextResponse.json({ error: 'No sheet found in workbook' }, { status: 400 });
    }

    // Parse to AOA so we can keep row indices honest with respect to header row
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false
    });

    if (rows.length < 2) {
      return NextResponse.json(
        { error: 'File is empty or contains only a header row' },
        { status: 400 }
      );
    }

    // Resolve columns by header text. If the header row can't be understood
    // (renamed or stripped), fall back to the original 7-column positional
    // layout so sheets predating this feature still import.
    const headerCells = (rows[0] ?? []) as unknown[];
    let columnMap = buildColumnMap(headerCells);
    if (!REQUIRED_HEADER_FIELDS.every((f) => columnMap.has(f))) {
      columnMap = new Map(
        STUDENT_BILL_LEGACY_COLUMN_ORDER.map((field, index) => [field, index])
      );
    }
    const cellAt = (cells: unknown[], field: StudentBillField): unknown => {
      const index = columnMap.get(field);
      return index === undefined ? null : cells[index];
    };

    const dataRows = rows.slice(1); // drop header
    const errors: ImportError[] = [];
    const cleanedRows: Array<{ rowNumber: number; cleaned: CleanedRow }> = [];
    // Count every non-blank row once so totalRows reconciles with
    // successes + failures regardless of which stage a row dies in.
    let attemptedRowCount = 0;

    // -- Pre-flight: parse, type-coerce, schema-validate per row -------
    for (let i = 0; i < dataRows.length; i++) {
      const rowNumber = i + 2; // 1-indexed Excel row, +1 for header
      const cells = dataRows[i] || [];

      // Skip fully blank rows quietly
      const isBlank = cells.every(
        (c) => c === null || c === undefined || String(c).trim() === ''
      );
      if (isBlank) continue;
      attemptedRowCount++;

      const parsed = {
        roll_number: cellToString(cellAt(cells, 'roll_number')),
        first_name: cellToString(cellAt(cells, 'first_name')),
        last_name: cellToString(cellAt(cells, 'last_name')),
        billing_category_name: cellToString(cellAt(cells, 'billing_category_name')),
        bill_description: cellToString(cellAt(cells, 'bill_description')) || undefined,
        due_date: cellToISODate(cellAt(cells, 'due_date')) ?? '',
        billing_amount: cellToNumber(cellAt(cells, 'billing_amount')),
        remarks: cellToString(cellAt(cells, 'remarks')) || undefined,
        academic_year_name:
          cellToString(cellAt(cells, 'academic_year_name')) || undefined
      };

      // Identity echoed onto every error so the report names WHO failed,
      // not just which spreadsheet row.
      const identity = {
        roll_number: parsed.roll_number || undefined,
        student_name:
          formatLearnerName(parsed.first_name, parsed.last_name) || undefined
      };

      if (parsed.billing_amount === null) {
        errors.push({
          row: rowNumber,
          field: 'Billing Amount',
          message: 'Billing amount is missing or not a number.',
          ...identity
        });
        continue;
      }

      const validation = billRowSchema.safeParse({
        ...parsed,
        billing_amount: parsed.billing_amount
      });

      if (!validation.success) {
        for (const issue of validation.error.issues) {
          errors.push({
            row: rowNumber,
            field: issue.path.join('.') || undefined,
            message: issue.message,
            ...identity
          });
        }
        continue;
      }

      cleanedRows.push({ rowNumber, cleaned: validation.data });
    }

    if (cleanedRows.length === 0) {
      return NextResponse.json<ImportResult>({
        success: false,
        successCount: 0,
        errorCount: errors.length,
        totalRows: attemptedRowCount,
        errors,
        successes: []
      });
    }

    // -- Resolve learners ----------------------------------------------
    type LearnerCandidate = {
      id: string;
      roll_number: string | null;
      institution_id: string | null;
      name: string;
      nameKey: string;
    };

    const LEARNER_SELECT = 'id, roll_number, institution_id, first_name, last_name';
    const toCandidate = (s: any): LearnerCandidate => ({
      id: s.id,
      roll_number: s.roll_number ?? null,
      institution_id: s.institution_id ?? null,
      name: formatLearnerName(s.first_name, s.last_name),
      nameKey: normalizeNameKey(s.first_name, s.last_name)
    });

    // Query the raw, upper- and lower-cased spellings of each roll number so
    // matching is case-insensitive without needing an ilike per value. Safe
    // against production, which has zero case-only roll variants (4,944
    // distinct both exact and upper-cased), so this widens tolerance without
    // introducing ambiguity.
    const rollQueryValues = Array.from(
      new Set(
        cleanedRows.flatMap((r) => {
          const raw = (r.cleaned.roll_number ?? '').trim();
          return raw ? [raw, raw.toUpperCase(), raw.toLowerCase()] : [];
        })
      )
    );

    // Chunked because an unbounded .in() builds a URL PostgREST rejects with
    // a 400 once a sheet gets large — a 2,000-row upload would send 2,000
    // values in one query string (6,000 with the case variants above).
    const IN_CHUNK_SIZE = 200;
    const candidatesByRoll = new Map<string, LearnerCandidate[]>();

    for (let i = 0; i < rollQueryValues.length; i += IN_CHUNK_SIZE) {
      const chunk = rollQueryValues.slice(i, i + IN_CHUNK_SIZE);
      const { data, error: rollLookupError } = await supabase
        .from('learners_profiles')
        .select(LEARNER_SELECT)
        .in('roll_number', chunk);

      if (rollLookupError) {
        console.error('[bills/import] Roll number lookup failed:', rollLookupError);
        return NextResponse.json(
          {
            error: 'Failed to look up learners by roll number',
            message: rollLookupError.message
          },
          { status: 500 }
        );
      }

      (data ?? []).forEach((s: any) => {
        const candidate = toCandidate(s);
        const key = normalizeRollKey(candidate.roll_number);
        if (!key) return;
        const bucket = candidatesByRoll.get(key);
        if (!bucket) {
          candidatesByRoll.set(key, [candidate]);
        } else if (!bucket.some((existing) => existing.id === candidate.id)) {
          // The three case variants can return the same learner more than
          // once — de-dupe by id so one learner never looks ambiguous.
          bucket.push(candidate);
        }
      });
    }

    // The name index requires pulling the whole roster the caller can see,
    // so build it ONLY when some row has no roll number. When every row
    // carries one — the common case — this costs nothing and the import runs
    // exactly as fast as it did before name matching existed.
    const needsNameIndex = cleanedRows.some(
      (r) =>
        !normalizeRollKey(r.cleaned.roll_number) &&
        normalizeNameKey(r.cleaned.first_name, r.cleaned.last_name)
    );
    const candidatesByName = new Map<string, LearnerCandidate[]>();

    if (needsNameIndex) {
      // Paged: PostgREST caps a plain select() at 1,000 rows, and a silently
      // truncated roster would report real learners as "not found".
      const ROSTER_PAGE_SIZE = 1000;
      const ROSTER_HARD_CAP = 20000;
      for (let offset = 0; offset < ROSTER_HARD_CAP; offset += ROSTER_PAGE_SIZE) {
        const { data: page, error: rosterError } = await supabase
          .from('learners_profiles')
          .select(LEARNER_SELECT)
          // Stable unique ordering so paging can't skip or repeat rows.
          .order('id', { ascending: true })
          .range(offset, offset + ROSTER_PAGE_SIZE - 1);

        if (rosterError) {
          console.error('[bills/import] Learner roster fetch failed:', rosterError);
          return NextResponse.json(
            {
              error: 'Failed to look up learners by name',
              message: rosterError.message
            },
            { status: 500 }
          );
        }
        if (!page || page.length === 0) break;

        page.forEach((s: any) => {
          const candidate = toCandidate(s);
          if (!candidate.nameKey) return;
          const bucket = candidatesByName.get(candidate.nameKey);
          if (bucket) bucket.push(candidate);
          else candidatesByName.set(candidate.nameKey, [candidate]);
        });

        if (page.length < ROSTER_PAGE_SIZE) break;
      }
    }

    /**
     * The resolution ladder.
     *
     * Ambiguity always rejects and never guesses: an unbilled learner is
     * trivially fixed by re-uploading one row, a learner billed by mistake
     * is not. For the same reason a present-but-unmatched roll number is NOT
     * retried as a name — silently re-routing could bill someone other than
     * the person the sheet named.
     */
    // Flat optional fields rather than a discriminated union on an `ok`
    // flag: this project runs with `strictNullChecks: false` (tsconfig, for
    // the Next.js 16 migration), under which TypeScript does NOT narrow a
    // union by a boolean literal discriminant — `if (!r.ok)` left `r` as the
    // full union and every `r.field` access was a TS2339. Presence of
    // `candidate` is the discriminator instead, and it narrows fine.
    type Resolution = {
      candidate?: LearnerCandidate;
      matchedBy?: LearnerMatchMode;
      /** Populated only when resolution failed. */
      field?: string;
      message?: string;
    };

    const resolveLearner = (cleaned: CleanedRow): Resolution => {
      const typedRoll = (cleaned.roll_number ?? '').trim();
      const rollKey = normalizeRollKey(cleaned.roll_number);
      const nameKey = normalizeNameKey(cleaned.first_name, cleaned.last_name);
      const typedName = formatLearnerName(cleaned.first_name, cleaned.last_name);

      if (rollKey) {
        const candidates = candidatesByRoll.get(rollKey) ?? [];

        if (candidates.length === 0) {
          return {
            field: 'Roll Number',
            message: `No learner found with roll number "${typedRoll}".`
          };
        }

        if (candidates.length === 1) {
          const only = candidates[0];
          if (nameKey && only.nameKey !== nameKey) {
            return {
              field: 'First Name / Last Name',
              message: `Name "${typedName}" does not match roll number "${typedRoll}" — that roll number belongs to "${only.name}".`
            };
          }
          return {
            candidate: only,
            matchedBy: nameKey ? 'roll+name' : 'roll'
          };
        }

        // Several learners share this roll number — 112 such groups exist in
        // production, and 104 of them are separable by name.
        const allNames = summarizeNames(candidates.map((c) => c.name));
        if (!nameKey) {
          return {
            field: 'Roll Number',
            message: `Roll number "${typedRoll}" matches ${candidates.length} learners (${allNames}) — add First/Last Name to identify the right one.`
          };
        }

        const narrowed = candidates.filter((c) => c.nameKey === nameKey);
        if (narrowed.length === 1) {
          return { candidate: narrowed[0], matchedBy: 'roll+name' };
        }
        if (narrowed.length === 0) {
          return {
            field: 'First Name / Last Name',
            message: `Roll number "${typedRoll}" matches ${candidates.length} learners (${allNames}), none named "${typedName}".`
          };
        }
        return {
          field: 'First Name / Last Name',
          message: `Roll number "${typedRoll}" matches ${narrowed.length} learners all named "${typedName}" — these duplicate records must be merged before they can be billed.`
        };
      }

      if (!nameKey) {
        return {
          field: 'Roll Number',
          message:
            'Provide a Roll Number, or a First/Last Name, to identify the learner.'
        };
      }

      // Name-only — the path that makes reserved / admitted learners billable.
      const byName = candidatesByName.get(nameKey) ?? [];
      if (byName.length === 0) {
        return {
          field: 'First Name / Last Name',
          message: `No learner found named "${typedName}". Check the spelling against the hidden "Learners" sheet in the template.`
        };
      }
      if (byName.length === 1) {
        return { candidate: byName[0], matchedBy: 'name' };
      }
      const rollHint = summarizeNames(
        byName.map((c) => c.roll_number?.trim() || '(no roll number)')
      );
      return {
        field: 'First Name / Last Name',
        message: `Name "${typedName}" matches ${byName.length} learners (roll numbers: ${rollHint}) — add the Roll Number to identify the right one.`
      };
    };

    // Resolve every row first, so the academic-year batch below can be keyed
    // on the institutions actually in play regardless of how each learner
    // was identified.
    const resolvedRows: Array<{
      rowNumber: number;
      cleaned: CleanedRow;
      candidate: LearnerCandidate;
      matchedBy: LearnerMatchMode;
    }> = [];

    for (const { rowNumber, cleaned } of cleanedRows) {
      const resolution = resolveLearner(cleaned);
      const typedName = formatLearnerName(cleaned.first_name, cleaned.last_name);

      if (!resolution.candidate) {
        errors.push({
          row: rowNumber,
          field: resolution.field,
          message: resolution.message,
          roll_number: (cleaned.roll_number ?? '').trim() || undefined,
          student_name: typedName || undefined
        });
        continue;
      }

      if (!resolution.candidate.institution_id) {
        errors.push({
          row: rowNumber,
          field: 'Roll Number',
          message: `Learner "${resolution.candidate.name}" has no institution attached — fix the learner record first.`,
          roll_number: (cleaned.roll_number ?? '').trim() || undefined,
          student_name: resolution.candidate.name
        });
        continue;
      }

      resolvedRows.push({
        rowNumber,
        cleaned,
        candidate: resolution.candidate,
        matchedBy: resolution.matchedBy
      });
    }

    const uniqueCategoryNames = Array.from(
      new Set(cleanedRows.map((r) => r.cleaned.billing_category_name))
    );

    // Batch-load academic years for the institutions in play. Years are
    // per-institution, so the same name (e.g. "2024-2025") repeats across
    // institutions with different ids — we key resolution by institution.
    const institutionIds = Array.from(
      new Set(
        resolvedRows
          .map((r) => r.candidate.institution_id)
          .filter((x): x is string => Boolean(x))
      )
    );
    const { data: acadYears } = await supabase
      .from('academic_years')
      .select('id, academic_year_name, institution_id')
      .in(
        'institution_id',
        institutionIds.length ? institutionIds : ['00000000-0000-0000-0000-000000000000']
      );
    const acadYearByInstName = new Map<string, string>();
    (acadYears ?? []).forEach((y: any) => {
      acadYearByInstName.set(
        `${y.institution_id}::${String(y.academic_year_name).trim().toLowerCase()}`,
        y.id
      );
    });

    const { data: categories } = await supabase
      .from('billing_categories')
      .select('id, category_name, is_active')
      .in('category_name', uniqueCategoryNames);

    const categoryByName = new Map<string, string>();
    (categories ?? []).forEach((c: any) => {
      if (c.is_active !== false) {
        categoryByName.set(c.category_name, c.id);
      }
    });

    // -- Build insert rows for entries that pass lookup ----------------
    const insertRows: any[] = [];
    // Per-row learner detail kept in lockstep with insertRows (same index)
    // so successes can be echoed back — and named — after the batch insert.
    const pendingSuccesses: ImportSuccessRow[] = [];

    for (const { rowNumber, cleaned, candidate, matchedBy } of resolvedRows) {
      // Report the roll number ON RECORD, falling back to what the sheet
      // said. A name-only row has no roll in the sheet, but the learner may
      // well have one — showing it makes the report far easier to reconcile.
      const reportedRoll =
        candidate.roll_number?.trim() || (cleaned.roll_number ?? '').trim();

      const categoryId = categoryByName.get(cleaned.billing_category_name);
      if (!categoryId) {
        errors.push({
          row: rowNumber,
          field: 'Billing Category',
          message: `Billing category "${cleaned.billing_category_name}" does not exist or is inactive.`,
          roll_number: reportedRoll || undefined,
          student_name: candidate.name
        });
        continue;
      }

      // Resolve the optional academic year against this learner's institution.
      // Blank → null ("Unspecified"); a non-blank, unmatched name rejects the row.
      let academicYearId: string | null = null;
      if (cleaned.academic_year_name) {
        const resolved = acadYearByInstName.get(
          `${candidate.institution_id}::${cleaned.academic_year_name.trim().toLowerCase()}`
        );
        if (!resolved) {
          errors.push({
            row: rowNumber,
            field: 'Academic Year',
            message: `Academic year "${cleaned.academic_year_name}" not found for this learner's institution.`,
            roll_number: reportedRoll || undefined,
            student_name: candidate.name
          });
          continue;
        }
        academicYearId = resolved;
      }

      const totalAmount = cleaned.billing_amount; // quantity defaults to 1, no tax in this flow
      insertRows.push({
        student_id: candidate.id,
        institution_id: candidate.institution_id,
        item_category_id: categoryId,
        academic_year_id: academicYearId,
        bill_description: cleaned.bill_description || null,
        due_date: cleaned.due_date,
        quantity: 1,
        unit_amount: cleaned.billing_amount,
        total_amount: totalAmount,
        tax_amount: 0,
        final_amount: totalAmount,
        balance_amount: totalAmount,
        remarks: cleaned.remarks || null,
        is_recurring: false,
        created_by: user.id
      });
      pendingSuccesses.push({
        row: rowNumber,
        roll_number: reportedRoll,
        student_name: candidate.name,
        billing_category: cleaned.billing_category_name,
        due_date: cleaned.due_date,
        billing_amount: cleaned.billing_amount,
        academic_year: cleaned.academic_year_name || null,
        matched_by: matchedBy
      });
    }

    if (insertRows.length === 0) {
      return NextResponse.json<ImportResult>({
        success: false,
        successCount: 0,
        errorCount: errors.length,
        totalRows: attemptedRowCount,
        errors,
        successes: []
      });
    }

    // -- Insert in one batch (RLS-respecting; auth user will be evaluated)
    const { data: inserted, error: insertError } = await supabase
      .from('billing_student_bills')
      .insert(insertRows)
      .select('id');

    if (insertError) {
      console.error('[bills/import] Insert error:', insertError);
      // The batch insert is all-or-nothing, so every pending row failed —
      // surface each learner so the failure report names them all.
      for (const pending of pendingSuccesses) {
        errors.push({
          row: pending.row,
          message: `Database insert failed: ${insertError.message}`,
          roll_number: pending.roll_number,
          student_name: pending.student_name
        });
      }
      return NextResponse.json<ImportResult>({
        success: false,
        successCount: 0,
        errorCount: errors.length,
        totalRows: attemptedRowCount,
        errors,
        successes: []
      });
    }

    const successCount = inserted?.length ?? insertRows.length;
    // PostgREST returns inserted rows in input order, so index i of
    // `inserted` is the bill created from insertRows[i] / pendingSuccesses[i].
    const successes: ImportSuccessRow[] = pendingSuccesses.map((s, i) => ({
      ...s,
      bill_id: inserted?.[i]?.id
    }));

    return NextResponse.json<ImportResult>({
      success: errors.length === 0,
      successCount,
      errorCount: errors.length,
      totalRows: attemptedRowCount,
      errors,
      successes
    });
  } catch (error) {
    console.error('[billing/schedule/bills/import] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to process import', message: errorMessage },
      { status: 500 }
    );
  }
}
