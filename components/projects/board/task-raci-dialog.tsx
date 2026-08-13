'use client';

/**
 * RACI assignment dialog for a single task.
 *
 * Writes project_task_assignees rows with RACI roles (responsible / accountable /
 * consulted / informed). This is the human-facing substrate the auto-accountability
 * meeting engine reads: it resolves the single Accountable as the meeting owner.
 *
 * The data-fetching body only mounts when the dialog is open (Radix unmounts
 * DialogContent when closed), so a board full of cards does not fire N staff/
 * assignee queries at once.
 *
 * Spec: RACI substrate (PR1) for the project-accountability trigger engine.
 */

import { useMemo, useState } from 'react';
import { Loader2, UserPlus, X } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { RaciBadges } from '@/components/projects/board/raci-badges';
import { useProject } from '@/hooks/projects/use-projects';
import { useStaffForSelection } from '@/hooks/staff/use-staff';
import {
  useTaskAssignees,
  useAssignTask,
  useUnassignTask,
} from '@/hooks/projects/use-tasks';
import {
  RACI_ROLES,
  RACI_LABELS,
  RACI_LETTERS,
  RACI_DESCRIPTIONS,
  type RaciRole,
  type ProjectTask,
  type ProjectTaskAssigneeWithStaff,
} from '@/types/projects';
import { cn } from '@/lib/utils';

interface TaskRaciDialogProps {
  task: ProjectTask;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ROLE_DOT: Record<RaciRole, string> = {
  responsible: 'bg-blue-500',
  accountable: 'bg-amber-500',
  consulted: 'bg-violet-500',
  informed: 'bg-slate-400',
};

function staffName(a: ProjectTaskAssigneeWithStaff): string {
  const s = a.staff;
  if (s && (s.first_name || s.last_name)) {
    return [s.first_name, s.last_name].filter(Boolean).join(' ');
  }
  return a.staff_id.slice(0, 8);
}

export function TaskRaciDialog({ task, open, onOpenChange }: TaskRaciDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">RACI — {task.title}</DialogTitle>
          <DialogDescription>
            Assign who is Responsible, Accountable, Consulted, and Informed. The
            Accountable person is who an auto-meeting summons if this task breaches.
          </DialogDescription>
        </DialogHeader>
        {open && <RaciDialogBody task={task} />}
      </DialogContent>
    </Dialog>
  );
}

function RaciDialogBody({ task }: { task: ProjectTask }) {
  const { data: project, isLoading: projectLoading } = useProject(task.project_id);
  const institutionId = project?.institution_id ?? '';

  /**
   * A project with no institution is CLUSTER-WIDE, not broken.
   *
   * `institutionId` used to be the only signal here, and an empty string meant
   * two completely different things: "the project has not arrived yet"
   * (transient) and "the project arrived and belongs to no single institution"
   * (permanent). Both disabled the picker and captioned it "Loading project…",
   * so on a cluster-wide project the control span forever on a promise that had
   * already resolved. Every task in the module sat behind that.
   *
   * `projectLoading` now carries the transient case on its own, and the empty
   * institution is treated as what it is: pick from everyone the viewer may see.
   * RLS still scopes the list, so this cannot widen anyone's access.
   */
  const { data: staff = [], isLoading: staffLoading } = useStaffForSelection(
    { institution_id: institutionId, isActive: true },
    { allowAllInstitutions: true }
  );
  const { data: assignees = [], isLoading: assigneesLoading } = useTaskAssignees(task.id);
  const assign = useAssignTask();
  const unassign = useUnassignTask();

  const [staffId, setStaffId] = useState('');
  const [role, setRole] = useState<RaciRole>('responsible');

  const staffOptions = useMemo(
    () =>
      staff.map((s) => ({
        value: s.id,
        label: [s.first_name, s.last_name].filter(Boolean).join(' ') || s.email || s.id,
      })),
    [staff]
  );

  const byRole = useMemo(() => {
    const map: Record<RaciRole, ProjectTaskAssigneeWithStaff[]> = {
      responsible: [],
      accountable: [],
      consulted: [],
      informed: [],
    };
    for (const a of assignees as ProjectTaskAssigneeWithStaff[]) {
      if (a.role in map) map[a.role as RaciRole].push(a);
    }
    return map;
  }, [assignees]);

  const filledRoles = useMemo(
    () => RACI_ROLES.filter((r) => byRole[r].length > 0),
    [byRole]
  );

  async function handleAdd() {
    if (!staffId) return;
    await assign.mutateAsync({ taskId: task.id, staffId, role });
    setStaffId('');
  }

  return (
    <div className="space-y-4">
      {/* Coverage at a glance */}
      {!assigneesLoading && (
        <RaciBadges filledRoles={filledRoles} showEmpty className="px-0.5" />
      )}

      {/* Current assignments, grouped by RACI role */}
      <div className="space-y-3">
        {assigneesLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading assignments…
          </div>
        ) : (
          RACI_ROLES.map((r) => (
            <div key={r} className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <span className={cn('h-2 w-2 rounded-full', ROLE_DOT[r])} />
                <span className="inline-flex h-4 w-4 items-center justify-center rounded border text-[10px] font-semibold">
                  {RACI_LETTERS[r]}
                </span>
                {RACI_LABELS[r]}
                <span className="font-normal text-muted-foreground/70">
                  · {RACI_DESCRIPTIONS[r]}
                </span>
              </div>
              {byRole[r].length === 0 ? (
                <p className="pl-6 text-xs italic text-muted-foreground/60">— none —</p>
              ) : (
                <ul className="space-y-1 pl-6">
                  {byRole[r].map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between rounded bg-muted/40 px-2 py-1 text-sm"
                    >
                      <span>{staffName(a)}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${staffName(a)}`}
                        className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                        disabled={unassign.isPending}
                        onClick={() =>
                          unassign.mutate({ taskId: task.id, staffId: a.staff_id })
                        }
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))
        )}
      </div>

      {/* Add a new assignment */}
      <div className="space-y-2 border-t pt-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchableSelect
            value={staffId}
            onValueChange={setStaffId}
            options={staffOptions}
            placeholder={
              projectLoading
                ? 'Loading project…'
                : staffLoading
                  ? 'Loading team members…'
                  : 'Select team member…'
            }
            searchPlaceholder="Search team members…"
            emptyMessage={
              institutionId
                ? 'No team members found in this institution.'
                : 'No team members found that you can assign.'
            }
            loading={staffLoading}
            disabled={projectLoading}
            modal
            className="flex-1"
          />
          <Select value={role} onValueChange={(v) => setRole(v as RaciRole)}>
            <SelectTrigger className="sm:w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RACI_ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {RACI_LETTERS[r]} · {RACI_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            onClick={handleAdd}
            disabled={!staffId || assign.isPending}
          >
            {assign.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            <span className="ml-1">Add</span>
          </Button>
        </div>
        {role === 'accountable' && (
          <p className="text-xs text-muted-foreground">
            Only one person can be Accountable — adding a new one replaces the current Accountable.
          </p>
        )}
        {assign.isError && (
          <p className="text-xs text-destructive">Could not assign. Please try again.</p>
        )}
      </div>
    </div>
  );
}
