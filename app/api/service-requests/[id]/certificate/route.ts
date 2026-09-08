// app/api/service-requests/[id]/certificate/route.ts
// ============================================================================
// GET /api/service-requests/[id]/certificate?template=bonafide
//     &date=2026-08-27&purpose=Scholarship&completion_month=April%202026
//     &year_of_study=I&download=1
//
// Streams a print-ready A4 PDF certificate for an APPROVED service request.
// Office staff (service_requests.manage) or super admins only; the template
// must be enabled on the request's service type. `download=1` sets a
// Content-Disposition attachment and records the issue on the timeline —
// preview loads (no flag) render inline and are not logged.
// ============================================================================

// @react-pdf/renderer needs Node streams; cannot run on edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse, connection } from 'next/server';
import { z } from 'zod';
import { currentUser } from '@/lib/utils/parent-admin-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { ServiceRequestTimelineService } from '@/lib/services/service-requests/service-request-timeline-service';
import {
  CERTIFICATE_TEMPLATE_KEYS,
  getCertificateTemplate,
  type CertificateOverrides,
} from '@/lib/certificates/registry';
import { resolveCertificateSubject } from '@/lib/certificates/resolve-data';
import { certificateFileName, renderCertificatePdf } from '@/lib/certificates/render';

const CERTIFICATE_PERMISSION = 'service_requests.manage';
const ISSUABLE_STATUSES = new Set(['approved', 'fulfilled', 'closed']);

const querySchema = z.object({
  template: z.enum(CERTIFICATE_TEMPLATE_KEYS as [string, ...string[]]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  purpose: z.string().max(200).optional(),
  completion_month: z.string().max(60).optional(),
  year_of_study: z.string().max(10).optional(),
  download: z.enum(['1', 'true']).optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await params;

    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!user.isSuperAdmin && user.permissions[CERTIFICATE_PERMISSION] !== true) {
      return NextResponse.json(
        { error: 'You do not have permission to issue certificates' },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid certificate request', details: parsed.error.errors },
        { status: 400 }
      );
    }
    const q = parsed.data;
    const template = q.template as (typeof CERTIFICATE_TEMPLATE_KEYS)[number];

    // Request + the service type's enabled templates. Service-role read: the
    // caller is office staff, whose row visibility RLS does not guarantee.
    const db = createServiceRoleClient() as any;
    const { data: sr, error } = await db
      .from('service_requests')
      .select('id, request_number, status, service_type:service_types(id, name, certificate_template_keys)')
      .eq('id', id)
      .single();
    if (error || !sr) {
      return NextResponse.json({ error: 'Service request not found' }, { status: 404 });
    }
    if (!ISSUABLE_STATUSES.has(sr.status)) {
      return NextResponse.json(
        { error: 'Certificates can only be issued for approved requests' },
        { status: 400 }
      );
    }
    const enabled: string[] = sr.service_type?.certificate_template_keys ?? [];
    if (!enabled.includes(template)) {
      return NextResponse.json(
        { error: 'This certificate is not enabled for the request\'s service type' },
        { status: 400 }
      );
    }

    const { data } = await resolveCertificateSubject(id);
    const overrides: CertificateOverrides = {
      issueDate: q.date,
      purpose: q.purpose,
      completionMonth: q.completion_month,
      yearOfStudy: q.year_of_study,
    };

    const pdf = await renderCertificatePdf(template, data, overrides);
    const fileName = certificateFileName(template, data);
    const isDownload = Boolean(q.download);

    if (isDownload) {
      // Best-effort audit entry; a logging failure must not block the print.
      try {
        await ServiceRequestTimelineService.addTimelineEntry(id, {
          actor_id: user.id,
          event_type: 'system',
          is_internal: true,
          content: `${getCertificateTemplate(template).label} generated`,
          metadata: { certificate_template: template, file_name: fileName, overrides },
        });
      } catch (logError) {
        console.warn('[service-requests/certificate] timeline log failed:', logError);
      }
    }

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(pdf.length),
        'Content-Disposition': `${isDownload ? 'attachment' : 'inline'}; filename="${fileName}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('[service-requests/certificate] GET error:', error);
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json({ error: 'Service request not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
