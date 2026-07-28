'use client';

/**
 * Who does this leave type apply to, and with how many days.
 *
 * A type with NO assignments is organization-wide — the state every existing
 * type is in. Adding the first assignment NARROWS the type, which is the least
 * obvious thing about this screen, so it is stated in the panel rather than
 * left to be inferred from a shrinking count.
 *
 * The coverage figure comes from the same rules the generator uses, so what is
 * shown here is what will actually be written.
 */

import { useMemo, useState } from 'react';
import { AlertCircle, Building2, Info, Plus, Trash2, User, Users } from 'lucide-react';

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

import { StaffPicker } from './staff-picker';
import {
  useLeaveTypeAssignments, useLeaveTypeCoverage, useCreateAssignments,
  useRemoveAssignment, useDepartmentsWithStaff,
} from '@/hooks/hr/use-leave-assignments';
import { getErrorMessage, cn } from '@/lib/utils';
import {
  LEAVE_ASSIGNMENT_SCOPE_LABELS, LEAVE_ASSIGNMENT_SCOPE_HINTS,
  type LeaveAssignmentScope, type StaffPickerOption,
} from '@/types/hr-leave-assignments';
import type { HRLeaveType } from '@/types/hr-leave-types';

const SCOPE_ICON: Record<LeaveAssignmentScope, typeof Building2> = {
  organization: Building2,
  department: Users,
  staff: User,
};

