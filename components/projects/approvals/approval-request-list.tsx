'use client';

/**
 * ApprovalRequestList — table of all project_approval_requests for one project.
 *
 * Columns: trigger, status, step progress, emergency flag, escalation,
 * decided_at, actions (act / delete).
 * "Act" opens ApprovalActionDialog.
 *
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F9.
 */

import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { TAP_TARGET_ICON } from '@/app/(routes)/projects/_lib/tap-targets';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  MoreHorizontal,
  Play,
  Trash2,
} from 'lucide-react';
import { ApprovalActionDialog } from './approval-action-dialog';
import {
  useApprovalRequests,
  useCreateApprovalRequest,
  useDeleteApprovalRequest,
} from '@/hooks/projects/use-approvals';
import { statusBadgeClass, statusLabel } from './types';
import type { ProjectApprovalRequest } from '@/types/projects';
import type { ApprovalStep } from './types';

interface ApprovalRequestListProps {
  projectId: string;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'dd MMM yyyy');
  } catch {
    return iso;
  }
}

function StepProgress({ request }: { request: ProjectApprovalRequest }) {
  const chain: ApprovalStep[] = Array.isArray(request.snapshot_chain)
    ? (request.snapshot_chain as unknown as ApprovalStep[])
    : [];

  if (chain.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  return (
    <span className="text-xs tabular-nums">
      {request.current_step + 1} / {chain.length}
    </span>
  );
}

export function ApprovalRequestList({ projectId }: ApprovalRequestListProps) {
  const { data: requests, isLoading, isError, error } = useApprovalRequests(projectId);
  const deleteRequest = useDeleteApprovalRequest();
  const createRequest = useCreateApprovalRequest();

  const [actingRequest, setActingRequest] = useState<ProjectApprovalRequest | null>(null);
  const [deletingRequest, setDeletingRequest] = useState<ProjectApprovalRequest | null>(
    null
  );

  async function confirmDelete() {
    if (!deletingRequest) return;
    try {
      await deleteRequest.mutateAsync(deletingRequest.id);
      toast.success('Request deleted.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete request.');
    } finally {
      setDeletingRequest(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading requests…
      </div>
    );
  }

  if (isError) {
    return (
      <p className="py-4 text-sm text-destructive">
        {error instanceof Error ? error.message : 'Failed to load requests.'}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {requests?.length ?? 0} request{(requests?.length ?? 0) !== 1 ? 's' : ''}
      </p>

      {(!requests || requests.length === 0) ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No approval requests for this project yet.
        </p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trigger</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center">Step</TableHead>
                <TableHead className="text-center">Flags</TableHead>
                <TableHead>Decided</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((req) => (
                <TableRow key={req.id}>
                  <TableCell>
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      {req.trigger_action}
                    </code>
                  </TableCell>

                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(req.status)}`}
                    >
                      {statusLabel(req.status)}
                    </span>
                  </TableCell>

                  <TableCell className="text-center">
                    <StepProgress request={req} />
                  </TableCell>

                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      {req.is_emergency && (
                        <Badge
                          variant="destructive"
                          className="gap-0.5 px-1.5 py-0 text-[10px]"
                        >
                          <AlertTriangle className="h-2.5 w-2.5" />
                          Emergency
                        </Badge>
                      )}
                      {req.escalation_status && req.escalation_status !== 'none' && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 text-orange-600 border-orange-300"
                        >
                          {req.escalation_status}
                        </Badge>
                      )}
                      {!req.is_emergency &&
                        (!req.escalation_status || req.escalation_status === 'none') && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                    </div>
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(req.decided_at)}
                  </TableCell>

                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-8 w-8 ${TAP_TARGET_ICON}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setActingRequest(req)}>
                          {req.status === 'pending' ? (
                            <>
                              <Play className="mr-2 h-4 w-4" />
                              Act on request
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              View details
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeletingRequest(req)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ApprovalActionDialog
        open={!!actingRequest}
        onOpenChange={(v) => {
          if (!v) setActingRequest(null);
        }}
        request={actingRequest}
      />

      <AlertDialog
        open={!!deletingRequest}
        onOpenChange={(v) => {
          if (!v) setDeletingRequest(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete approval request?</AlertDialogTitle>
            <AlertDialogDescription>
              The request for trigger{' '}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                {deletingRequest?.trigger_action}
              </code>{' '}
              will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingRequest(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
