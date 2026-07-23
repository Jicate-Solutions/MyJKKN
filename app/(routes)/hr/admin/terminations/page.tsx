'use client';

// ============================================================================
// /hr/admin/terminations — T6.3 Termination Workflow list view
// ============================================================================
// Filters hr_offboarding_cases to separation_type='termination' and renders
// the SEDC -> Legal -> Director approval-chain progress for each row.
//
// Permission: super_admin / admin (SuperAdminOnly "users" / "manage").
// RLS narrows what each caller sees beyond that.
//
// Companion service: lib/services/hr/termination-service.ts
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Gavel,
  Loader2,
  Plus,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  TerminationService,
  APPROVAL_STEP_LABEL,
  type TerminationApprovalChainEntry,
  type TerminationApprovalStatus,
  type TerminationCase,
} from '@/lib/services/hr/termination-service';

export const navMeta = {
  label: 'Terminations',
  icon: 'Gavel',
} as const;

interface StaffLite {
  id: string;
  first_name: string;
  last_name: string;
  designation: string | null;
  institution_id: string;
}

interface TerminationRow extends TerminationCase {
  staff?: StaffLite | null;
}

// ---------------------------------------------------------------------------
// Page wrapper — gated by super_admin manage permission.
// ---------------------------------------------------------------------------
export default function HrTerminationsListPage() {
  return (
    <SuperAdminOnly>
      <ContentLayout title="HR — Terminations">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR' },
            { label: 'Terminations' },
          ]}
        />
        <TerminationListContent />
      </ContentLayout>
    </SuperAdminOnly>
  );
}

// ---------------------------------------------------------------------------
// List body
// ---------------------------------------------------------------------------
function TerminationListContent() {
  const supabase = useMemo(() => createClientSupabaseClient(), []);
  const [rows, setRows] = useState<TerminationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'completed' | 'withdrawn'>(
    'open',
  );
  const [legalFilter, setLegalFilter] = useState<
    'all' | TerminationApprovalStatus | 'not_required'
  >('all');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const cases = await TerminationService.listTerminations(supabase, {
          status: statusFilter === 'all' ? null : statusFilter,
          legalStatus: legalFilter === 'all' ? null : legalFilter,
        });

        // Hydrate staff names — RLS allows reading staff for the same scope
        // the caller already sees on cases.
        const staffIds = Array.from(new Set(cases.map((c) => c.staff_id)));
        let staffMap = new Map<string, StaffLite>();
        if (staffIds.length) {
          const { data: staffRows, error: staffErr } = await supabase
            .from('staff')
            .select('id, first_name, last_name, designation, institution_id')
            .in('id', staffIds);
          if (staffErr) throw staffErr;
          staffMap = new Map(
            (staffRows ?? []).map((s) => [s.id as string, s as StaffLite]),
          );
        }

        const hydrated: TerminationRow[] = cases.map((c) => ({
          ...c,
          staff: staffMap.get(c.staff_id) ?? null,
        }));

        if (!cancelled) {
          setRows(hydrated);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, statusFilter, legalFilter]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gavel className="h-5 w-5" />
            Termination Cases
          </CardTitle>
          <CardDescription>
            Director-approved staff terminations with the SEDC &rarr; Legal &rarr; Director
            approval chain. Separate from resignation: requires documented grounds
            and a 3-step sign-off before the case can complete.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Case status
              </label>
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="withdrawn">Withdrawn / Rejected</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Legal review
              </label>
              <Select
                value={legalFilter}
                onValueChange={(v) => setLegalFilter(v as typeof legalFilter)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="not_required">Not required</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="ml-auto">
              <Button asChild>
                <Link href="/hr/admin/terminations/new/initiate">
                  <Plus className="mr-2 h-4 w-4" />
                  Initiate Termination
                </Link>
              </Button>
            </div>
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Failed to load terminations</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : loading ? (
            <div className="space-y-2">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-3">
              {rows.map((row) => (
                <TerminationRowCard key={row.id} row={row} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-md border border-dashed bg-muted/30 p-8 text-center">
      <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" />
      <p className="mt-2 text-sm font-medium">No termination cases yet</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Termination cases are Director-initiated. Use the "Initiate Termination"
        button above to open one — you'll need documented grounds (&gt; 20 chars)
        or a linked disciplinary case.
      </p>
    </div>
  );
}

function TerminationRowCard({ row }: { row: TerminationRow }) {
  const staffName = row.staff
    ? `${row.staff.first_name} ${row.staff.last_name}`
    : 'Unknown staff';
  const designation = row.staff?.designation ?? '—';

  return (
    <div className="rounded-md border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{staffName}</span>
            <Badge variant="outline" className="text-xs">
              {designation}
            </Badge>
            <CaseStatusBadge status={row.status} />
            {row.notice_period_waived ? (
              <Badge variant="destructive" className="text-xs">
                Notice waived
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Initiated {formatDistanceToNow(new Date(row.initiated_at), { addSuffix: true })}
            {row.recommended_last_day ? (
              <> · Last day {format(new Date(row.recommended_last_day), 'PP')}</>
            ) : null}
          </p>
          {row.termination_grounds ? (
            <p
              className="mt-2 line-clamp-2 max-w-2xl text-xs text-muted-foreground"
              title={row.termination_grounds}
            >
              <span className="font-medium text-foreground">Grounds: </span>
              {row.termination_grounds}
            </p>
          ) : null}
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href={`/hr/admin/terminations/${row.id}/review`}>Review</Link>
        </Button>
      </div>

      <div className="mt-3 border-t pt-3">
        <ApprovalChainStrip chain={row.termination_approval_chain} />
      </div>
    </div>
  );
}

function CaseStatusBadge({ status }: { status: TerminationCase['status'] }) {
  if (status === 'completed') {
    return (
      <Badge variant="default" className="bg-emerald-600 text-xs">
        Completed
      </Badge>
    );
  }
  if (status === 'withdrawn') {
    return (
      <Badge variant="destructive" className="text-xs">
        Withdrawn / Rejected
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-xs">
      Open
    </Badge>
  );
}

function ApprovalChainStrip({
  chain,
}: {
  chain: TerminationApprovalChainEntry[];
}) {
  if (!chain.length) {
    return (
      <p className="text-xs italic text-muted-foreground">
        Approval chain not yet configured.
      </p>
    );
  }
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs">
      {chain.map((entry, i) => (
        <li key={entry.step} className="flex items-center gap-2">
          <ChainEntryIcon status={entry.status} />
          <span className="font-medium">{APPROVAL_STEP_LABEL[entry.step]}</span>
          <ChainEntryStatusBadge status={entry.status} />
          {i < chain.length - 1 ? (
            <span aria-hidden className="text-muted-foreground">
              →
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function ChainEntryIcon({ status }: { status: TerminationApprovalStatus }) {
  if (status === 'approved') {
    return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  }
  if (status === 'rejected') {
    return <XCircle className="h-4 w-4 text-destructive" />;
  }
  return <Circle className="h-4 w-4 text-muted-foreground" />;
}

function ChainEntryStatusBadge({
  status,
}: {
  status: TerminationApprovalStatus;
}) {
  if (status === 'approved') {
    return (
      <Badge variant="outline" className="border-emerald-600 text-emerald-700">
        Approved
      </Badge>
    );
  }
  if (status === 'rejected') {
    return <Badge variant="destructive">Rejected</Badge>;
  }
  return <Badge variant="secondary">Pending</Badge>;
}
