// app/api/users/permissions-audit/compliance-report/route.ts
// ============================================================================
// GET /api/users/permissions-audit/compliance-report
// Returns a server-rendered PDF of the Permissions Compliance Report.
// Super admin only. Reads via a service-role client so RLS doesn't block the
// aggregate queries. Every download is logged to role_audit_log.
// ============================================================================

// Node runtime so @react-pdf/renderer can use Node streams + fonts.
// Cannot run on edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { createElement, type ReactElement } from 'react';
import { ComplianceReportPdf } from '@/components/permissions-audit/compliance-report-pdf';
import { getComplianceReportData } from '@/lib/services/permissions-audit/compliance-report-service';

export async function GET() {
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
          set(name: string, value: string, options: any) {
            cookieStore.set(name, value, options);
          },
          remove(name: string, options: any) {
            cookieStore.set(name, '', { ...options, maxAge: 0 });
          },
        },
      },
    );

    // ── Auth: must be signed in ──────────────────────────────────────────
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Auth: must be super admin ────────────────────────────────────────
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email, full_name, role, is_super_admin')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const isSuperAdmin =
      profile.is_super_admin === true || profile.role === 'super_admin';
    if (!isSuperAdmin) {
      return NextResponse.json(
        { error: 'Only super administrators can download the compliance report.' },
        { status: 403 },
      );
    }

    // ── Use a service-role client for the aggregate reads ────────────────
    // The compliance report needs counts across ALL profiles & roles, which
    // RLS would limit. We've already confirmed the caller is a super admin
    // above, so elevating here is safe.
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const data = await getComplianceReportData(serviceClient, {
      email: profile.email || user.email || 'unknown',
      fullName: profile.full_name ?? null,
    });

    // ── Render the PDF to a buffer ───────────────────────────────────────
    // ComplianceReportPdf returns a <Document>, but TS can't narrow the JSX
    // return to DocumentProps — cast through unknown to satisfy the render
    // API's type guard.
    const pdfElement = createElement(ComplianceReportPdf, { data }) as unknown as ReactElement<DocumentProps>;
    const pdfBuffer = await renderToBuffer(pdfElement);

    // ── Audit: record the download in role_audit_log (best effort) ───────
    // Service role bypasses RLS. If the insert fails, don't block the PDF.
    try {
      await serviceClient.from('role_audit_log').insert({
        action_type: 'compliance_report_downloaded',
        actor_user_id: user.id,
        actor_email: profile.email || user.email || null,
        actor_role: profile.role || null,
        metadata: {
          generatedAt: data.generatedAt,
          totals: data.totals,
        },
      });
    } catch (auditErr) {
      console.error(
        '[permissions-audit/compliance-report] Audit write failed (non-fatal):',
        auditErr,
      );
    }

    // ── Return PDF ──────────────────────────────────────────────────────
    const filename = `MyJKKN-Permissions-Compliance-${data.generatedAt.slice(0, 10)}.pdf`;
    // Convert Node Buffer → Uint8Array for NextResponse body (edge-compat safe)
    const body = new Uint8Array(pdfBuffer);
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store, no-cache, must-revalidate',
        'Content-Length': String(body.byteLength),
      },
    });
  } catch (err) {
    console.error(
      '[permissions-audit/compliance-report] Failed to generate report:',
      err,
    );
    return NextResponse.json(
      { error: 'Failed to generate compliance report.' },
      { status: 500 },
    );
  }
}
