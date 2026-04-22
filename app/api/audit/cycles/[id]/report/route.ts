export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Node runtime required: docx + jspdf use Node Buffer / streams internally.

// GET /api/audit/cycles/[id]/report?format=pdf|docx
// Returns the cycle report as a binary attachment.
// Security: session-only (no api-key). Callers must have audit.cycle.view OR
// be super_admin — enforced via user_has_permission RPC.
//
// Spec: specs/myjkkn-audit-workflow-sprint-01-plan.md §T18 (on-demand cycle report)

import { NextResponse, connection } from 'next/server';
import { createServerSupabaseClient, getAuthSession } from '@/lib/supabase/server';
import { AuditReportService, type AuditReportFormat } from '@/lib/services/audit';

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();

  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Permission gate — lead_auditor (audit.cycle.view) OR super_admin.
    // The DB RLS on audit_cycles already rejects reads from callers without
    // this permission, so a denied check here short-circuits before we spend
    // CPU on PDF/DOCX generation.
    const supabase = await createServerSupabaseClient();
    const [superAdminRes, permRes] = await Promise.all([
      (supabase as any).rpc('is_super_admin'),
      (supabase as any).rpc('user_has_permission', {
        permission_name: 'audit.cycle.view',
      }),
    ]);

    const isSuperAdmin = superAdminRes.data === true;
    const hasAuditView = permRes.data === true;
    if (!isSuperAdmin && !hasAuditView) {
      return NextResponse.json(
        { error: 'Forbidden: audit.cycle.view permission required' },
        { status: 403 }
      );
    }

    const { id: cycleId } = await params;
    if (!cycleId) {
      return NextResponse.json({ error: 'Missing cycle id' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const format = (searchParams.get('format') ?? 'pdf').toLowerCase() as AuditReportFormat;
    if (format !== 'pdf' && format !== 'docx') {
      return NextResponse.json(
        { error: 'Invalid format. Use pdf or docx.' },
        { status: 400 }
      );
    }

    const buffer = await AuditReportService.generateReport(cycleId, format);

    // Filename: audit-report-<cycle-slug>-<YYYY-MM-DD>.<ext>
    const bundle = await AuditReportService.loadBundle(cycleId);
    const datestamp = new Date().toISOString().slice(0, 10);
    const filename = `audit-report-${slugify(bundle.cycle.name)}-${datestamp}.${format}`;

    const contentType =
      format === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    const lowered = message.toLowerCase();
    let status = 500;
    if (lowered.includes('not found')) status = 404;
    else if (lowered.includes('permission')) status = 403;

    console.error('[audit/cycles/report] GET error:', error);
    return NextResponse.json({ error: message }, { status });
  }
}
