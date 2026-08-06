'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Plus,
  Trash2,
  ArrowRight,
  GitBranch,
  ChevronsUpDown,
  Check,
  Search,
  X,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useCustomRolesForApproval,
  useUsersByRole,
  type UserWithRole,
  type CustomRole,
} from '@/hooks/organization/use-custom-roles';
import type { CreateApprovalStepDto, ApprovalWorkflowType } from '@/types/service-request';

interface ApprovalStepBuilderProps {
  steps: CreateApprovalStepDto[];
  onChange: (steps: CreateApprovalStepDto[]) => void;
  workflowType?: ApprovalWorkflowType;
}

/**
 * Derives a stable step name from the chosen approvers. The step_name column
 * is NOT NULL in the DB so we always produce a non-empty string. With
 * multi-approver support we drop the "Role – Name" encoding (which can't
 * represent N users) and just use the role label or a "Step N" fallback.
 */
function buildStepName(order: number, roleName: string | undefined): string {
  return roleName?.trim() || `Step ${order}`;
}

export function ApprovalStepBuilder({
  steps,
  onChange,
  workflowType = 'sequential',
}: ApprovalStepBuilderProps) {
  const { data: roles = [], isLoading: rolesLoading } = useCustomRolesForApproval();

  // Lift the user fetch so all N StepRows share one query — same role set for
  // every step, so a per-step fetch would be N identical requests.
  //
  // Approvers are intentionally NOT scoped to the service type's Service
  // Visibility (institution/degree/…). The author can pick ANY approver-
  // eligible user; RLS still gates which profiles they're allowed to read.
  // Students never appear (roleKeys excludes them), which keeps this
  // unscoped list small. Narrowing the list is done per-step via the
  // client-side "Filter by role" control in StepRow.
  const roleKeys = useMemo(() => roles.map((r) => r.role_key), [roles]);
  const { data: users = [], isLoading: usersLoading } = useUsersByRole(
    roleKeys.length > 0 ? roleKeys : null,
    undefined,
    undefined
  );

  const rolesByKey = useMemo(() => {
    const m = new Map<string, CustomRole>();
    roles.forEach((r) => m.set(r.role_key, r));
    return m;
  }, [roles]);

  const usersById = useMemo(() => {
    const m = new Map<string, UserWithRole>();
    users.forEach((u) => m.set(u.id, u));
    return m;
  }, [users]);

  const getRoleLabel = (roleKey: string) =>
    rolesByKey.get(roleKey)?.role_name || roleKey.replace(/_/g, ' ');

  const addStep = () => {
    const order = steps.length + 1;
    const newStep: CreateApprovalStepDto = {
      step_order: order,
      step_name: `Step ${order}`,
      approver_role: '',
      approver_user_ids: [],
      is_required: true,
    };
    onChange([...steps, newStep]);
  };

  const removeStep = (index: number) => {
    const updated = steps.filter((_, i) => i !== index);
    updated.forEach((s, i) => {
      s.step_order = i + 1;
    });
    onChange(updated);
  };

  const updateStep = (
    index: number,
    updates: Partial<CreateApprovalStepDto>
  ) => {
    const updated = [...steps];
    updated[index] = { ...updated[index], ...updates };
    onChange(updated);
  };

  /**
   * Toggle a user in a step's approver list.
   *
   * approver_role stays populated as a "discovery role" — it's set to the
   * first selected user's role so legacy inbox-by-role queries still fire.
   * When the list becomes empty the step is invalid (zod enforces ≥1) and
   * we clear approver_role too.
   */
  const handleToggleUser = (index: number, user: UserWithRole) => {
    const current = steps[index].approver_user_ids ?? [];
    const isSelected = current.includes(user.id);
    const nextIds = isSelected
      ? current.filter((id) => id !== user.id)
      : [...current, user.id];

    if (nextIds.length === 0) {
      updateStep(index, {
        approver_user_ids: [],
        approver_role: '',
        step_name: `Step ${steps[index].step_order}`,
      });
      return;
    }

    // Use the first-selected user's role as the step's representative/
    // fallback role. Not always meaningful (users may span roles) but keeps
    // the NOT NULL constraint + legacy role-based match happy.
    const firstUser = usersById.get(nextIds[0]) ?? user;
    const role = rolesByKey.get(firstUser.role);
    updateStep(index, {
      approver_user_ids: nextIds,
      approver_role: firstUser.role,
      step_name: buildStepName(
        steps[index].step_order,
        role?.role_name || firstUser.role
      ),
    });
  };

  const handleClearAll = (index: number) => {
    updateStep(index, {
      approver_user_ids: [],
      approver_role: '',
      step_name: `Step ${steps[index].step_order}`,
    });
  };

  const isSequential = workflowType === 'sequential';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Label className="text-base font-semibold">Approval Steps</Label>
          {steps.length > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {isSequential ? (
                <>
                  <ArrowRight className="h-3 w-3" /> Sequential
                </>
              ) : (
                <>
                  <GitBranch className="h-3 w-3" /> Parallel
                </>
              )}
            </span>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addStep}
          className="gap-1"
          disabled={rolesLoading}
        >
          <Plus className="h-4 w-4" />
          Add Step
        </Button>
      </div>

      {steps.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No approval steps configured. Click &quot;Add Step&quot; to add one.
        </p>
      )}

      {steps.map((step, index) => (
        <StepRow
          key={index}
          index={index}
          step={step}
          steps={steps}
          isSequential={isSequential}
          users={users}
          usersById={usersById}
          usersLoading={usersLoading || rolesLoading}
          roles={roles}
          getRoleLabel={getRoleLabel}
          onToggleUser={(user) => handleToggleUser(index, user)}
          onClearAll={() => handleClearAll(index)}
          onRequiredChange={(req) => updateStep(index, { is_required: req })}
          onRestartFromChange={(val) =>
            updateStep(index, { on_return_restart_from_step: val })
          }
          onRemove={() => removeStep(index)}
        />
      ))}

      {steps.length > 1 && (
        <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
          {isSequential ? (
            steps.map((step, i) => (
              <span key={i} className="flex items-center gap-1">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-semibold">
                  {step.step_order}
                </span>
                {i < steps.length - 1 && <ArrowRight className="h-3 w-3" />}
              </span>
            ))
          ) : (
            <span className="flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              All {steps.length} approvers notified simultaneously
            </span>
          )}
        </div>
      )}
    </div>
  );
}

