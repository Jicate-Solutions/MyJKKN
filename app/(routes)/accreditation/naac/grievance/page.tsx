// app/(routes)/accreditation/naac/grievance/page.tsx
// ============================================================================
// PR-A6a — Grievance List (NAAC 7.7.1 source)
//
// List view for all grievance tickets at the current institution, filtered by
// status / priority / emergency. New-ticket CTA. Row click opens detail.
//
// Scope: A6a = list + create + detail + evidence emission on resolve.
// Deferred to A6b: SLA countdown visuals, supersede/reopen workflow, PDFs.
// ============================================================================

'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { AlertTriangle, Plus, ShieldAlert } from 'lucide-react';
import { GrievanceService } from '@/lib/services/grievance/grievance-service';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import type { GrievanceStatus, GrievancePriority } from '@/lib/types/grievance';

const STATUSES: Array<{ value: GrievanceStatus; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'pending_info', label: 'Pending Info' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
  { value: 'reopened', label: 'Reopened' },
];

const PRIORITIES: Array<{ value: GrievancePriority; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

function statusVariant(status: string | null): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (status) {
    case 'open': return 'default';
    case 'in_progress': return 'secondary';
    case 'pending_info': return 'outline';
    case 'resolved':
    case 'closed': return 'outline';
    case 'reopened': return 'destructive';
    default: return 'outline';
  }
}

function slaVariant(sla: string | null): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (sla === 'breached') return 'destructive';
  if (sla === 'at_risk') return 'secondary';
  return 'default';
}

export default function GrievanceListPage() {
  const { isSuperAdmin } = usePermissions();
  const { profile } = useAuth();
  const institutionId = isSuperAdmin ? undefined : profile?.institution_id ?? undefined;

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [emergencyOnly, setEmergencyOnly] = useState<boolean>(false);
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading, error } = useQuery({
    queryKey: ['grievance', 'list', institutionId, statusFilter, priorityFilter, emergencyOnly, page],
    queryFn: () =>
      GrievanceService.listTickets({
        institutionId,
        status: statusFilter === 'all' ? undefined : (statusFilter as GrievanceStatus),
        priority: priorityFilter === 'all' ? undefined : (priorityFilter as GrievancePriority),
        isEmergency: emergencyOnly ? true : undefined,
        page,
        limit,
      }),
    enabled: isSuperAdmin || !!institutionId,
  });

  const totalPages = useMemo(() => Math.max(1, Math.ceil((data?.total ?? 0) / limit)), [data?.total]);

  return (
    <ContentLayout title="Grievance Tickets">
      <PageBreadcrumb
        items={[
          { label: 'Accreditation', href: '/accreditation' },
          { label: 'NAAC', href: '/accreditation/naac' },
          { label: 'Grievance' },
        ]}
      />

      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-orange-500" />
            Grievance Tickets
          </h1>
          <p className="text-sm text-muted-foreground">
            NAAC 7.7.1 · UGC grievance redressal · Each resolution emits accreditation evidence.
          </p>
        </div>
        <Button asChild>
          <Link href="/accreditation/naac/grievance/new">
            <Plus className="mr-2 h-4 w-4" /> New Ticket
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="w-44">
            <label className="mb-1 block text-xs text-muted-foreground">Status</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-44">
            <label className="mb-1 block text-xs text-muted-foreground">Priority</label>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pb-2">
            <input
              id="emergency-only"
              type="checkbox"
              checked={emergencyOnly}
              onChange={e => setEmergencyOnly(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="emergency-only" className="text-sm">Emergency only</label>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="p-0">
          {error && (
            <div className="p-4 text-sm text-destructive">
              <AlertTriangle className="mr-2 inline h-4 w-4" />
              Failed to load tickets. {(error as Error).message}
            </div>
          )}
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (<Skeleton key={i} className="h-10 w-full" />))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket #</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>SLA</TableHead>
                  <TableHead>Raised By</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.items ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No tickets found.
                    </TableCell>
                  </TableRow>
                ) : (
                  (data?.items ?? []).map(t => (
                    <TableRow key={t.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell>
                        <Link href={`/accreditation/naac/grievance/${t.id}`} className="font-mono text-xs hover:underline">
                          {t.ticket_number}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-md truncate">
                        <Link href={`/accreditation/naac/grievance/${t.id}`} className="hover:underline">
                          {t.subject}
                        </Link>
                        {t.is_emergency && (
                          <Badge variant="destructive" className="ml-2 text-[10px]">EMERGENCY</Badge>
                        )}
                        {t.is_anonymous && (
                          <Badge variant="outline" className="ml-2 text-[10px]">ANON</Badge>
                        )}
                      </TableCell>
                      <TableCell><Badge variant={statusVariant(t.status)}>{t.status}</Badge></TableCell>
                      <TableCell><Badge variant="outline">{t.priority ?? '-'}</Badge></TableCell>
                      <TableCell><Badge variant={slaVariant(t.sla_status)}>{t.sla_status ?? '-'}</Badge></TableCell>
                      <TableCell className="text-sm">{t.raised_by_name ?? t.raised_by_type}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {t.created_at ? new Date(t.created_at).toLocaleDateString() : '-'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {!isLoading && (data?.total ?? 0) > limit && (
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {page} of {totalPages} · {data?.total ?? 0} tickets total
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>Previous</Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next</Button>
          </div>
        </div>
      )}
    </ContentLayout>
  );
}
