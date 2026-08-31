'use client';

/**
 * Issue Register — table of all issues for one project.
 *
 * Columns: title, severity, status, raised-from-risk indicator, actions
 * (edit / resolve / delete). Issues are already-materialized problems, so the
 * table is flatter than the risk register (no mitigation/escalation rows).
 *
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F3.
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
import {
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  CheckCircle2,
  Bug,
  Link2,
} from 'lucide-react';
import { IssueFormDialog } from './issue-form-dialog';
import { RagBadge } from './rag-badge';
import {
  useIssues,
  useResolveIssue,
  useDeleteIssue,
} from '@/hooks/projects/use-risks';
import { ISSUE_STATUS_OPTIONS, ragFromSimple } from '@/types/projects-risks';
import type { ProjectIssue } from '@/types/projects';
import type { RiskSeveritySimple } from '@/types/projects-risks';

function statusLabel(key: string): string {
  return ISSUE_STATUS_OPTIONS.find((s) => s.key === key)?.label ?? key;
}

interface IssueRegisterProps {
  projectId: string;
}

export function IssueRegister({ projectId }: IssueRegisterProps) {
  const { data: issues, isLoading, isError, error } = useIssues(projectId);
  const resolveIssue = useResolveIssue();
  const deleteIssue = useDeleteIssue();

  const [formOpen, setFormOpen] = useState(false);
  const [editingIssue, setEditingIssue] = useState<ProjectIssue | null>(null);
  const [deletingIssue, setDeletingIssue] = useState<ProjectIssue | null>(null);

  function openCreate() {
    setEditingIssue(null);
    setFormOpen(true);
  }

  function openEdit(issue: ProjectIssue) {
    setEditingIssue(issue);
    setFormOpen(true);
  }

  async function handleResolve(issue: ProjectIssue) {
    try {
      await resolveIssue.mutateAsync({ id: issue.id });
      toast.success('Issue marked resolved.');
    } catch (err) {
      toast.error(`Failed: ${(err as Error)?.message ?? 'error'}`);
    }
  }

  async function confirmDelete() {
    if (!deletingIssue) return;
    try {
      await deleteIssue.mutateAsync(deletingIssue.id);
      toast.success('Issue deleted.');
      setDeletingIssue(null);
    } catch (err) {
      toast.error(`Failed to delete: ${(err as Error)?.message ?? 'error'}`);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {isLoading
            ? 'Loading issues…'
            : `${issues?.length ?? 0} issue${(issues?.length ?? 0) === 1 ? '' : 's'}`}
        </p>
        <Button size="sm" onClick={openCreate} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Add issue
        </Button>
      </div>

      {isError && (
        <p className="text-sm text-destructive">
          Failed to load issues: {(error as Error)?.message ?? 'unknown error'}
        </p>
      )}

      {!isLoading && !isError && (issues?.length ?? 0) === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed py-10 text-center">
          <Bug className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">No issues logged yet</p>
          <p className="text-sm text-muted-foreground">
            Log a problem that has already happened on this project.
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Issue</TableHead>
                <TableHead className="w-32">Severity</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead className="w-24">Source</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(issues ?? []).map((issue) => {
                const sev = (issue.severity as RiskSeveritySimple) ?? null;
                const isResolved =
                  issue.status_key === 'resolved' || issue.status_key === 'closed';
                return (
                  <TableRow key={issue.id} className="align-top">
                    <TableCell className="py-2">
                      <div className="font-medium">{issue.title}</div>
                      {issue.description && (
                        <div className="line-clamp-1 text-xs text-muted-foreground">
                          {issue.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="py-2">
                      {sev ? (
                        <div className="flex items-center gap-1.5">
                          <RagBadge rag={ragFromSimple(sev)} />
                          <span className="text-xs capitalize text-muted-foreground">
                            {sev}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2 text-sm">
                      {statusLabel(issue.status_key)}
                    </TableCell>
                    <TableCell className="py-2">
                      {issue.raised_from_risk_id ? (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Link2 className="h-3.5 w-3.5" />
                          From risk
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`h-7 w-7 p-0 ${TAP_TARGET_ICON}`}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(issue)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          {!isResolved && (
                            <DropdownMenuItem onClick={() => handleResolve(issue)}>
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              Mark resolved
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeletingIssue(issue)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <IssueFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        projectId={projectId}
        issue={editingIssue}
      />

      <AlertDialog
        open={!!deletingIssue}
        onOpenChange={(o) => {
          if (!o) setDeletingIssue(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this issue?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the issue from the register. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteIssue.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={deleteIssue.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
