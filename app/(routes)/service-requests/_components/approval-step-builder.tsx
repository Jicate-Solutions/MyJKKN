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
  /**
   * Institutions the service type is scoped to. When populated, the approver
   * combobox shows only users from those institutions. When empty (e.g.
   * "common" scope), all approver-eligible users are shown.
   */
  institutionIds?: string[];
}

/**
 * step_name was a free-form text field — we've removed it from the UI and now
 * derive it from the selected approver. The column is still NOT NULL in the
 * DB, so we always produce a non-empty string.
 */
function buildStepName(
  order: number,
  roleName: string | undefined,
  approverName: string | undefined
): string {
  const base = roleName?.trim() || `Step ${order}`;
  return approverName?.trim() ? `${base} – ${approverName}` : base;
}

export function ApprovalStepBuilder({
  steps,
  onChange,
  workflowType = 'sequential',
  institutionIds,
}: ApprovalStepBuilderProps) {
  const { data: roles = [], isLoading: rolesLoading } = useCustomRolesForApproval();

  // Lift the user fetch so all N StepRows share one query. The users are the
  // same for every step — same role set, same institutions — so querying
  // per-step would be N identical requests.
  const roleKeys = useMemo(() => roles.map((r) => r.role_key), [roles]);
  const { data: allUsers = [], isLoading: usersLoading } = useUsersByRole(
    roleKeys.length > 0 ? roleKeys : null,
    institutionIds && institutionIds.length === 1 ? institutionIds[0] : undefined,
    undefined
  );

  // For multi-institution scope, useUsersByRole only accepts one institution,
  // so we fan out and filter client-side.
  const scopedUsers: UserWithRole[] = useMemo(() => {
    if (institutionIds && institutionIds.length > 1) {
      return allUsers.filter(
        (u) => u.institution_id && institutionIds.includes(u.institution_id)
      );
    }
    return allUsers;
  }, [allUsers, institutionIds]);

  const rolesByKey = useMemo(() => {
    const m = new Map<string, CustomRole>();
    roles.forEach((r) => m.set(r.role_key, r));
    return m;
  }, [roles]);

  const getRoleLabel = (roleKey: string) =>
    rolesByKey.get(roleKey)?.role_name || roleKey.replace(/_/g, ' ');

  const addStep = () => {
    const order = steps.length + 1;
    const newStep: CreateApprovalStepDto = {
      step_order: order,
      step_name: `Step ${order}`,
      approver_role: '',
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

  const handleUserSelect = (index: number, user: UserWithRole) => {
    const role = rolesByKey.get(user.role);
    updateStep(index, {
      approver_role: user.role,
      step_name: buildStepName(
        steps[index].step_order,
        role?.role_name || user.role,
        user.full_name
      ),
    });
  };

  const handleClearSelection = (index: number) => {
    updateStep(index, {
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
          users={scopedUsers}
          usersLoading={usersLoading || rolesLoading}
          institutionIds={institutionIds}
          getRoleLabel={getRoleLabel}
          onUserSelect={(user) => handleUserSelect(index, user)}
          onClearUser={() => handleClearSelection(index)}
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
  usersLoading: boolean;
  institutionIds?: string[];
  getRoleLabel: (key: string) => string;
  onUserSelect: (user: UserWithRole) => void;
  onClearUser: () => void;
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
  usersLoading,
  institutionIds,
  getRoleLabel,
  onUserSelect,
  onClearUser,
  onRequiredChange,
  onRestartFromChange,
  onRemove,
}: StepRowProps) {
  const [open, setOpen] = useState(false);

  // Recover the saved approver's name from the auto-generated step_name so
  // the trigger shows the prior selection on edit. Format: "Role – Name".
  const savedApproverName = step.step_name?.includes(' – ')
    ? step.step_name.split(' – ').slice(1).join(' – ')
    : undefined;

  // Prefer matching by approver_role + full_name — guards against two users
  // with the same name in different roles.
  const selectedUser = users.find(
    (u) => u.role === step.approver_role && u.full_name === savedApproverName
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
              {/* Approver combobox — single field replacing Role + Name */}
              <div className="sm:col-span-9 space-y-1">
                <Label className="text-xs">
                  Approver <span className="text-red-500">*</span>
                </Label>
                <Popover open={open} onOpenChange={setOpen} modal>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={open}
                      className={cn(
                        'w-full justify-between min-h-[44px] h-auto py-2 font-normal',
                        !step.approver_role && 'text-muted-foreground'
                      )}
                      disabled={usersLoading}
                    >
                      {selectedUser ? (
                        <SelectedApproverDisplay
                          user={selectedUser}
                          roleLabel={getRoleLabel(selectedUser.role)}
                        />
                      ) : savedApproverName && step.approver_role ? (
                        // Fall back when the saved user can't be found in the
                        // current list (moved institution, deleted, RLS hides).
                        <div className="flex items-center gap-2 text-left">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-foreground">
                              {savedApproverName}
                            </span>
                            <span className="text-xs text-muted-foreground italic">
                              Not found in current scope
                            </span>
                          </div>
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {getRoleLabel(step.approver_role)}
                          </Badge>
                        </div>
                      ) : (
                        <span className="flex items-center gap-2">
                          <Search className="h-4 w-4" />
                          {usersLoading
                            ? 'Loading approvers…'
                            : 'Search by name, email, or role…'}
                        </span>
                      )}
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
                            : institutionIds && institutionIds.length > 0
                            ? 'No approvers found in the scoped institutions.'
                            : 'No approvers found.'}
                        </CommandEmpty>
                        {selectedUser && (
                          <CommandGroup heading="Current">
                            <CommandItem
                              value={`__clear__ ${selectedUser.full_name}`}
                              onSelect={() => {
                                onClearUser();
                                setOpen(false);
                              }}
                              className="text-muted-foreground"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Clear selection
                            </CommandItem>
                          </CommandGroup>
                        )}
                        <CommandGroup heading={`${users.length} approver${users.length === 1 ? '' : 's'}`}>
                          {users.map((u) => {
                            const isSelected = selectedUser?.id === u.id;
                            const roleLabel = getRoleLabel(u.role);
                            return (
                              <CommandItem
                                key={u.id}
                                // Concatenate all searchable text so
                                // CommandInput filters across them.
                                value={`${u.full_name} ${u.email} ${u.role} ${roleLabel}`}
                                onSelect={() => {
                                  onUserSelect(u);
                                  setOpen(false);
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
              <div className="flex items-center gap-3">
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
                  <SelectTrigger className="w-[260px] h-8 text-xs">
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

function SelectedApproverDisplay({
  user,
  roleLabel,
}: {
  user: UserWithRole;
  roleLabel: string;
}) {
  return (
    <div className="flex items-center gap-2 text-left flex-1 min-w-0">
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-medium text-foreground truncate">
          {user.full_name}
        </span>
        <span className="text-xs text-muted-foreground truncate">
          {user.email}
        </span>
      </div>
      <Badge variant="outline" className="text-[10px] capitalize shrink-0">
        {roleLabel}
      </Badge>
    </div>
  );
}
