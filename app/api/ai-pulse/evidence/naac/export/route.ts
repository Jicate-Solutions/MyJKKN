// app/api/ai-pulse/evidence/naac/export/route.ts
// ============================================================================
// GET /api/ai-pulse/evidence/naac/export
//
// Returns the same payload as /api/ai-pulse/evidence/naac, formatted as
// NAAC Criterion 3.3.1 evidence CSV. Forces an attachment download via
// Content-Disposition.
//
// Column order is locked to spec §7 — IQAC pastes this into the AQAR
// workbook directly.
//
// Header row (row 1, prefixed with `#` so spreadsheets that auto-detect
// headers ignore it). The actual CSV column header row is row 2. This
// dual-header pattern matches the NAAC SSR / DCF convention and is what
// IQAC reviewers expect.
// ============================================================================

export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection, type NextRequest } from 'next/server';
import { parse } from 'json2csv';

import {
  NaacEvidenceService,
  type NaacEvidenceFilters,
  defaultLastQuarter,
} from '@/lib/services/ai-pulse/naac-evidence-service';
import { BaseService } from '@/lib/services/base-service';

// CSV column order — frozen per spec §7 (NAAC Criterion 3.3.1).
const CSV_FIELDS: Array<{ label: string; value: string }> = [
  { label: 'AY', value: 'academic_year' },
  { label: 'Institution', value: 'institution_name' },
  { label: 'Department', value: 'department_name' },
  { label: 'Cycle Date', value: 'cycle_date' },
  { label: 'Team / Project Name', value: 'project_name' },
  { label: 'Description', value: 'description' },
  { label: 'GitHub URL', value: 'github_url' },
  { label: 'Live App URL', value: 'live_app_url' },
  { label: 'Featured Tool', value: 'featured_tool' },
  { label: 'Champion at time', value: 'champion_at_time' },
  { label: 'IG Reach', value: 'ig_reach' },
  { label: 'Proof URLs', value: 'proof_urls' },
];

export async function GET(request: NextRequest) {
  await connection();
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            try {
              cookieStore.set(name, value, options);
            } catch {
              // ignore
            }
          },
          remove(name: string, options: CookieOptions) {
            try {
              cookieStore.set(name, '', { ...options, maxAge: 0 });
            } catch {
              // ignore
            }
          },
        },
      },
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const defaults = defaultLastQuarter();
    const filters: NaacEvidenceFilters = {
      from: url.searchParams.get('from') ?? defaults.from,
      to: url.searchParams.get('to') ?? defaults.to,
      institution_id: url.searchParams.get('institution_id') ?? undefined,
    };

    const response = await BaseService.runWithClient(supabase, () =>
      NaacEvidenceService.getEvidenceRows(filters),
    );

    // ── Build CSV ─────────────────────────────────────────────
    // Row 1 = NAAC-formatted comment header (lines starting with `#`).
    // Row 2 = column labels.
    // Rows 3+ = data.
    const exportedAt = new Date().toISOString();
    const headerLines = [
      `# NAAC Criterion 3.3.1 — Research / Innovation Outputs (AI Pulse Gold Standards)`,
      `# Source: MyJKKN AI Pulse · Generated: ${exportedAt}`,
      `# Range: ${response.summary.range_label} · Institution filter: ${filters.institution_id ?? 'all'}`,
      `# Gold standards: ${response.summary.gold_standard_count} · Departments: ${response.summary.department_count} · Cycles: ${response.summary.cycle_count}`,
    ].join('\n');

    const csvBody = parse(response.rows, { fields: CSV_FIELDS });
    const csv = `${headerLines}\n${csvBody}`;

    const filenameDate = exportedAt.slice(0, 10);
    const filename = `naac-3.3.1-ai-pulse-evidence-${filenameDate}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[/api/ai-pulse/evidence/naac/export] failed:', message);
    return NextResponse.json(
      { error: 'Failed to export NAAC evidence CSV', message },
      { status: 500 },
    );
  }
}
