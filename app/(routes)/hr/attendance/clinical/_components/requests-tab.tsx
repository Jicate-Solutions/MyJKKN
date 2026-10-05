'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Check, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  useClinicalEligibilities,
  useDecideClinicalEligibility,
  useRevokeClinicalEligibility,
} from '@/hooks/hr/use-clinical-duty';
import type {
  ClinicalEligibility,
  ClinicalEligibilityStatus,
} from '@/types/hr-clinical-duty';
import { ClinicalStats } from './clinical-stats';
import { NoteDialog } from './note-dialog';
import { STATUS_VARIANT, fmtDate, type InstitutionOption } from './shared';

type FilterStatus = ClinicalEligibilityStatus | 'all';

const SCOPE_LABEL = {
  staff: 'Individual',
  department: 'Department',
  institution: 'Whole institution',
} as const;

const subjectOf = (r: ClinicalEligibility) => {
  if (r.scope_type === 'institution') return { main: 'Whole institution', sub: null };
  if (r.scope_type === 'department') {
    return { main: r.department?.department_name ?? 'Unnamed department', sub: null };
  }
  const name = [r.employee?.first_name, r.employee?.last_name].filter(Boolean).join(' ').trim();
  return { main: name || '—', sub: r.employee?.staff_id ?? null };
};

type Pending = { kind: 'reject' | 'revoke'; row: ClinicalEligibility } | null;

export function RequestsTab({ institutions }: { institutions: InstitutionOption[] }) {
  const [status, setStatus] = useState<FilterStatus>('pending');
  const [institutionId, setInstitutionId] = useState('any');
  const [dialog, setDialog] = useState<Pending>(null);

  const { data, isLoading } = useClinicalEligibilities({
    status: status === 'all' ? undefined : status,
    institutionId: institutionId === 'any' ? undefined : institutionId,
  });
  const decide = useDecideClinicalEligibility();
  const revoke = useRevokeClinicalEligibility();

  const rows = data ?? [];

  return (
    <div className="space-y-4">
      <ClinicalStats institutionId={institutionId === 'any' ? undefined : institutionId} />

      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={(v) => setStatus(v as FilterStatus)}>
          <SelectTrigger className="h-8 w-full sm:w-[150px]" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="revoked">Revoked</SelectItem>
            <SelectItem value="all">All statuses</SelectItem>
          </SelectContent>
        </Select>
        {institutions.length > 0 && (
          <Select value={institutionId} onValueChange={setInstitutionId}>
            <SelectTrigger className="h-8 w-full sm:w-[220px]" aria-label="Filter by institution">
              <SelectValue placeholder="All institutions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">All institutions</SelectItem>
              {institutions.map((i) => (
                <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <span className="text-xs text-muted-foreground">
          {rows.length} request{rows.length === 1 ? '' : 's'}
        </span>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading requests…</div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No requests in this view"
          description="No clinical duty requests match the current filters."
        />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Institution</TableHead>
                <TableHead>Valid</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const subject = subjectOf(r);
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{subject.main}</div>
                      {subject.sub && (
                        <div className="text-xs text-muted-foreground">{subject.sub}</div>
                      )}
                    </TableCell>
                    <TableCell>{SCOPE_LABEL[r.scope_type]}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.institution?.name ?? '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {fmtDate(r.valid_from)} – {r.valid_until ? fmtDate(r.valid_until) : 'open'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[240px] text-sm">
                      {r.status === 'rejected' && r.decision_note
                        ? `Rejected: ${r.decision_note}`
                        : r.status === 'revoked' && r.revoke_reason
                          ? `Revoked: ${r.revoke_reason}`
                          : r.reason ?? '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(r.created_at), 'dd MMM yyyy, HH:mm')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {r.status === 'pending' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={decide.isPending}
                              onClick={() => decide.mutate({ id: r.id, approve: true })}
                            >
                              <Check className="mr-1 h-3.5 w-3.5" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setDialog({ kind: 'reject', row: r })}
                            >
                              <X className="mr-1 h-3.5 w-3.5" />
                              Reject
                            </Button>
                          </>
                        )}
                        {r.status === 'approved' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setDialog({ kind: 'revoke', row: r })}
                          >
                            Revoke
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <NoteDialog
        open={dialog?.kind === 'reject'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Reject request"
        description="The staff member will see this note."
        label="Note"
        confirmLabel="Reject"
        pending={decide.isPending}
        onConfirm={(note) =>
          dialog &&
          decide.mutate(
            { id: dialog.row.id, approve: false, note },
            { onSuccess: () => setDialog(null) }
          )
        }
      />
      <NoteDialog
        open={dialog?.kind === 'revoke'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Revoke eligibility"
        description="Geotagged punching stops for this scope immediately. Punches already recorded are kept."
        label="Reason"
        confirmLabel="Revoke"
        pending={revoke.isPending}
        onConfirm={(reason) =>
          dialog &&
          revoke.mutate(
            { id: dialog.row.id, reason },
            { onSuccess: () => setDialog(null) }
          )
        }
      />
    </div>
  );
}
