'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { useRoles } from '@/hooks/organization/use-roles';
import type { CreateApprovalStepDto, ApprovalWorkflowType } from '@/types/service-request';

interface ApprovalStepBuilderProps {
  steps: CreateApprovalStepDto[];
  onChange: (steps: CreateApprovalStepDto[]) => void;
  availableRoles?: string[];
  workflowType?: ApprovalWorkflowType;
}

export function ApprovalStepBuilder({
  steps,
  onChange,
  availableRoles,
  workflowType = 'sequential',
}: ApprovalStepBuilderProps) {
  const { data: rolesData } = useRoles();
  const roles = availableRoles && availableRoles.length > 0
    ? availableRoles
    : rolesData?.map((r) => r.role_key) || [];

  const getRoleLabel = (roleKey: string) => {
    const role = rolesData?.find((r) => r.role_key === roleKey);
    return role?.role_name || roleKey.replace(/_/g, ' ');
  };

  const addStep = () => {
    const newStep: CreateApprovalStepDto = {
      step_order: steps.length + 1,
      step_name: '',
      approver_role: '',
      is_required: true,
    };
    onChange([...steps, newStep]);
  };

  const updateStep = (index: number, updates: Partial<CreateApprovalStepDto>) => {
    const updated = [...steps];
    updated[index] = { ...updated[index], ...updates };
    onChange(updated);
  };

  const removeStep = (index: number) => {
    const updated = steps.filter((_, i) => i !== index);
    updated.forEach((s, i) => (s.step_order = i + 1));
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
                <><ArrowRight className="h-3 w-3" /> Sequential</>
              ) : (
                <><GitBranch className="h-3 w-3" /> Parallel</>
              )}
            </span>
          )}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addStep} className="gap-1">
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
        <Card key={index}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              {/* Step number */}
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold shrink-0 mt-5">
                {isSequential ? step.step_order : '||'}
              </div>

              <div className="flex-1 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  {/* Step name */}
                  <div className="sm:col-span-5 space-y-1">
                    <Label className="text-xs">Step Name</Label>
                    <Input
                      placeholder="e.g. HOD Approval"
                      value={step.step_name}
                      onChange={(e) => updateStep(index, { step_name: e.target.value })}
                    />
                  </div>

                  {/* Approver role */}
                  <div className="sm:col-span-4 space-y-1">
                    <Label className="text-xs">Approver Role</Label>
                    <Select
                      value={step.approver_role}
                      onValueChange={(v) => updateStep(index, { approver_role: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        {roles.map((role) => (
                          <SelectItem key={role} value={role}>
                            {getRoleLabel(role)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Required + Delete */}
                  <div className="sm:col-span-3 flex items-end gap-2">
                    <div className="flex items-center gap-1.5 pb-2">
                      <Checkbox
                        id={`step-req-${index}`}
                        checked={step.is_required !== false}
                        onCheckedChange={(c) => updateStep(index, { is_required: !!c })}
                      />
                      <Label htmlFor={`step-req-${index}`} className="text-xs cursor-pointer">
                        Required
                      </Label>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-700"
                      onClick={() => removeStep(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* On Return: Restart From Step (only for sequential + step > 1) */}
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
                        updateStep(index, {
                          on_return_restart_from_step: v === 'current' ? null : Number(v),
                        })
                      }
                    >
                      <SelectTrigger className="w-[200px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="current">
                          Current step (resume)
                        </SelectItem>
                        {steps
                          .filter((_, i) => i < index)
                          .map((s) => (
                            <SelectItem key={s.step_order} value={String(s.step_order)}>
                              Step {s.step_order}{s.step_name ? `: ${s.step_name}` : ''}
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
      ))}

      {/* Visual workflow indicator */}
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
