// app/api/accreditation/naac/qas-73-draft/route.ts
// ============================================================================
// GET /api/accreditation/naac/qas-73-draft?period=AY%202026-27&institutionId=<uuid>
//
// Downloads a "Metric 7.3 Quality Assurance System" evidence draft (Binary
// Accreditation Framework 2024) as markdown (Content-Disposition attachment),
// generated from the closed-loop quality evidence PR-1's rollup writes into
// quality_evidence_mappings (body_code='NAAC', metric_code 7.3.d/7.3.e/7.3.f,
// is_auto=true). The pre-existing 7.3.1 row (meeting frequency) is excluded.
// Under the outgoing framework this evidence maps to AQAR Criterion 6.5.
//
// Query params:
//   - period        optional 'AY 2026-27'-style label; defaults to current AY
//   - institutionId optional uuid; omitted = cluster-wide (RLS still applies)
//
// Auth (same pattern as the existing NAAC evidence export route,
// app/api/ai-pulse/evidence/naac/export/route.ts):
//   - session-based Supabase client (cookies) — reads are RLS-governed,
//     NEVER service-role.
//   - requires the existing `accreditation.naac.dcf_export` permission
//     ("Export NAAC DCF / AQAR Workbook"); super-admin bypass is built into
//     the user_has_permission RPC.
//
// Honest scaffolding: facets with zero rows say "No measured cycles recorded
// for <period>" — the draft never invents numbers. Until PR-1's migration +
// first cron run, the whole draft is empty-state prose.
//
// Loop → accreditation bridge, PR-2 of 2 (2026-07-09).
// ============================================================================

export const dynamic = 'force-dynamic';

import { NextResponse, connection, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { LoopEvidenceService } from '@/lib/services/accreditation/loop-evidence-service';

const AY_LABEL_RE = /^AY \d{4}-\d{2}$/;

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Permission gate — reuse the existing NAAC DCF/AQAR export key.
    const { data: canExport } = await (supabase as any).rpc('user_has_permission', {
      permission_name: 'accreditation.naac.dcf_export',
    });
    if (!canExport) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(request.url);
    const institutionId = url.searchParams.get('institutionId');
    const periodRaw = url.searchParams.get('period');
    const period =
      periodRaw && AY_LABEL_RE.test(periodRaw)
        ? periodRaw
        : LoopEvidenceService.currentAcademicYearLabel();

    // Scope label — resolve the institution name when a specific college is
    // requested (RLS on institutions applies via the session client).
    let scopeLabel = 'All JKKN institutions (cluster)';
    if (institutionId) {
      const { data: inst } = await (supabase as any)
        .from('institutions')
        .select('name, iqac_code')
        .eq('id', institutionId)
        .maybeSingle();
      if (!inst) {
        return NextResponse.json(
          { error: 'Institution not found or not accessible' },
          { status: 404 },
        );
      }
      scopeLabel = inst.iqac_code ? `[${inst.iqac_code}] ${inst.name}` : inst.name;
    }

    // RLS-governed read via the session client.
    const rows = await LoopEvidenceService.getLoopEvidenceRows(supabase as any, {
      institutionId: institutionId || null,
      period,
    });

    const markdown = LoopEvidenceService.buildQas73DraftMarkdown(rows, {
      period,
      scopeLabel,
    });

    const periodSlug = period.toLowerCase().replace(/\s+/g, '-');
    const filename = `naac-7.3-qas-evidence-draft-${periodSlug}-${new Date()
      .toISOString()
      .slice(0, 10)}.md`;

    return new NextResponse(markdown, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[/api/accreditation/naac/qas-73-draft] failed:', message);
    return NextResponse.json(
      { error: 'Failed to generate Metric 7.3 evidence draft', message },
      { status: 500 },
    );
  }
}
