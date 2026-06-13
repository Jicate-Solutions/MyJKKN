'use client';

/**
 * Change Request List — table of all change requests for one project.
 *
 * Columns: major/minor badge, type, title, impact summary, status, actions.
 * Actions: Approve / Reject (pending only), Delete.
 * Major requests are visually distinguished with a bold badge.
 *
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F14.
 */

import { useState } from 'react';
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
import { Badge } from '@/components/ui/badge';
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
import {
  CheckCircle2,
  CircleSlash,
  GitPullRequestArrow,
  Loader2,
  MoreHorizontal,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  useChangeRequests,
  useDeleteChangeRequest,
} from '@/hooks/projects/use-changes';
import { ChangeRequestFormDialog } from './change-request-form-dialog';
import { ChangeDecisionDialog } from './change-decision-dialog';
import type { ProjectChangeRequest } from '@/types/projects';

interface ChangeRequestListProps {
  projectId: string;
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'approved':
      return (
        <Badge variant="outline" className="border-green-500 text-green-700 bg-green-50">
          Approved
        </Badge>
      );
    case 'rejected':
      return (
        <Badge variant="outline" className="border-red-500 text-red-700 bg-red-50">
          Rejected
        </Badge>
      );
    case 'withdrawn':
      return (
        <Badge variant="outline" className="text-muted-foreground">
          Withdrawn
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="capitalize">
          {status}
        </Badge>
      );
  }
}

function MajorBadge({ isMajor }: { isMajor: boolean }) {
  if (isMajor) {
    return (
      <Badge className="bg-orange-500 text-white font-semibold">Major</Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Minor
    </Badge>
  );
}

export function ChangeRequestList({ projectId }: ChangeRequestListProps) {
  const { data: changeRequests, isLoading, isError, error } = useChangeRequests(projectId);
  const deleteChangeRequest = useDeleteChangeRequest();

  const [formOpen, setFormOpen] = useState(false);
  const [decidingRequest, setDecidingRequest] =
    useState<ProjectChangeRequest | null>(null);
  const [deletingRequest, setDeletingRequest] =
    useState<ProjectChangeRequest | null>(null);

  function handleDelete() {
    if (!deletingRequest) return;
    deleteChangeRequest.mutate(deletingRequest.id, {
      onSuccess: () => {
        toast.success('Change request deleted');
        setDeletingRequest(null);
      },
      onError: (err) => {
        toast.error(`Failed to delete: ${err.message}`);
        setDeletingRequest(null);
      },
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading change requests…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="py-12 text-center text-sm text-destructive">
        Failed to load change requests: {(error as Error)?.message}
      </div>
    );
  }

  const isEmpty = !changeRequests || changeRequests.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {changeRequests?.length ?? 0} change request
          {(changeRequests?.length ?? 0) !== 1 ? 's' : ''}
        </p>
        <Button size="sm" onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          New Request
        </Button>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 gap-3 text-center">
          <GitPullRequestArrow className="h-10 w-10 text-muted-foreground/40" />
          <div>
            <p className="text-sm font-medium">No change requests</p>
            <p className="text-xs text-muted-foreground mt-1">
              Create the first change request for this project.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New Request
          </Button>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Scale</TableHead>
                <TableHead className="w-32">Type</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="hidden md:table-cell">Impact Summary</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {changeRequests.map((cr) => (
                <TableRow
                  key={cr.id}
                  className={cr.is_major ? 'bg-orange-50/30' : undefined}
                >
                  <TableCell>
                    <MajorBadge isMajor={cr.is_major} />
                  </TableCell>
                  <TableCell>
                    <span className="capitalize text-sm">{cr.change_type}</span>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className={`text-sm ${cr.is_major ? 'font-semibold' : 'font-medium'}`}>
                        {cr.title}
                      </p>
                      {cr.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {cr.description}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {cr.impact_summary ?? '—'}
                    </p>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={cr.status} />
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {cr.status === 'pending' && (
                          <>
                            <DropdownMenuItem
                              onSelect={() => setDecidingRequest(cr)}
                              className="gap-2"
                            >
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              Approve / Reject
                            </DropdownMenuItem>
                          </>
                        )}
                        <DropdownMenuItem
                          onSelect={() => setDeletingRequest(cr)}
                          className="gap-2 text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
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

      {/* Create form dialog */}
      <ChangeRequestFormDialog
        projectId={projectId}
        open={formOpen}
        onOpenChange={setFormOpen}
      />

      {/* Decision dialog */}
      {decidingRequest && (
        <ChangeDecisionDialog
          changeRequest={decidingRequest}
          open={!!decidingRequest}
          onOpenChange={(open) => {
            if (!open) setDecidingRequest(null);
          }}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deletingRequest}
        onOpenChange={(open) => {
          if (!open) setDeletingRequest(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete change request?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{deletingRequest?.title}&rdquo; will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleteChangeRequest.isPending}
            >
              {deleteChangeRequest.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
