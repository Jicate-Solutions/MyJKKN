'use client';

/**
 * Stakeholder List — table of all stakeholders for one project.
 *
 * Columns: person (name or staff ID), role, in-app toggle, email toggle,
 * actions (edit / delete).
 *
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F8.
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
import { MoreHorizontal, Pencil, Plus, Trash2, Bell, BellOff, Mail, MailX, Users } from 'lucide-react';
import { StakeholderFormDialog } from './stakeholder-form-dialog';
import {
  useStakeholders,
  useDeleteStakeholder,
} from '@/hooks/projects/use-stakeholders';
import { STAKEHOLDER_ROLE_OPTIONS } from '@/components/projects/stakeholders/types';
import type { ProjectStakeholder } from '@/types/projects';

function roleLabel(role: string | null): string {
  if (!role) return '—';
  return STAKEHOLDER_ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role;
}

function personDisplay(s: ProjectStakeholder): string {
  if (s.external_name) return s.external_name;
  if (s.staff_id) return `Staff ${s.staff_id.slice(0, 8)}…`;
  return 'Unknown';
}

function personSubline(s: ProjectStakeholder): string | null {
  if (s.external_email) return s.external_email;
  if (s.staff_id) return 'Internal staff';
  return null;
}

interface StakeholderListProps {
  projectId: string;
}

export function StakeholderList({ projectId }: StakeholderListProps) {
  const {
    data: stakeholders,
    isLoading,
    isError,
    error,
  } = useStakeholders(projectId);
  const deleteStakeholder = useDeleteStakeholder();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectStakeholder | null>(null);
  const [deleting, setDeleting] = useState<ProjectStakeholder | null>(null);

  function handleEdit(s: ProjectStakeholder) {
    setEditing(s);
    setFormOpen(true);
  }

  function handleDialogChange(open: boolean) {
    setFormOpen(open);
    if (!open) setEditing(null);
  }

  function confirmDelete() {
    if (!deleting) return;
    deleteStakeholder.mutate(deleting.id, {
      onSuccess: () => {
        toast.success('Stakeholder removed.');
        setDeleting(null);
      },
      onError: (err) => {
        toast.error(`Failed to remove: ${(err as Error).message}`);
        setDeleting(null);
      },
    });
  }

  if (isError) {
    return (
      <p className="text-sm text-destructive">
        Failed to load stakeholders:{' '}
        {error instanceof Error ? error.message : 'Unknown error'}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          {isLoading
            ? 'Loading…'
            : `${stakeholders?.length ?? 0} stakeholder${
                (stakeholders?.length ?? 0) !== 1 ? 's' : ''
              }`}
        </h3>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add stakeholder
        </Button>
      </div>

      {!isLoading && (!stakeholders || stakeholders.length === 0) ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
          <Users className="mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium">No stakeholders yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add people who need to be kept informed about this project.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-4"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add first stakeholder
          </Button>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-center w-[90px]">In-app</TableHead>
                <TableHead className="text-center w-[90px]">Email</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(stakeholders ?? []).map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <div className="font-medium text-sm">
                      {personDisplay(s)}
                    </div>
                    {personSubline(s) && (
                      <div className="text-xs text-muted-foreground">
                        {personSubline(s)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {s.role ? (
                      <Badge variant="secondary" className="text-xs">
                        {roleLabel(s.role)}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {s.notify_in_app ? (
                      <Bell className="mx-auto h-4 w-4 text-primary" />
                    ) : (
                      <BellOff className="mx-auto h-4 w-4 text-muted-foreground/40" />
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {s.notify_email ? (
                      <Mail className="mx-auto h-4 w-4 text-primary" />
                    ) : (
                      <MailX className="mx-auto h-4 w-4 text-muted-foreground/40" />
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-8 w-8 ${TAP_TARGET_ICON}`}
                          aria-label="Stakeholder actions"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(s)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeleting(s)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Remove
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

      {/* Add / edit dialog */}
      <StakeholderFormDialog
        open={formOpen}
        onOpenChange={handleDialogChange}
        projectId={projectId}
        stakeholder={editing}
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove stakeholder?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting
                ? `Remove "${personDisplay(deleting)}" from this project? This cannot be undone.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteStakeholder.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
              disabled={deleteStakeholder.isPending}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
