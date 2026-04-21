'use client';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, ArrowRight, GitBranch } from 'lucide-react';
import {
  useCustomRolesForApproval,
  useUsersByRole,
  type UserWithRole,
} from '@/hooks/organization/use-custom-roles';
import type { CreateApprovalStepDto, ApprovalWorkflowType } from '@/types/service-request';

interface ApprovalStepBuilderProps {
  steps: CreateApprovalStepDto[];
  onChange: (steps: CreateApprovalStepDto[]) => void;
  workflowType?: ApprovalWorkflowType;
  /**
   * Institutions the service type is scoped to. When non-empty, the approver
   * name dropdown is filtered to users in those institutions. When empty
   * (e.g. "common" scope), all users with the role are shown.
   */
  institutionIds?: string[];
}

/**
 * Step templates used to be stored with a free-form `step_name`. We've removed
 * that input — `step_name` is now auto-generated from the chosen role (and
 * approver name if any). The column is still NOT NULL in the DB, so we always
 * produce a non-empty string here.
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

  const getRoleLabel = (roleKey: string) =>
    roles.find((r) => r.role_key === roleKey)?.role_name ||
    roleKey.replace(/_/g, ' ');

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
          rolesLoading={rolesLoading}
          roles={roles}
          institutionIds={institutionIds}
          getRoleLabel={getRoleLabel}
          onRoleChange={(roleKey) => {
            // Clear any stale approver name when the role changes — it won't
            // apply to a different role.
            updateStep(index, {
              approver_role: roleKey,
              step_name: buildStepName(
                step.step_order,
                roles.find((r) => r.role_key === roleKey)?.role_name,
                undefined
              ),
            });
          }}
          onApproverChange={(name) => {
            updateStep(index, {
              step_name: buildStepName(
                step.step_order,
                roles.find((r) => r.role_key === step.approver_role)?.role_name,
                name,
              ),
            });
          }}
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
  rolesLoading: boolean;
  roles: ReturnType<typeof useCustomRolesForApproval>['data'] extends infer T
    ? T extends undefined
      ? never
      : NonNullable<T>
    : never;
  institutionIds?: string[];
  getRoleLabel: (key: string) => string;
  onRoleChange: (roleKey: string) => void;
  onApproverChange: (fullName: string | undefined) => void;
  onRequiredChange: (required: boolean) => void;
  onRestartFromChange: (val: number | null) => void;
  onRemove: () => void;
}

function StepRow({
  index,
  step,
  steps,
  isSequential,
  rolesLoading,
  roles,
  institutionIds,
  getRoleLabel,
  onRoleChange,
  onApproverChange,
  onRequiredChange,
  onRestartFromChange,
  onRemove,
}: StepRowProps) {
  // Pull the current approver's name out of the auto-generated step_name so
  // the Select trigger shows the prior selection after a reload. step_name
  // format: "RoleName – FullName" or just "RoleName".
  const approverName = step.step_name?.includes(' – ')
    ? step.step_name.split(' – ').slice(1).join(' – ')
    : undefined;

  // Fetch users for the selected role, scoped to the form's institutions.
  const { data: users = [], isLoading: usersLoading } = useUsersByRole(
    step.approver_role || null,
    institutionIds && institutionIds.length === 1 ? institutionIds[0] : undefined,
    undefined
  );

  // When multiple institutions are scoped, fan them out: useUsersByRole only
  // accepts one institution, so we lift the filter to the client side.
  const filteredUsers: UserWithRole[] =
    institutionIds && institutionIds.length > 1
      ? users.filter(
          (u) => u.institution_id && institutionIds.includes(u.institution_id)
        )
      : users;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold shrink-0 mt-5">
            {isSequential ? step.step_order : '||'}
          </div>

          <div className="flex-1 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              {/* Approver Role */}
              <div className="sm:col-span-5 space-y-1">
                <Label className="text-xs">
                  Approver Role <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={step.approver_role}
                  onValueChange={onRoleChange}
                  disabled={rolesLoading}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={rolesLoading ? 'Loading roles…' : 'Select role'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role.role_key} value={role.role_key}>
                        <div className="flex flex-col">
                          <span className="font-medium">{role.role_name}</span>
                          <span className="text-xs text-muted-foreground">
                            {role.role_key}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Approver Name — filtered by role + institutions */}
              <div className="sm:col-span-4 space-y-1">
                <Label className="text-xs">Approver Name</Label>
                <Select
                  value={approverName ?? '__any__'}
                  onValueChange={(v) =>
                    onApproverChange(v === '__any__' ? undefined : v)
                  }
                  disabled={!step.approver_role || usersLoading}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        !step.approver_role
                          ? 'Select role first'
                          : usersLoading
                          ? 'Loading users…'
                          : 'Any user with this role'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any__">
                      <span className="text-muted-foreground">
                        Any user with this role
                      </span>
                    </SelectItem>
                    {filteredUsers.length === 0 && !usersLoading ? (
                      <div className="py-2 px-2 text-xs text-muted-foreground">
                        No users found in{' '}
                        {institutionIds && institutionIds.length > 0
                          ? 'the scoped institutions'
                          : 'this role'}
                        .
                      </div>
                    ) : (
                      filteredUsers.map((u) => (
                        <SelectItem key={u.id} value={u.full_name}>
                          <div className="flex flex-col">
                            <span className="font-medium">{u.full_name}</span>
                            <span className="text-xs text-muted-foreground">
                              {u.email}
                            </span>
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
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
                  className="h-8 w-8 text-red-500 hover:text-red-700"
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