interface StepRowProps {
  index: number;
  step: CreateApprovalStepDto;
  steps: CreateApprovalStepDto[];
  isSequential: boolean;
  users: UserWithRole[];
  usersById: Map<string, UserWithRole>;
  usersLoading: boolean;
  roles: CustomRole[];
  getRoleLabel: (key: string) => string;
  onToggleUser: (user: UserWithRole) => void;
  onClearAll: () => void;
  onRequiredChange: (required: boolean) => void;
  onRestartFromChange: (val: number | null) => void;
  onRemove: () => void;
}

function StepRow({
  index,
  step,
  steps,
  isSequential,
  users,
  usersById,
  usersLoading,
  roles,
  getRoleLabel,
  onToggleUser,
  onClearAll,
  onRequiredChange,
  onRestartFromChange,
  onRemove,
}: StepRowProps) {
  const [open, setOpen] = useState(false);
  // Per-step view filter — narrows the (unscoped) candidate list to one role
  // so picking an approver in a long list is easy. 'all' = show everyone.
  // This never affects what's saved; approver_role is derived from the picked
  // user's own profile.role at selection time.
  const [roleFilter, setRoleFilter] = useState<string>('all');

  const selectedIds = step.approver_user_ids ?? [];
  const selectedUsers = selectedIds
    .map((id) => usersById.get(id))
    .filter((u): u is UserWithRole => Boolean(u));

  // IDs present in the step but missing from the candidate list. Happens when
  // a user was deleted or RLS hides them. We surface them as "unknown" badges
  // so the author can see + remove them.
  const unknownIds = selectedIds.filter((id) => !usersById.has(id));

  const hasSelection = selectedIds.length > 0;

  // Count candidates per role so the filter can show "RoleName (N)" and skip
  // roles that have no eligible users.
  const roleCounts = useMemo(() => {
    const m = new Map<string, number>();
    users.forEach((u) => m.set(u.role, (m.get(u.role) ?? 0) + 1));
    return m;
  }, [users]);

  const roleOptions = useMemo(
    () => roles.filter((r) => (roleCounts.get(r.role_key) ?? 0) > 0),
    [roles, roleCounts]
  );

  const filteredUsers = useMemo(
    () =>
      roleFilter === 'all'
        ? users
        : users.filter((u) => u.role === roleFilter),
    [users, roleFilter]
  );

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold shrink-0 mt-5">
            {isSequential ? step.step_order : '||'}
          </div>

          <div className="flex-1 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              {/* Approver multi-select — shows selected users as removable badges. */}
              <div className="sm:col-span-9 space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">
                    Approvers <span className="text-red-500">*</span>
                    {selectedIds.length > 1 && (
                      <span className="ml-2 text-muted-foreground font-normal">
                        · Any one of the {selectedIds.length} can approve
                      </span>
                    )}
                  </Label>
                  {hasSelection && (
                    <button
                      type="button"
                      className="text-[11px] text-muted-foreground hover:text-destructive"
                      onClick={onClearAll}
                    >
                      Clear all
                    </button>
                  )}
                </div>

                {/* Selected approver pills */}
                {hasSelection && (
                  <div className="flex flex-wrap gap-1.5 rounded-md border border-dashed p-2 bg-muted/30">
                    {selectedUsers.map((u) => (
                      <SelectedApproverPill
                        key={u.id}
                        user={u}
                        roleLabel={getRoleLabel(u.role)}
                        onRemove={() => onToggleUser(u)}
                      />
                    ))}
                    {unknownIds.map((id) => (
                      <Badge
                        key={id}
                        variant="outline"
                        className="gap-1 pl-2 pr-1 py-0.5 text-[11px] text-muted-foreground"
                      >
                        Unknown user (no longer available)
                        <button
                          type="button"
                          aria-label="Remove"
                          className="h-3.5 w-3.5 rounded-sm hover:bg-muted"
                          onClick={() =>
                            onToggleUser({
                              id,
                              full_name: '',
                              email: '',
                              role: '',
                              avatar_url: null,
                              institution_id: null,
                              department_id: null,
                            })
                          }
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Step 1: (optional) narrow the candidate list by role.
                    Lives OUTSIDE the approver popover to avoid nesting two
                    Radix portals; picking a role just filters the list below. */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    Filter by role
                  </span>
                  <Select value={roleFilter} onValueChange={setRoleFilter}>
                    <SelectTrigger className="h-8 flex-1 text-xs" disabled={usersLoading}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All roles ({users.length})</SelectItem>
                      {roleOptions.map((r) => (
                        <SelectItem key={r.role_key} value={r.role_key}>
                          {r.role_name} ({roleCounts.get(r.role_key)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Popover open={open} onOpenChange={setOpen} modal>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={open}
                      className="w-full justify-between font-normal text-muted-foreground"
                      disabled={usersLoading}
                    >
                      <span className="flex items-center gap-2">
                        {hasSelection ? (
                          <>
                            <Users className="h-4 w-4" />
                            Add or remove approvers…
                          </>
                        ) : (
                          <>
                            <Search className="h-4 w-4" />
                            {usersLoading
                              ? 'Loading approvers…'
                              : 'Search by name, email, or role…'}
                          </>
                        )}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[min(560px,calc(100vw-2rem))] p-0"
                    align="start"
                  >
                    <Command
                      filter={(value, search) => {
                        // CommandItem uses `value` as the search target. We
                        // concatenated name+email+role there, so a simple
                        // substring check is enough.
                        return value.toLowerCase().includes(search.toLowerCase())
                          ? 1
                          : 0;
                      }}
                    >
                      <CommandInput placeholder="Search by name, email, or role…" />
                      <CommandList className="max-h-[320px]">
                        <CommandEmpty>
                          {usersLoading
                            ? 'Loading…'
                            : roleFilter !== 'all'
                            ? 'No approvers with this role.'
                            : 'No approvers found.'}
                        </CommandEmpty>
                        <CommandGroup
                          heading={`${filteredUsers.length} approver${filteredUsers.length === 1 ? '' : 's'}${
                            roleFilter !== 'all' ? ` · ${getRoleLabel(roleFilter)}` : ''
                          }${
                            selectedIds.length > 0 ? ` · ${selectedIds.length} selected` : ''
                          }`}
                        >
                          {filteredUsers.map((u) => {
                            const isSelected = selectedIds.includes(u.id);
                            const roleLabel = getRoleLabel(u.role);
                            return (
                              <CommandItem
                                key={u.id}
                                // Concatenate all searchable text so
                                // CommandInput filters across them.
                                value={`${u.full_name} ${u.email} ${u.role} ${roleLabel}`}
                                onSelect={() => {
                                  onToggleUser(u);
                                  // Keep popover open so the author can
                                  // keep picking additional approvers.
                                }}
                              >
                                <div
                                  className={cn(
                                    'mr-2 flex h-4 w-4 items-center justify-center rounded border shrink-0',
                                    isSelected
                                      ? 'bg-primary border-primary'
                                      : 'border-muted-foreground'
                                  )}
                                >
                                  {isSelected && (
                                    <Check className="h-3 w-3 text-primary-foreground" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium truncate">
                                      {u.full_name}
                                    </span>
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] capitalize shrink-0"
                                    >
                                      {roleLabel}
                                    </Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {u.email}
                                  </p>
                                </div>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Required + Delete */}
              <div className="sm:col-span-3 flex items-end gap-2">
                <div className="flex items-center gap-1.5 pb-2">
                  <Checkbox
                    id={`step-req-${index}`}
                    checked={step.is_required !== false}
                    onCheckedChange={(c) => onRequiredChange(!!c)}
                  />
                  <Label
                    htmlFor={`step-req-${index}`}
                    className="text-xs cursor-pointer"
                  >
                    Required
                  </Label>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-red-500 hover:text-red-700 ml-auto"
                  onClick={onRemove}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* On Return: Restart From Step (sequential + step > 1 only) */}
            {isSequential && steps.length > 1 && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">
                  On return, restart from:
                </Label>
                <Select
                  value={
                    step.on_return_restart_from_step != null
                      ? String(step.on_return_restart_from_step)
                      : 'current'
                  }
                  onValueChange={(v) =>
                    onRestartFromChange(v === 'current' ? null : Number(v))
                  }
                >
                  <SelectTrigger className="w-full sm:w-[260px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current">Current step (resume)</SelectItem>
                    {steps
                      .filter((_, i) => i < index)
                      .map((s) => (
                        <SelectItem key={s.step_order} value={String(s.step_order)}>
                          Step {s.step_order}
                          {s.approver_role
                            ? `: ${getRoleLabel(s.approver_role)}`
                            : ''}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SelectedApproverPill({
  user,
  roleLabel,
  onRemove,
}: {
  user: UserWithRole;
  roleLabel: string;
  onRemove: () => void;
}) {
  return (
    <Badge
      variant="secondary"
      className="gap-1.5 pl-2 pr-1 py-0.5 text-[11px] font-normal max-w-full"
    >
      <span className="truncate">{user.full_name}</span>
      <span className="text-muted-foreground">·</span>
      <span className="capitalize text-muted-foreground">{roleLabel}</span>
      <button
        type="button"
        aria-label={`Remove ${user.full_name}`}
        className="h-3.5 w-3.5 rounded-sm hover:bg-muted-foreground/20 flex items-center justify-center shrink-0"
        onClick={onRemove}
      >
        <X className="h-3 w-3" />
      </button>
    </Badge>
  );
}
