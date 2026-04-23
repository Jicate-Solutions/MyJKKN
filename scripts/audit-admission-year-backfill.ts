/**
 * scripts/audit-admission-year-backfill.ts
 *
 * One-off ops audit: reports learners_profiles rows whose admission_year
 * cohort either could not be backfilled OR whose legacy integer disagrees
 * with the FK target. Produces a CSV an admin can review before deciding
 * to create missing cohorts or manually relink rows.
 *
 * Created 2026-04-23 as part of PR-4 of the admission-year unification plan.
 *
 * Usage:
 *   tsx scripts/audit-admission-year-backfill.ts [--csv <path>] [--status admitted,active]
 *
 * Defaults:
 *   --csv out/admission-year-audit.csv
 *   --status all   (reports every lifecycle_status; PR-1 only backfilled 'admitted')
 *
 * Exit codes:
 *   0  report written successfully
 *   1  configuration error (missing env vars)
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { argv, exit } from 'node:process';

interface AuditRow {
  id: string;
  application_id: string | null;
  first_name: string;
  last_name: string | null;
  lifecycle_status: string;
  institution_id: string | null;
  program_id: string | null;
  admission_year_int: number | null;
  admission_year_id: string | null;
  admission_year_name: string | null;
  cohort_start: number | null;
  issue: string;
}

function parseArgs() {
  const args = argv.slice(2);
  let csvPath = 'out/admission-year-audit.csv';
  let statusFilter: string | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--csv' && args[i + 1]) csvPath = args[++i];
    if (args[i] === '--status' && args[i + 1]) statusFilter = args[++i];
  }
  return { csvPath, statusFilter };
}

async function main() {
  const { csvPath, statusFilter } = parseArgs();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error(
      '[audit-admission-year] Missing env: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required'
    );
    exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false },
  });

  const issues: AuditRow[] = [];

  // Stream in pages to avoid loading 4,800+ rows at once.
  const pageSize = 500;
  let from = 0;
  let totalScanned = 0;

  while (true) {
    let query = (supabase as any)
      .from('learners_profiles')
      .select(
        'id, application_id, first_name, last_name, lifecycle_status, institution_id, program_id, admission_year, admission_year_id, admission_year_obj:admission_years!admission_year_id(admission_year_name, program_start_year)'
      )
      .range(from, from + pageSize - 1)
      .order('id', { ascending: true });

    if (statusFilter) {
      const statuses = statusFilter.split(',').map((s) => s.trim());
      query = query.in('lifecycle_status', statuses);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[audit-admission-year] Query failed:', error.message);
      exit(1);
    }
    if (!data || data.length === 0) break;

    totalScanned += data.length;

    for (const row of data as any[]) {
      const int = row.admission_year as number | null;
      const fk = row.admission_year_id as string | null;
      const cohort = row.admission_year_obj?.program_start_year as number | null;
      const cohortName = row.admission_year_obj?.admission_year_name as string | null;

      let issue: string | null = null;
      if (row.lifecycle_status === 'admitted' && !fk) {
        issue =
          'admitted row missing admission_year_id (no matching cohort for inst+program; create cohort and re-run backfill)';
      } else if (int != null && fk && cohort != null && int !== cohort) {
        issue = `integer/FK mismatch: admission_year=${int} but cohort.program_start_year=${cohort}`;
      } else if (int != null && !fk && row.institution_id && row.program_id) {
        issue = 'legacy integer set but no FK (candidate for future backfill)';
      }

      if (issue) {
        issues.push({
          id: row.id,
          application_id: row.application_id,
          first_name: row.first_name,
          last_name: row.last_name,
          lifecycle_status: row.lifecycle_status,
          institution_id: row.institution_id,
          program_id: row.program_id,
          admission_year_int: int,
          admission_year_id: fk,
          admission_year_name: cohortName,
          cohort_start: cohort,
          issue,
        });
      }
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  // Write CSV
  mkdirSync(dirname(csvPath), { recursive: true });
  const header = [
    'id',
    'application_id',
    'first_name',
    'last_name',
    'lifecycle_status',
    'institution_id',
    'program_id',
    'admission_year_int',
    'admission_year_id',
    'admission_year_name',
    'cohort_start',
    'issue',
  ].join(',');

  const esc = (v: unknown): string => {
    if (v == null) return '';
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const body = issues
    .map((r) =>
      [
        r.id,
        r.application_id,
        r.first_name,
        r.last_name,
        r.lifecycle_status,
        r.institution_id,
        r.program_id,
        r.admission_year_int,
        r.admission_year_id,
        r.admission_year_name,
        r.cohort_start,
        r.issue,
      ]
        .map(esc)
        .join(',')
    )
    .join('\n');

  writeFileSync(csvPath, header + '\n' + body + '\n', 'utf8');

  console.log(`[audit-admission-year] Scanned ${totalScanned} rows; ${issues.length} issues written to ${csvPath}`);

  // Summary by issue category
  const byIssue = new Map<string, number>();
  for (const r of issues) {
    const cat = r.issue.split(':')[0].split('(')[0].trim();
    byIssue.set(cat, (byIssue.get(cat) ?? 0) + 1);
  }
  for (const [cat, n] of byIssue) {
    console.log(`  • ${cat}: ${n}`);
  }
}

main().catch((err) => {
  console.error('[audit-admission-year] Fatal:', err);
  exit(1);
});
