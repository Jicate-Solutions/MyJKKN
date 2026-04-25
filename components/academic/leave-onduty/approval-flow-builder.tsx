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
import {
  useCustomRolesForApproval,
  useInstitutionApprovers,
} from '@/hooks/organization/use-custom-roles';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Plus, X, GripVertical, Search, ArrowRight, ArrowDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface ApprovalFlowBuilderProps {
  flowType: FlowType;
  flowSteps: ApprovalFlowStep[];
  onFlowTypeChange: (type: FlowType) => void;
  onFlowStepsChange: (steps: ApprovalFlowStep[]) => void;
  institutionId: string;
  /** @deprecated Kept for back-compat; no longer used by the picker. */
  departmentId?: string;
  className?: string;
}

export function ApprovalFlowBuilder({
  flowType,
  flowSteps,
  onFlowTypeChange,
  onFlowStepsChange,
  institutionId,
  className,
}: ApprovalFlowBuilderProps) {
  const { data: customRoles } = useCustomRolesForApproval();

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
                institutionId={institutionId}
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
  institutionId: string;
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
  institutionId,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: StepCardProps) {
  const [approverSearch, setApproverSearch] = useState('');

  // Ensure customRoles is always an array for safe operations
  const safeRoles = Array.isArray(customRoles) ? customRoles : [];

  // Fetch every non-student user in the institution. The step no longer
  // requires a role to be picked first — the admin just searches for any
  // staff/faculty/HOD/principal and selects them directly. The step's
  // approver_role / role_name / role_id fields are auto-derived from the
  // first-selected approver's profile.role at selection time (see
  // handleUserToggle below).
  const { data: users, isLoading: usersLoading } = useInstitutionApprovers(institutionId);

  // Ensure users is always an array
  const safeUsers = Array.isArray(users) ? users : [];

  // Build a name/email lookup for the role BADGE we render per row. We prefer
  // the display name from custom_roles when available; fall back to the raw
  // profiles.role enum value capitalized.
  const roleNameByKey = new Map<string, string>(
    safeRoles.map((r) => [r.role_key, r.role_name])
  );
  const getRoleDisplay = (roleKey: string | null | undefined): string => {
    if (!roleKey) return 'No Role';
    return roleNameByKey.get(roleKey) ?? roleKey.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };

  // Resolve role metadata (role_id, role_name, approver_role) from a selected
  // approver's profile.role. This is what keeps the step record
  // backward-compatible with the approval seeder in
  // lib/services/academic/leave-onduty-service.ts — approver_role is NOT NULL
  // on leave_onduty_approvals, so we MUST persist something.
  const deriveRoleFieldsFromUser = (roleKey: string) => {
    const match = safeRoles.find((r) => r.role_key === roleKey);
    return {
      role_id: match?.id ?? '',
      role_name: match?.role_name ?? getRoleDisplay(roleKey),
      approver_role: roleKey,
    };
  };

  const handleUserToggle = (userId: string) => {
    const currentApprovers = Array.isArray(step.approver_ids) ? step.approver_ids : [];
    const isSelected = currentApprovers.includes(userId);

    const newApprovers = isSelected
      ? currentApprovers.filter((id) => id !== userId)
      : [...currentApprovers, userId];

    // Derive role fields from the FIRST remaining approver (so the step's
    // role metadata always reflects the current picked set). If the last
    // approver was removed, clear the fields so the empty-state UX is clean.
    const primaryUserId = newApprovers[0];
    const primaryUser = primaryUserId
      ? safeUsers.find((u) => u.id === primaryUserId)
      : undefined;
    const derivedRole = primaryUser?.role
      ? deriveRoleFieldsFromUser(primaryUser.role)
      : { role_id: '', role_name: '', approver_role: '' };

    onUpdate(step.step_order, {
      approver_ids: newApprovers,
      ...derivedRole,
    });
  };

  // Safely get selected users
  const approverIds = Array.isArray(step.approver_ids) ? step.approver_ids : [];
  const selectedUsers = safeUsers.filter((u) => approverIds.includes(u.id));

  // Check for mixed-role warning: if selected approvers have different roles,
  // warn the admin that only the first approver's role will be stored on the
  // step (which affects badges/labels downstream, not the approval itself).
  const selectedRoleKeys = Array.from(
    new Set(selectedUsers.map((u) => u.role).filter(Boolean))
  );
  const hasMixedRoles = selectedRoleKeys.length > 1;

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
              {/* Approver Picker — single unified list of institution staff.
                  No separate "Approver Role" field: the step's role_name /
                  approver_role are auto-derived from the first selected
                  approver (see handleUserToggle). */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Select Approvers *</Label>
                  {step.role_name && (
                    <Badge variant="outline" className="text-xs font-normal">
                      Role: {step.role_name}
                    </Badge>
                  )}
                </div>
                {!institutionId ? (
                  <div className="text-sm text-gray-500 italic p-2 border border-gray-200 dark:border-gray-700 rounded-md">
                    Please select an institution first to view available users.
                  </div>
                ) : usersLoading ? (
                  <div className="text-sm text-gray-500 italic p-2 border border-gray-200 dark:border-gray-700 rounded-md">
                    Loading users...
                  </div>
                ) : safeUsers.length === 0 ? (
                  <div className="text-sm text-gray-500 italic p-2 border border-gray-200 dark:border-gray-700 rounded-md">
                    No staff users found in this institution.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Search input for approvers */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Search by name, email, or role..."
                        value={approverSearch}
                        onChange={(e) => setApproverSearch(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    {/* Filtered user list - only shown when searching */}
                    {approverSearch.trim() && (
                      <div className="border border-gray-200 dark:border-gray-700 rounded-md max-h-64 overflow-y-auto">
                        {(() => {
                          const query = approverSearch.trim().toLowerCase();
                          const filtered = safeUsers.filter((user) => {
                            const roleDisplay = getRoleDisplay(user.role).toLowerCase();
                            return (
                              user.full_name?.toLowerCase().includes(query) ||
                              user.email?.toLowerCase().includes(query) ||
                              roleDisplay.includes(query) ||
                              user.role?.toLowerCase().includes(query)
                            );
                          });
                          if (filtered.length === 0) {
                            return (
                              <div className="p-3 text-sm text-gray-500 text-center">
                                No matching approvers found
                              </div>
                            );
                          }
                          return filtered.map((user) => {
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
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-sm truncate">
                                      {user.full_name}
                                    </span>
                                    <Badge variant="secondary" className="text-[10px] capitalize flex-shrink-0">
                                      {getRoleDisplay(user.role)}
                                    </Badge>
                                  </div>
                                  <div className="text-xs text-gray-500 truncate">
                                    {user.email}
                                  </div>
                                </div>
                                {isChecked && (
                                  <Check className="h-4 w-4 text-primary flex-shrink-0" />
                                )}
                              </div>
                            );
                          });
                        })()}
                      </div>
                    )}
                    <p className="text-xs text-gray-500">
                      {approverIds.length} of {safeUsers.length} user(s) selected
                      {!approverSearch.trim() && (
                        <span className="ml-1">· Type to search approvers</span>
                      )}
                    </p>
                  </div>
                )}

                {/* Selected Users Display — chips show name + role */}
                {selectedUsers && selectedUsers.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {selectedUsers.map((user) => (
                      <Badge
                        key={user.id}
                        variant="secondary"
                        className="gap-1"
                      >
                        <span>{user.full_name}</span>
                        <span className="opacity-60 text-[10px]">
                          ({getRoleDisplay(user.role)})
                        </span>
                        <X
                          className="h-3 w-3 cursor-pointer hover:text-red-600"
                          onClick={() => handleUserToggle(user.id)}
                        />
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Mixed-roles hint — only the first approver's role drives
                    the step's role_name/approver_role metadata. */}
                {hasMixedRoles && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Selected approvers hold multiple roles. The step will be
                    labeled as &quot;{step.role_name}&quot; (first approver&apos;s role).
                  </p>
                )}
              </div>

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