export function AssignmentManagerDialog({
  open,
  onOpenChange,
  leaveType,
  institutionId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leaveType: HRLeaveType | null;
  institutionId: string | undefined;
}) {
  const typeId = leaveType?.id;
  const { data: assignments, isLoading } = useLeaveTypeAssignments(typeId);
  const { data: coverage } = useLeaveTypeCoverage(typeId);
  const { data: departments } = useDepartmentsWithStaff(institutionId);
  const createMut = useCreateAssignments();
  const removeMut = useRemoveAssignment();

  const [scope, setScope] = useState<LeaveAssignmentScope>('department');
  const [deptIds, setDeptIds] = useState<string[]>([]);
  const [people, setPeople] = useState<StaffPickerOption[]>([]);
  const [override, setOverride] = useState('');
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => assignments ?? [], [assignments]);

  // Already-assigned targets are shown as unavailable rather than hidden, so
  // it is obvious they exist rather than looking like a broken search.
  const assignedDeptIds = useMemo(
    () => new Set(rows.filter((r) => r.scope_kind === 'department').map((r) => r.department_id!)),
    [rows]
  );
  const assignedStaffIds = useMemo(
    () => new Set(rows.filter((r) => r.scope_kind === 'staff').map((r) => r.staff_id!)),
    [rows]
  );
  const hasOrgRow = rows.some((r) => r.scope_kind === 'organization');

  const reset = () => { setDeptIds([]); setPeople([]); setOverride(''); setError(null); };

  const targetCount =
    scope === 'department' ? deptIds.length : scope === 'staff' ? people.length : 1;

  const onAdd = async () => {
    if (!leaveType) return;
    setError(null);
    // '' means "no override" — but 0 is a real value, so only an empty string
    // maps to null.
    const entitled = override.trim() === '' ? null : Number(override);
    if (entitled !== null && (!Number.isFinite(entitled) || entitled < 0)) {
      setError('Entitlement override must be zero or a positive number.');
      return;
    }
    const base = {
      leave_type_id: leaveType.id,
      hr_organization_id: leaveType.hr_organization_id,
      entitled_days: entitled,
    };
    const rowsToAdd =
      scope === 'department'
        ? deptIds.map((id) => ({ ...base, scope_kind: 'department' as const, department_id: id }))
        : scope === 'staff'
        ? people.map((s) => ({ ...base, scope_kind: 'staff' as const, staff_id: s.id }))
        : [{ ...base, scope_kind: 'organization' as const }];

    try {
      await createMut.mutateAsync(rowsToAdd);
      reset();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const onRemove = async (id: string) => {
    setError(null);
    try {
      await removeMut.mutateAsync(id);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Who gets {leaveType?.leave_type_name}?</DialogTitle>
          <DialogDescription>
            Leave the list empty to give this type to everyone in the organization. Adding a
            rule narrows it to only the people that rule reaches.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
          {/* ── Impact ─────────────────────────────────────────── */}
          {coverage && (
            <div
              className={cn(
                'rounded-md border px-4 py-3',
                coverage.reached === 0 && 'border-destructive/40 bg-destructive/5'
              )}
            >
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold tabular-nums">{coverage.reached}</span>
                <span className="text-sm text-muted-foreground">
                  of {coverage.active_staff} active team members reached
                  {coverage.is_org_wide && ' — organization-wide'}
                </span>
              </div>
              {coverage.reached === 0 && (
                <p className="mt-1 text-xs text-destructive">
                  These rules reach nobody. The generator would create no balances for this type.
                </p>
              )}
              {coverage.has_department_scope && coverage.without_department > 0 && (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                  {coverage.without_department} active team member
                  {coverage.without_department === 1 ? ' has' : 's have'} no department on record
                  and cannot be reached by a department rule.
                </p>
              )}
            </div>
          )}

          {/* ── Existing rules ─────────────────────────────────── */}
          <div>
            <Label className="text-xs text-muted-foreground">Current rules</Label>
            {isLoading ? (
              <Skeleton className="mt-1 h-16" />
            ) : rows.length === 0 ? (
              <Alert className="mt-1">
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  No rules — this type applies to <strong>everyone</strong> in the organization
                  and uses its default of {leaveType?.default_entitled_days} day(s).
                </AlertDescription>
              </Alert>
            ) : (
              <div className="mt-1 space-y-1.5">
                {rows.map((r) => {
                  const Icon = SCOPE_ICON[r.scope_kind];
                  return (
                    <div key={r.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {r.scope_kind === 'organization'
                          ? 'Whole organization'
                          : r.scope_kind === 'department'
                          ? (r.department_name ?? 'Unknown department')
                          : `${r.staff_code ?? ''} ${r.staff_name ?? 'Unknown'}`.trim()}
                      </span>
                      <Badge variant="outline" className="font-normal">
                        {r.entitled_days === null
                          ? `default ${leaveType?.default_entitled_days}d`
                          : `${r.entitled_days}d`}
                      </Badge>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        aria-label="Remove rule"
                        disabled={removeMut.isPending}
                        onClick={() => onRemove(r.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
                <p className="pt-0.5 text-xs text-muted-foreground">
                  Most specific rule wins: a person&apos;s own rule beats their department&apos;s,
                  which beats the organization&apos;s.
                </p>
              </div>
            )}
          </div>

          {/* ── Add a rule ─────────────────────────────────────── */}
          <div className="space-y-3 rounded-md border p-3">
            <div className="text-sm font-medium">Add a rule</div>

            <div>
              <Label>Applies to</Label>
              <Select value={scope} onValueChange={(v) => { setScope(v as LeaveAssignmentScope); reset(); }}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(LEAVE_ASSIGNMENT_SCOPE_LABELS) as LeaveAssignmentScope[]).map((k) => (
                    <SelectItem key={k} value={k} disabled={k === 'organization' && hasOrgRow}>
                      {LEAVE_ASSIGNMENT_SCOPE_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                {LEAVE_ASSIGNMENT_SCOPE_HINTS[scope]}
              </p>
            </div>

            {scope === 'department' && (
              <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border p-2">
                {(departments ?? []).length === 0 ? (
                  <p className="p-2 text-sm text-muted-foreground">
                    No department in this institution has active team members.
                  </p>
                ) : (
                  (departments ?? []).map((d) => {
                    const already = assignedDeptIds.has(d.id);
                    return (
                      <label
                        key={d.id}
                        className={cn(
                          'flex items-center gap-2 rounded px-2 py-1.5 text-sm',
                          already ? 'opacity-50' : 'cursor-pointer hover:bg-muted/60'
                        )}
                      >
                        <Checkbox
                          disabled={already}
                          checked={deptIds.includes(d.id)}
                          onCheckedChange={(c) =>
                            setDeptIds((prev) =>
                              c === true ? [...prev, d.id] : prev.filter((x) => x !== d.id)
                            )
                          }
                        />
                        <span className="flex-1 truncate">{d.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {already ? 'assigned' : `${d.staff_count}`}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            )}

            {scope === 'staff' && (
              <StaffPicker
                institutionId={institutionId}
                selected={people}
                onChange={setPeople}
                excludeIds={assignedStaffIds}
              />
            )}

            <div>
              <Label htmlFor="ovr">Entitlement for this rule</Label>
              <Input
                id="ovr"
                type="number"
                min={0}
                step="0.5"
                className="mt-1"
                placeholder={`Leave blank to use the default (${leaveType?.default_entitled_days ?? 0})`}
                value={override}
                onChange={(e) => setOverride(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Blank keeps the type default. Enter 0 to make the type visible but grant no days.
              </p>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button
              onClick={onAdd}
              disabled={targetCount === 0 || createMut.isPending}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              {createMut.isPending
                ? 'Adding…'
                : `Add rule${targetCount > 1 ? ` (${targetCount})` : ''}`}
            </Button>
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Changing rules affects the <strong>next</strong> balance generation. Balances
              already generated are not withdrawn — regenerate for the academic year after
              narrowing a type.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          {/* Routed through the same close path as Escape and the overlay —
              calling onOpenChange directly skipped reset(), so the previous
              type's picker state leaked into the next one. */}
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
