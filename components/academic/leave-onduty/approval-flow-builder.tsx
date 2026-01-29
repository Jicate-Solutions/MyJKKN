'use client';

/**
 * Approval Flow Builder Component
 *
 * Drag-and-drop interface for configuring approval workflows.
 * Allows admins to create sequential or parallel approval flows with custom roles and user selection.
 *
 * @module components/academic/leave-onduty/approval-flow-builder
 */

import {
  ApprovalFlowStep,
  FlowType,
} from '@/types/leave-onduty';
import { useCustomRolesForApproval, useUsersByRole } from '@/hooks/organization/use-custom-roles';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Plus, X, GripVertical, ArrowRight, ArrowDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ApprovalFlowBuilderProps {
  flowType: FlowType;
  flowSteps: ApprovalFlowStep[];
  onFlowTypeChange: (type: FlowType) => void;
  onFlowStepsChange: (steps: ApprovalFlowStep[]) => void;
  institutionId: string;
  departmentId: string;
  className?: string;
}

export function ApprovalFlowBuilder({
  flowType,
  flowSteps,
  onFlowTypeChange,
  onFlowStepsChange,
  institutionId,
  departmentId,
  className,
}: ApprovalFlowBuilderProps) {
  const { data: customRoles, isLoading: rolesLoading } = useCustomRolesForApproval();

  // Ensure flowSteps is always an array and normalize steps
  const safeFlowSteps = Array.isArray(flowSteps) ? flowSteps : [];
  const normalizedSteps = safeFlowSteps.map((step) => ({
    ...step,
    approver_ids: Array.isArray(step.approver_ids) ? step.approver_ids : [],
  }));

  // Ensure customRoles is always an array
  const safeCustomRoles = Array.isArray(customRoles) ? customRoles : [];

  const addStep = () => {
    const newStep: ApprovalFlowStep = {
      step_order: normalizedSteps.length + 1,
      role_id: '',
      role_name: '',
      approver_ids: [],
      is_required: true,
    };
    onFlowStepsChange([...normalizedSteps, newStep]);
  };

  const removeStep = (stepOrder: number) => {
    const updatedSteps = normalizedSteps
      .filter((s) => s.step_order !== stepOrder)
      .map((s, index) => ({ ...s, step_order: index + 1 }));
    onFlowStepsChange(updatedSteps);
  };

  const updateStep = (stepOrder: number, updates: Partial<ApprovalFlowStep>) => {
    const updatedSteps = normalizedSteps.map((s) =>
      s.step_order === stepOrder ? { ...s, ...updates } : s
    );
    onFlowStepsChange(updatedSteps);
  };

  const moveStep = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= normalizedSteps.length) return;

    const newSteps = [...normalizedSteps];
    const [movedStep] = newSteps.splice(fromIndex, 1);
    newSteps.splice(toIndex, 0, movedStep);

    // Reorder step numbers
    const reorderedSteps = newSteps.map((s, index) => ({
      ...s,
      step_order: index + 1,
    }));

    onFlowStepsChange(reorderedSteps);
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* Flow Type Selection */}
      <div className="space-y-3">
        <Label className="text-base font-medium">Workflow Type</Label>
        <RadioGroup
          value={flowType}
          onValueChange={(value) => onFlowTypeChange(value as FlowType)}
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <label
            className={cn(
              'flex items-start gap-3 rounded-lg border-2 p-4 cursor-pointer transition-all',
              flowType === 'sequential'
                ? 'border-primary bg-primary/5'
                : 'border-gray-200 dark:border-gray-700 hover:border-primary/50'
            )}
          >
            <RadioGroupItem value="sequential" id="sequential" className="mt-1" />
            <div className="flex-1">
              <div className="font-medium text-gray-900 dark:text-gray-100 mb-1">
                Sequential
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                Approvals happen in order. Next step starts only after previous approval.
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <div className="flex items-center gap-1">
                  <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-medium">
                    1
                  </div>
                  <ArrowRight className="h-3 w-3" />
                  <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-medium">
                    2
                  </div>
                  <ArrowRight className="h-3 w-3" />
                  <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-medium">
                    3
                  </div>
                </div>
              </div>
            </div>
          </label>

          <label
            className={cn(
              'flex items-start gap-3 rounded-lg border-2 p-4 cursor-pointer transition-all',
              flowType === 'parallel'
                ? 'border-primary bg-primary/5'
                : 'border-gray-200 dark:border-gray-700 hover:border-primary/50'
            )}
          >
            <RadioGroupItem value="parallel" id="parallel" className="mt-1" />
            <div className="flex-1">
              <div className="font-medium text-gray-900 dark:text-gray-100 mb-1">
                Parallel
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                All approvers get notified simultaneously. Application approved when all
                required approvers approve.
              </div>
              <div className="flex flex-col gap-1 text-xs text-gray-500">
                <div className="flex items-center gap-1">
                  <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400 font-medium">
                    1
                  </div>
                  <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400 font-medium">
                    2
                  </div>
                  <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400 font-medium">
                    3
                  </div>
                </div>
              </div>
            </div>
          </label>
        </RadioGroup>
      </div>

      {/* Approval Steps */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-medium">Approval Steps</Label>
          <Button type="button" variant="outline" size="sm" onClick={addStep}>
            <Plus className="h-4 w-4 mr-1" />
            Add Step
          </Button>
        </div>

        {normalizedSteps.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No approval steps configured. Click "Add Step" to create your first step.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {normalizedSteps.map((step, index) => (
              <StepCard
                key={step.step_order}
                step={step}
                index={index}
                flowType={flowType}
                flowSteps={normalizedSteps}
                customRoles={safeCustomRoles}
                rolesLoading={rolesLoading}
                institutionId={institutionId}
                departmentId={departmentId}
                onUpdate={updateStep}
                onRemove={removeStep}
                onMoveUp={() => moveStep(index, index - 1)}
                onMoveDown={() => moveStep(index, index + 1)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Flow Preview */}
      {normalizedSteps.length > 0 && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800">
          <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">
            Workflow Preview
          </h4>
          <div
            className={cn(
              'flex gap-2',
              flowType === 'sequential' ? 'flex-col' : 'flex-row flex-wrap'
            )}
          >
            {normalizedSteps.map((step, index) => (
              <div key={step.step_order} className="flex items-center gap-2">
                <div className="inline-flex items-center gap-2 rounded-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-xs">
                    {step.step_order}
                  </div>
                  <span className="font-medium">{step.role_name || 'Select Role'}</span>
                  {Array.isArray(step.approver_ids) && step.approver_ids.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {step.approver_ids.length} user{step.approver_ids.length !== 1 ? 's' : ''}
                    </Badge>
                  )}
                  {!step.is_required && (
                    <span className="text-xs text-gray-500">(Optional)</span>
                  )}
                </div>
                {index < normalizedSteps.length - 1 && (
                  <>
                    {flowType === 'sequential' ? (
                      <ArrowDown className="h-4 w-4 text-gray-400" />
                    ) : (
                      <span className="text-xs text-gray-400">+</span>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================
// STEP CARD COMPONENT
// =====================================================

interface StepCardProps {
  step: ApprovalFlowStep;
  index: number;
  flowType: FlowType;
  flowSteps: ApprovalFlowStep[];
  customRoles: any[];
  rolesLoading: boolean;
  institutionId: string;
  departmentId: string;
  onUpdate: (stepOrder: number, updates: Partial<ApprovalFlowStep>) => void;
  onRemove: (stepOrder: number) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function StepCard({
  step,
  index,
  flowType,
  flowSteps,
  customRoles,
  rolesLoading,
  institutionId,
  departmentId,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: StepCardProps) {
  // Ensure customRoles is always an array for safe operations
  const safeRoles = Array.isArray(customRoles) ? customRoles : [];

  // Find the selected role safely
  const selectedRoleKey = safeRoles.find((r) => r.id === step.role_id)?.role_key || null;

  const { data: users, isLoading: usersLoading } = useUsersByRole(
    selectedRoleKey,
    institutionId,
    departmentId
  );

  // Ensure users is always an array
  const safeUsers = Array.isArray(users) ? users : [];

  const handleRoleChange = (roleId: string) => {
    const selectedRole = safeRoles.find((r) => r.id === roleId);
    if (selectedRole) {
      onUpdate(step.step_order, {
        role_id: roleId,
        role_name: selectedRole.role_name,
        approver_ids: [], // Reset approvers when role changes
      });
    }
  };

  const handleUserToggle = (userId: string) => {
    // Ensure approver_ids is always an array
    const currentApprovers = Array.isArray(step.approver_ids) ? step.approver_ids : [];
    const isSelected = currentApprovers.includes(userId);

    const newApprovers = isSelected
      ? currentApprovers.filter((id) => id !== userId)
      : [...currentApprovers, userId];

    onUpdate(step.step_order, {
      approver_ids: newApprovers,
    });
  };

  // Safely get selected users
  const approverIds = Array.isArray(step.approver_ids) ? step.approver_ids : [];
  const selectedUsers = safeUsers.filter((u) => approverIds.includes(u.id));

  return (
    <div>
      {/* Step Connector (for sequential flow) */}
      {flowType === 'sequential' && index > 0 && (
        <div className="flex justify-center py-1">
          <ArrowDown className="h-4 w-4 text-gray-400" />
        </div>
      )}

      {/* Step Card */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800">
        <div className="flex items-start gap-3">
          {/* Drag Handle */}
          <div className="flex flex-col gap-1 pt-2">
            <button
              type="button"
              onClick={onMoveUp}
              disabled={index === 0}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={index === flowSteps.length - 1}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <GripVertical className="h-4 w-4" />
            </button>
          </div>

          {/* Step Content */}
          <div className="flex-1 space-y-4">
            {/* Step Header */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-sm">
                {step.step_order}
              </div>
              <h4 className="font-medium text-gray-900 dark:text-gray-100">
                Step {step.step_order}
              </h4>
            </div>

            {/* Step Fields */}
            <div className="space-y-4">
              {/* Approver Role */}
              <div className="space-y-2">
                <Label>Approver Role *</Label>
                <Select value={step.role_id} onValueChange={handleRoleChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Role" />
                  </SelectTrigger>
                  <SelectContent>
                    {rolesLoading ? (
                      <SelectItem value="loading" disabled>
                        Loading roles...
                      </SelectItem>
                    ) : safeRoles.length > 0 ? (
                      safeRoles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.role_name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="no-roles" disabled>
                        No roles available
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Approver Users */}
              {step.role_id && (
                <div className="space-y-2">
                  <Label>Select Approvers *</Label>
                  {!institutionId || !departmentId ? (
                    <div className="text-sm text-gray-500 italic p-2 border border-gray-200 dark:border-gray-700 rounded-md">
                      Please select institution and department first to view available users
                    </div>
                  ) : usersLoading ? (
                    <div className="text-sm text-gray-500 italic p-2 border border-gray-200 dark:border-gray-700 rounded-md">
                      Loading users...
                    </div>
                  ) : safeUsers.length === 0 ? (
                    <div className="text-sm text-gray-500 italic p-2 border border-gray-200 dark:border-gray-700 rounded-md">
                      No users found with this role in selected institution/department
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {/* User Selection as Checkboxes - Simpler approach that avoids cmdk issues */}
                      <div className="border border-gray-200 dark:border-gray-700 rounded-md max-h-48 overflow-y-auto">
                        {safeUsers.map((user) => {
                          const isChecked = approverIds.includes(user.id);
                          return (
                            <div
                              key={user.id}
                              className={cn(
                                'flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-700 last:border-b-0',
                                isChecked && 'bg-primary/5'
                              )}
                              onClick={() => handleUserToggle(user.id)}
                            >
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={() => handleUserToggle(user.id)}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm truncate">{user.full_name}</div>
                                <div className="text-xs text-gray-500 truncate">{user.email}</div>
                              </div>
                              {isChecked && (
                                <Check className="h-4 w-4 text-primary flex-shrink-0" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-xs text-gray-500">
                        {approverIds.length} of {safeUsers.length} user(s) selected
                      </p>
                    </div>
                  )}
                  {/* Selected Users Display */}
                  {selectedUsers && selectedUsers.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {selectedUsers.map((user) => (
                        <Badge
                          key={user.id}
                          variant="secondary"
                          className="gap-1"
                        >
                          {user.full_name}
                          <X
                            className="h-3 w-3 cursor-pointer hover:text-red-600"
                            onClick={() => handleUserToggle(user.id)}
                          />
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Required Checkbox */}
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`required-${step.step_order}`}
                  checked={step.is_required}
                  onCheckedChange={(checked) =>
                    onUpdate(step.step_order, { is_required: checked as boolean })
                  }
                />
                <Label
                  htmlFor={`required-${step.step_order}`}
                  className="text-sm font-normal cursor-pointer"
                >
                  This step is required
                </Label>
              </div>
            </div>
          </div>

          {/* Remove Button */}
          <button
            type="button"
            onClick={() => onRemove(step.step_order)}
            className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            aria-label="Remove step"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
