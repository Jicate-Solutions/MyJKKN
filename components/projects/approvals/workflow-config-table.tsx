'use client';

/**
 * WorkflowConfigTable — CRUD table for project_approval_workflows.
 *
 * Columns: name, trigger_action, steps (count), active toggle, actions.
 * Create / edit open WorkflowFormDialog; delete uses AlertDialog.
 *
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F9.
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
import { Badge } from '@/components/ui/badge';
import { Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { WorkflowFormDialog } from './workflow-form-dialog';
import { useWorkflows, useDeleteWorkflow } from '@/hooks/projects/use-approvals';
import type { ProjectApprovalWorkflow } from '@/types/projects';
import type { ApprovalStep } from './types';

function stepCount(chain: Record<string, unknown>): number {
  return Array.isArray(chain) ? chain.length : 0;
}

export function WorkflowConfigTable() {
  const { data: workflows, isLoading, isError, error } = useWorkflows();
  const deleteWorkflow = useDeleteWorkflow();

  const [formOpen, setFormOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<ProjectApprovalWorkflow | null>(null);
  const [deletingWorkflow, setDeletingWorkflow] = useState<ProjectApprovalWorkflow | null>(null);

  function openCreate() {
    setEditingWorkflow(null);
    setFormOpen(true);
  }

  function openEdit(w: ProjectApprovalWorkflow) {
    setEditingWorkflow(w);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deletingWorkflow) return;
    try {
      await deleteWorkflow.mutateAsync(deletingWorkflow.id);
      toast.success('Workflow deleted.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete workflow.');
    } finally {
      setDeletingWorkflow(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading workflows…
      </div>
    );
  }

  if (isError) {
    return (
      <p className="py-4 text-sm text-destructive">
        {error instanceof Error ? error.message : 'Failed to load workflows.'}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {workflows?.length ?? 0} workflow{(workflows?.length ?? 0) !== 1 ? 's' : ''}
        </p>
        <Button size="sm" className="gap-1.5" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          New workflow
        </Button>
      </div>

      {(!workflows || workflows.length === 0) ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No approval workflows yet. Create one to get started.
        </p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Trigger action</TableHead>
                <TableHead className="text-center">Steps</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {workflows.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="font-medium">{w.name}</TableCell>
                  <TableCell>
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      {w.trigger_action}
                    </code>
                  </TableCell>
                  <TableCell className="text-center tabular-nums">
                    {stepCount(w.approval_chain)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant={w.is_active ? 'default' : 'secondary'}
                      className="text-xs"
                    >
                      {w.is_active ? 'Active' : 'Inactive'}
                    </Badge>
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
                        <DropdownMenuItem onClick={() => openEdit(w)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeletingWorkflow(w)}
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

      <WorkflowFormDialog
        open={formOpen}
        onOpenChange={(v) => {
          setFormOpen(v);
          if (!v) setEditingWorkflow(null);
        }}
        workflow={editingWorkflow}
      />

      <AlertDialog
        open={!!deletingWorkflow}
        onOpenChange={(v) => {
          if (!v) setDeletingWorkflow(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete workflow?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deletingWorkflow?.name}</strong> will be permanently deleted.
              Existing approval requests that reference it will remain intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingWorkflow(null)}>
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
