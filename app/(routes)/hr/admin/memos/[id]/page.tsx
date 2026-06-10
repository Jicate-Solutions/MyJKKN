// ============================================================================
// /hr/admin/memos/[id] — HR Memo detail + dispute resolution
// ============================================================================
// T6.1 spec — HR Admin lands here to read the full memo, see the audit trail,
// and resolve a dispute (with the option to invalidate it from termination
// count).
// ============================================================================

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { HRMemoService } from '@/lib/services/hr/memo-service';
import { Badge } from '@/components/ui/badge';
import { MemoResolveForm } from '../_components/memo-resolve-form';

const TYPE_LABEL: Record<string, string> = {
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

export default async function MemoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="HR Memo">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            Restricted to HR Admin / super administrators.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="HR Memo detail">
        {/* @ts-expect-error Async Server Component */}
        <Body id={id} />
      </ContentLayout>
    </SuperAdminOnly>
  );
}

async function Body({ id }: { id: string }) {
  const supabase = await createServerSupabaseClient();
  const service = new HRMemoService(supabase);
  const memo = await service.getById(id);
  if (!memo) notFound();

  // staff + transitions
  const { data: staffRow } = await supabase
    .from('staff')
    .select('id, first_name, last_name, email')
    .eq('id', memo.staff_id)
    .maybeSingle();

  const { data: transitions } = await supabase
    .from('hr_memo_state_transitions')
    .select('*')
    .eq('memo_id', id)
    .order('transition_at', { ascending: true });

  const staffName =
    `${staffRow?.first_name ?? ''} ${staffRow?.last_name ?? ''}`.trim() ||
    (staffRow?.email as string) ||
    'Unknown';

  return (
    <div className="space-y-6">
      <Link
        href="/hr/admin/memos"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Back to memos
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border p-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {TYPE_LABEL[memo.memo_type] ?? memo.memo_type}
          </div>
          <div className="mt-1 text-xl font-semibold">{staffName}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Issued {new Date(memo.issued_at).toLocaleString()} —{' '}
            {memo.auto_issued ? 'auto' : 'manual'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={STATUS_VARIANT[memo.status] ?? 'outline'}>
            {memo.status}
          </Badge>
          <Badge
            variant={memo.counts_toward_termination ? 'destructive' : 'outline'}
          >
            {memo.counts_toward_termination
              ? 'Counts toward termination'
              : 'Excluded from count'}
          </Badge>
        </div>
      </div>

      {/* Reason */}
      <div className="rounded-md border border-border p-4">
        <div className="mb-2 text-sm font-medium">Reason</div>
        <p className="whitespace-pre-line text-sm text-foreground/90">
          {memo.reason}
        </p>
      </div>

      {/* Dispute text if present */}
      {memo.dispute_text && (
        <div className="rounded-md border border-amber-500/40 bg-amber-50 p-4 dark:bg-amber-950/30">
          <div className="mb-1 text-sm font-medium text-amber-900 dark:text-amber-100">
            Staff dispute
          </div>
          <p className="whitespace-pre-line text-sm text-amber-900 dark:text-amber-100">
            {memo.dispute_text}
          </p>
          {memo.disputed_at && (
            <div className="mt-2 text-xs text-amber-800 dark:text-amber-200">
              Filed {new Date(memo.disputed_at).toLocaleString()}
            </div>
          )}
        </div>
      )}

      {/* Resolution form — only if not yet resolved */}
      {memo.status !== 'resolved' && (
        <div className="rounded-md border border-border p-4">
          <div className="mb-2 text-sm font-medium">Resolve memo</div>
          <p className="mb-3 text-xs text-muted-foreground">
            Uphold the memo (keeps it counting toward termination) or invalidate
            it (excludes from count, e.g. when the dispute is upheld).
          </p>
          <MemoResolveForm memoId={memo.id} />
        </div>
      )}

      {/* Resolution note */}
      {memo.resolution_note && (
        <div className="rounded-md border border-border p-4">
          <div className="mb-1 text-sm font-medium">Resolution note</div>
          <p className="whitespace-pre-line text-sm text-foreground/90">
            {memo.resolution_note}
          </p>
          {memo.resolved_at && (
            <div className="mt-2 text-xs text-muted-foreground">
              Resolved {new Date(memo.resolved_at).toLocaleString()}
            </div>
          )}
        </div>
      )}

      {/* Audit trail */}
      <div className="rounded-md border border-border p-4">
        <div className="mb-2 text-sm font-medium">Audit trail</div>
        <ul className="space-y-2 text-sm">
          {(transitions ?? []).map((t) => (
            <li key={t.id} className="border-l-2 border-border pl-3">
              <div className="font-medium">
                {t.from_status ? `${t.from_status} → ` : ''}
                {t.to_status}{' '}
                <span className="text-xs text-muted-foreground">
                  ({t.actor_role})
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(t.transition_at).toLocaleString()}
              </div>
              {t.note && (
                <div className="mt-1 text-xs text-foreground/80">{t.note}</div>
              )}
            </li>
          ))}
          {(transitions ?? []).length === 0 && (
            <li className="text-xs text-muted-foreground">
              No transitions recorded.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
