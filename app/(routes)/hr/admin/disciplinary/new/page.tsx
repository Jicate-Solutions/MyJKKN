// ============================================================================
// /hr/admin/disciplinary/new — Initiate disciplinary case
// ============================================================================
// T6.2 spec — HR Admin lands here to start a formal proceeding against a
// staff member, optionally cross-referencing existing memos as evidence.
// ============================================================================

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  InitiateCaseForm,
  type StaffOption,
  type MemoOption,
} from '../_components/initiate-case-form';

async function loadOptions(): Promise<{
  staff: StaffOption[];
  memosByStaff: Record<string, MemoOption[]>;
}> {
  const supabase = await createServerSupabaseClient();

  const { data: staffRows } = await supabase
    .from('staff')
    .select('id, first_name, last_name, email')
    .order('first_name', { ascending: true })
    .limit(1000);

  const staff: StaffOption[] = (staffRows ?? []).map((s) => ({
    id: s.id as string,
    name:
      `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() ||
      (s.email as string) ||
      'Unknown',
  }));

  // Load active memos to surface as evidence options. Fail-soft if absent.
  const { data: memoRows } = await supabase
    .from('hr_memos')
    .select('id, staff_id, reason, issued_at, status')
    .in('status', ['issued', 'acknowledged', 'disputed'])
    .order('issued_at', { ascending: false })
    .limit(2000);

  const memosByStaff: Record<string, MemoOption[]> = {};
  for (const m of memoRows ?? []) {
    const sid = m.staff_id as string;
    if (!memosByStaff[sid]) memosByStaff[sid] = [];
    memosByStaff[sid].push({
      id: m.id as string,
      staff_id: sid,
      reason: (m.reason as string) ?? '',
      issued_at: m.issued_at as string,
      status: (m.status as string) ?? '',
    });
  }

  return { staff, memosByStaff };
}

export default async function NewDisciplinaryCasePage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="Initiate disciplinary case">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            Restricted to HR Admin / super administrators.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="Initiate disciplinary case">
        {/* @ts-expect-error Async Server Component */}
        <NewCaseBody />
      </ContentLayout>
    </SuperAdminOnly>
  );
}

async function NewCaseBody() {
  const { staff, memosByStaff } = await loadOptions();
  return (
    <div className="space-y-4">
      <Link
        href="/hr/admin/disciplinary"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Back to disciplinary cases
      </Link>

      <div className="rounded-md border border-amber-500/40 bg-amber-50 p-4 text-sm dark:bg-amber-950/30">
        <div className="font-medium text-amber-900 dark:text-amber-100">
          Formal proceeding — distinct from memos
        </div>
        <div className="mt-1 text-amber-900/80 dark:text-amber-100/80">
          A disciplinary case is the multi-stage process between a memo and a
          termination. Use this only when alleged misconduct is serious enough
          to warrant an enquiry and hearing. Lower-severity issues stay as
          memos in <Link href="/hr/admin/memos" className="underline">/hr/admin/memos</Link>.
        </div>
      </div>

      <div className="rounded-md border border-border p-4">
        <InitiateCaseForm staff={staff} memosByStaff={memosByStaff} />
      </div>
    </div>
  );
}
