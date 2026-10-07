export const dynamic = 'force-dynamic';

/**
 * GET /api/hr/payroll/register/[runId]/documents
 *   ?doc=bank_letter|chairperson_approval
 *   &category=teaching|non_teaching
 *   &date=YYYY-MM-DD          (letter date; defaults to today in IST)
 *   &cheque=…                 (optional; left blank to write in by hand)
 *
 * Streams one Word document for one category of one register: the covering
 * letter to the college's bank (with the salary list it encloses), or the
 * requisition submitted to the Chairperson. See salary-register-documents.ts.
 *
 * Gated on register.VIEW, like the workbook export: it reads a register that
 * already exists and changes nothing.
 *
 * 409 — the college's document details (ref code, bank, account) were never
 *       saved. A suggested default is not printed onto a letter to a bank.
 * 422 — nobody in that category is paid on this register.
 */

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { SalaryRegisterService } from '@/lib/services/hr/payroll/salary-register-service';
import { PayrollDocumentSettingsService } from '@/lib/services/hr/payroll/payroll-document-settings-service';
import { buildPayrollDocument } from '@/lib/services/hr/payroll/salary-register-documents';
import {
  STAFF_CATEGORY_LABEL,
  linesForCategory,
  payrollDocumentFilename,
  todayIso,
} from '@/lib/services/hr/payroll/salary-register-document-model';
import type { PayrollDocumentKind, StaffCategoryKey } from '@/types/hr-payroll';

const DOC_KINDS: PayrollDocumentKind[] = ['bank_letter', 'chairperson_approval'];
const CATEGORIES: StaffCategoryKey[] = ['teaching', 'non_teaching'];
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const GET = withAuth(
  async (request, auth, context) => {
    await connection();
    try {
      const params = await context?.params;
      const runId = params?.runId;
      if (!runId) {
        return NextResponse.json({ error: 'runId is required' }, { status: 400 });
      }

      const url = new URL(request.url);
      const doc = url.searchParams.get('doc') as PayrollDocumentKind | null;
      const category = url.searchParams.get('category') as StaffCategoryKey | null;
      const date = url.searchParams.get('date') || todayIso();
      const cheque = (url.searchParams.get('cheque') ?? '').trim().slice(0, 30) || null;

      if (!doc || !DOC_KINDS.includes(doc)) {
        return NextResponse.json({ error: 'doc must be bank_letter or chairperson_approval' }, { status: 400 });
      }
      if (!category || !CATEGORIES.includes(category)) {
        return NextResponse.json({ error: 'category must be teaching or non_teaching' }, { status: 400 });
      }
      if (!ISO_DATE_RE.test(date) || Number.isNaN(Date.parse(date))) {
        return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
      }

      const detail = await SalaryRegisterService.getRunDetail(auth.supabase, runId);

      if (linesForCategory(detail.lines, category).length === 0) {
        return NextResponse.json(
          { error: `No ${STAFF_CATEGORY_LABEL[category].toLowerCase()} staff are paid on this register.` },
          { status: 422 },
        );
      }

      const { saved, settings } = await PayrollDocumentSettingsService.get(
        auth.supabase,
        detail.run.hr_organization_id,
      );
      if (!saved) {
        return NextResponse.json(
          {
            error: `The document details for ${detail.organisation_name} (reference code, bank and account number) have not been saved yet.`,
          },
          { status: 409 },
        );
      }

      const buffer = await buildPayrollDocument({
        kind: doc,
        category,
        // The PAYING institution — whose register, cheque and letterhead this is.
        organisationName: detail.organisation_name,
        periodYear: detail.run.period_year,
        periodMonth: detail.run.period_month,
        letterDate: date,
        chequeNumber: cheque,
        settings,
        lines: detail.lines,
      });

      const filename = payrollDocumentFilename(
        doc,
        category,
        detail.organisation_name,
        detail.run.period_year,
        detail.run.period_month,
      );

      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          // RFC 5987 filename* as well as filename — institution names carry
          // spaces and parentheses.
          'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
          'Cache-Control': 'no-store',
        },
      });
    } catch (err: any) {
      console.error('[Salary Register] document error:', err);
      return NextResponse.json(
        { error: err?.message ?? 'Failed to generate the document' },
        { status: 500 },
      );
    }
  },
  { requirePermission: 'hr.payroll.register.view', requiredPermission: 'read' },
);
