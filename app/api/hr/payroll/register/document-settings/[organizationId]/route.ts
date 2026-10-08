export const dynamic = 'force-dynamic';

/**
 * GET /api/hr/payroll/register/document-settings/[organizationId]
 *   The Bank Letter / Chairperson Approval constants for one paying
 *   institution — or, when nobody has saved them yet, suggested values with
 *   `saved: false`. Gated on register.VIEW: whoever can download the documents
 *   can see what they will print.
 *
 * PUT /api/hr/payroll/register/document-settings/[organizationId]
 *   Save them. Gated on register.MANAGE — the same act as editing the register.
 *   RLS on hr_payroll_document_settings enforces both again.
 */

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { PayrollDocumentSettingsService } from '@/lib/services/hr/payroll/payroll-document-settings-service';
import { payrollDocumentSettingsSchema } from '@/lib/validations/payroll-document-settings';
import type { PayrollDocumentSettingsInput } from '@/types/hr-payroll';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET = withAuth(
  async (_request, auth, context) => {
    await connection();
    try {
      const params = await context?.params;
      const organizationId = params?.organizationId;
      if (!organizationId || !UUID_RE.test(organizationId)) {
        return NextResponse.json({ error: 'A valid organizationId is required' }, { status: 400 });
      }

      const result = await PayrollDocumentSettingsService.get(auth.supabase, organizationId);
      return NextResponse.json(result);
    } catch (err: any) {
      console.error('[Payroll documents] settings read error:', err);
      return NextResponse.json(
        { error: err?.message ?? 'Failed to load the document settings' },
        { status: 500 },
      );
    }
  },
  { requirePermission: 'hr.payroll.register.view', requiredPermission: 'read' },
);

export const PUT = withAuth(
  async (request, auth, context) => {
    await connection();
    try {
      const params = await context?.params;
      const organizationId = params?.organizationId;
      if (!organizationId || !UUID_RE.test(organizationId)) {
        return NextResponse.json({ error: 'A valid organizationId is required' }, { status: 400 });
      }

      const body = await request.json().catch(() => null);
      const parsed = payrollDocumentSettingsSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues.map((i) => i.message).join('; ') },
          { status: 400 },
        );
      }

      const settings = await PayrollDocumentSettingsService.upsert(
        auth.supabase,
        organizationId,
        // Validated above; the cast restores the required-ness z.infer drops
        // while strictNullChecks is off in this repo.
        { ...parsed.data, non_teaching_suffix: parsed.data.non_teaching_suffix ?? '' } as PayrollDocumentSettingsInput,
        auth.user?.id ?? null,
      );
      return NextResponse.json({ saved: true, settings });
    } catch (err: any) {
      console.error('[Payroll documents] settings save error:', err);
      return NextResponse.json(
        { error: err?.message ?? 'Failed to save the document settings' },
        { status: 422 },
      );
    }
  },
  { requirePermission: 'hr.payroll.register.manage', requiredPermission: 'write' },
);
