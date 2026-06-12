// ============================================================================
// /hr/admin/memos — HR Memos list (super_admin / HR Admin)
// ============================================================================
// T6.1 spec — surfaces auto-issued + manual memos with lifecycle status.
//
// Director's view (no raw JSON, English consequences):
//   * Each row: staff name + memo type (plain English) + status badge +
//     issued date + "view detail" link.
//   * Status totals strip at top: how many issued / acknowledged / disputed /
//     resolved + count toward termination.
//   * "Approaching termination threshold" callout — staff with N-1 active memos.
// ============================================================================

export const navMeta = {
  label: 'HR Memos',
  icon: 'AlertTriangle',
} as const;

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { HRMemoService } from '@/lib/services/hr/memo-service';
import { Badge } from '@/components/ui/badge';

const MEMO_TYPE_LABEL: Record<string, string> = {
  leave_before_approval: 'Leave taken before approval',
  monthly_lop_threshold: 'Monthly LOP threshold breached',
  unscheduled_absence: 'Unscheduled absence',
  manual: 'Manual memo',
};

const STATUS_VARIANT: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  issued: 'destructive',
  acknowledged: 'secondary',
  disputed: 'outline',
  resolved: 'default',
};

async function loadData() {
  const supabase = await createServerSupabaseClient();
  const service = new HRMemoService(supabase);

  const [memos, triggers] = await Promise.all([
    service.listAll(200).catch(() => []),
    service.getTriggers().catch(() => null),
  ]);

  // Resolve staff names in one batch
  const staffIds = Array.from(new Set(memos.map((m) => m.staff_id)));
  const { data: staffRows } = staffIds.length
    ? await supabase
        .from('staff')
        .select('id, first_name, last_name, email')
        .in('id', staffIds)
    : { data: [] };
  const staffMap = new Map(
    (staffRows ?? []).map((s) => [
      s.id as string,
      `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() ||
        (s.email as string) ||
        'Unknown',
    ]),
  );

  // Status totals
  const totals = {
    issued: 0,
    acknowledged: 0,
    disputed: 0,
    resolved: 0,
    counts_active: 0,
  };
  for (const m of memos) {
    totals[m.status as keyof typeof totals] += 1;
    if (m.counts_toward_termination && m.status !== 'resolved') {
      totals.counts_active += 1;
    }
  }

  // Approaching-threshold staff
  const activeMemosByStaff = new Map<string, number>();
  for (const m of memos) {
    if (
      m.counts_toward_termination &&
      (m.status === 'issued' || m.status === 'acknowledged')
    ) {
      activeMemosByStaff.set(
        m.staff_id,
        (activeMemosByStaff.get(m.staff_id) ?? 0) + 1,
      );
    }
  }
  const threshold = triggers?.memos_for_termination_threshold ?? 3;
  const approachingThreshold: { staff_id: string; name: string; count: number }[] =
    [];
  for (const [sid, count] of activeMemosByStaff) {
    if (count >= threshold - 1) {
      approachingThreshold.push({
        staff_id: sid,
        name: staffMap.get(sid) ?? 'Unknown',
        count,
      });
    }
  }

  return { memos, staffMap, totals, threshold, approachingThreshold };
}

export default async function HRMemosListPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="HR Memos">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators / HR Admin.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="HR Memos — auto-issued + manual">
        {/* @ts-expect-error Async Server Component */}
        <MemoListBody />
      </ContentLayout>
    </SuperAdminOnly>
  );
}

async function MemoListBody() {
  const data = await loadData();
  const { memos, staffMap, totals, threshold, approachingThreshold } = data;

  return (
    <div className="space-y-6">
      {/* Status totals strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatTile label="Issued (awaiting action)" value={totals.issued} />
        <StatTile label="Acknowledged" value={totals.acknowledged} />
        <StatTile label="Disputed" value={totals.disputed} />
        <StatTile label="Resolved" value={totals.resolved} />
        <StatTile
          label={`Counting toward termination (threshold ${threshold})`}
          value={totals.counts_active}
          highlight
        />
      </div>

      {/* Approaching-threshold callout */}
      {approachingThreshold.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-50 p-4 text-sm dark:bg-amber-950/30">
          <div className="mb-2 font-medium text-amber-900 dark:text-amber-100">
            Approaching termination threshold ({threshold} active memos)
          </div>
          <ul className="space-y-1 text-amber-900 dark:text-amber-100">
            {approachingThreshold.map((row) => (
              <li key={row.staff_id}>
                {row.name} — {row.count} active memo{row.count === 1 ? '' : 's'}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Memo list */}
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Staff</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Issued</th>
              <th className="px-4 py-3">Counts?</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {memos.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No memos issued yet. The daily detector cron will write rows
                  here once eligibility events accrue.
                </td>
              </tr>
            )}
            {memos.map((m) => (
              <tr key={m.id} className="border-t border-border">
                <td className="px-4 py-3">
                  {staffMap.get(m.staff_id) ?? 'Unknown'}
                </td>
                <td className="px-4 py-3">
                  {MEMO_TYPE_LABEL[m.memo_type] ?? m.memo_type}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={STATUS_VARIANT[m.status] ?? 'outline'}>
                    {m.status}
                  </Badge>
                  {m.auto_issued ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      auto
                    </span>
                  ) : (
                    <span className="ml-2 text-xs text-muted-foreground">
                      manual
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(m.issued_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  {m.counts_toward_termination ? 'Yes' : 'No'}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/hr/admin/memos/${m.id}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-md border p-3 ${
        highlight
          ? 'border-amber-500/40 bg-amber-50 dark:bg-amber-950/20'
          : 'border-border'
      }`}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
