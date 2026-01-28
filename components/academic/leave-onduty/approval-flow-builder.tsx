'use client';

/**
 * Approval Flow Builder Component
 *
 * Drag-and-drop interface for configuring approval workflows.
 * Allows admins to create sequential or parallel approval flows.
 *
 * @module components/academic/leave-onduty/approval-flow-builder
 */

import { useState } from 'react';
import {
  ApprovalFlowStep,
  FlowType,
  ApproverRole,
  APPROVER_ROLE_LABELS,
} from '@/types/leave-onduty';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Plus, X, GripVertical, ArrowRight, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ApprovalFlowBuilderProps {
  flowType: FlowType;
  flowSteps: ApprovalFlowStep[];
  onFlowTypeChange: (type: FlowType) => void;
  onFlowStepsChange: (steps: ApprovalFlowStep[]) => void;
  className?: string;
}

export function ApprovalFlowBuilder({
  flowType,
  flowSteps,
  onFlowTypeChange,
  onFlowStepsChange,
  className,
}: ApprovalFlowBuilderProps) {
  const addStep = () => {
    const newStep: ApprovalFlowStep = {
      step_order: flowSteps.length + 1,
      role: 'faculty',
      scope: 'assigned_faculty',
      is_required: true,
      description: '',
    };
    onFlowStepsChange([...flowSteps, newStep]);
  };

  const removeStep = (stepOrder: number) => {
    const updatedSteps = flowSteps
      .filter((s) => s.step_order !== stepOrder)
      .map((s, index) => ({ ...s, step_order: index + 1 }));
    onFlowStepsChange(updatedSteps);
  };

  const updateStep = (stepOrder: number, updates: Partial<ApprovalFlowStep>) => {
    const updatedSteps = flowSteps.map((s) =>
      s.step_order === stepOrder ? { ...s, ...updates } : s
    );
    onFlowStepsChange(updatedSteps);
  };

  const moveStep = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= flowSteps.length) return;

    const newSteps = [...flowSteps];
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

        {flowSteps.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No approval steps configured. Click "Add Step" to create your first step.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {flowSteps.map((step, index) => (
              <div key={step.step_order}>
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
                        onClick={() => moveStep(index, index - 1)}
                        disabled={index === 0}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <GripVertical className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveStep(index, index + 1)}
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
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Approver Role</Label>
                          <Select
                            value={step.role}
                            onValueChange={(value) =>
                              updateStep(step.step_order, { role: value as ApproverRole })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(APPROVER_ROLE_LABELS).map(([value, label]) => (
                                <SelectItem key={value} value={value}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Scope</Label>
                          <Select
                            value={step.scope}
                            onValueChange={(value) =>
                              updateStep(step.step_order, {
                                scope: value as ApprovalFlowStep['scope'],
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="assigned_faculty">
                                Assigned Faculty
                              </SelectItem>
                              <SelectItem value="department">Department Level</SelectItem>
                              <SelectItem value="institution">
                                Institution Level
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Description</Label>
                        <Input
                          value={step.description}
                          onChange={(e) =>
                            updateStep(step.step_order, { description: e.target.value })
                          }
                          placeholder="e.g., Course faculty approval"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`required-${step.step_order}`}
                          checked={step.is_required}
                          onCheckedChange={(checked) =>
                            updateStep(step.step_order, { is_required: checked as boolean })
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

                    {/* Remove Button */}
                    <button
                      type="button"
                      onClick={() => removeStep(step.step_order)}
                      className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                      aria-label="Remove step"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Flow Preview */}
      {flowSteps.length > 0 && (
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
            {flowSteps.map((step, index) => (
              <div key={step.step_order} className="flex items-center gap-2">
                <div className="inline-flex items-center gap-2 rounded-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-xs">
                    {step.step_order}
                  </div>
                  <span className="font-medium">{APPROVER_ROLE_LABELS[step.role]}</span>
                  {!step.is_required && (
                    <span className="text-xs text-gray-500">(Optional)</span>
                  )}
                </div>
                {index < flowSteps.length - 1 && (
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
