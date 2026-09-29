'use client';

// One flow's step editor — used for both the group default and each
// institution override. Saving replaces the whole step list atomically via
// fn_lo_save_flow (LearnerLeaveTypeService.saveFlow); an empty list removes
// an override.

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowUp, ArrowDown, X, Plus, AlertTriangle, Loader2 } from 'lucide-react';
import {
  useApprovalRoleOptions,
  useSaveLearnerLeaveFlow,
} from '@/hooks/learners/use-learner-leave-types';
import {
  STEP_SCOPE_LABELS,
  STEP_SCOPE_HELP,
  type LearnerLeaveFlowStep,
  type LearnerLeaveResidency,
  type LearnerLeaveStepScope,
} from '@/types/learner-leave-types';

interface DraftStep {
  role_id: string;
  scope: LearnerLeaveStepScope;
}

interface FlowStepEditorProps {
  leaveTypeId: string;
  institutionId: string | null;
  title: string;
  description: string;
  initialSteps: LearnerLeaveFlowStep[];
  residency: LearnerLeaveResidency;
  flowResidency?: 'day_scholar' | 'hostel' | null;
  canManage: boolean;
  isOverride?: boolean;
  onSaved?: () => void;
  onRemoved?: () => void;
}

export function FlowStepEditor({
  leaveTypeId,
  institutionId,
  title,
  description,
  initialSteps,
  residency,
  flowResidency = null,
  canManage,
  isOverride,
  onSaved,
  onRemoved,
}: FlowStepEditorProps) {
  const { data: roles } = useApprovalRoleOptions();
  const saveFlow = useSaveLearnerLeaveFlow();
  const [steps, setSteps] = useState<DraftStep[]>(() =>
    initialSteps.map((s) => ({ role_id: s.role_id, scope: s.scope }))
  );

  // Re-sync local draft when the underlying flow identity changes (a
  // different leave type or a different institution card).
  useEffect(() => {
    setSteps(initialSteps.map((s) => ({ role_id: s.role_id, scope: s.scope })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaveTypeId, institutionId, flowResidency]);

  const roleById = (id: string) => roles?.find((r) => r.id === id);

  const addStep = () => setSteps((prev) => [...prev, { role_id: roles?.[0]?.id ?? '', scope: 'own_department' }]);
  const removeStep = (idx: number) => setSteps((prev) => prev.filter((_, i) => i !== idx));
  const moveStep = (idx: number, dir: -1 | 1) => {
    setSteps((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };
  const updateStep = (idx: number, patch: Partial<DraftStep>) =>
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));

  const handleSave = () => {
    saveFlow.mutate(
      { leaveTypeId, institutionId, flowResidency, steps: steps.filter((s) => s.role_id) },
      { onSuccess: () => onSaved?.() }
    );
  };

  const handleRemoveOverride = () => {
    saveFlow.mutate({ leaveTypeId, institutionId, flowResidency, steps: [] }, { onSuccess: () => onRemoved?.() });
  };

  const preview = steps
    .map((s) => {
      const role = roleById(s.role_id);
      return role ? `${role.role_name} (${STEP_SCOPE_LABELS[s.scope]})` : null;
    })
    .filter(Boolean)
    .join(' → ');

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            {title}
            {isOverride && <Badge variant="outline">Override</Badge>}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {isOverride && canManage && (
          <Button variant="ghost" size="sm" onClick={handleRemoveOverride} disabled={saveFlow.isPending}>
            Remove override
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {steps.length === 0 && <p className="text-sm text-muted-foreground">No approval steps configured yet.</p>}

        {steps.map((step, idx) => {
          const role = roleById(step.role_id);
          const showRoleWarning = !!role && !role.can_open_approvals;
          const showScopeWarning = step.scope === 'hostel_block' && residency === 'day_scholar';
          return (
            <div key={idx} className="rounded-md border p-3 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground w-6">{idx + 1}.</span>
                <Select value={step.role_id} onValueChange={(v) => updateStep(idx, { role_id: v })} disabled={!canManage}>
                  <SelectTrigger className="sm:w-64">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {(roles ?? []).map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.role_name}
                        {r.institution_scope === 'all' ? ' (all institutions)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={step.scope}
                  onValueChange={(v) => updateStep(idx, { scope: v as LearnerLeaveStepScope })}
                  disabled={!canManage}
                >
                  <SelectTrigger className="sm:w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(STEP_SCOPE_LABELS) as [LearnerLeaveStepScope, string][]).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {canManage && (
                  <div className="flex items-center gap-1 sm:ml-auto">
                    <Button type="button" variant="ghost" size="icon" onClick={() => moveStep(idx, -1)} disabled={idx === 0}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => moveStep(idx, 1)}
                      disabled={idx === steps.length - 1}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeStep(idx)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground pl-8">{STEP_SCOPE_HELP[step.scope]}</p>
              {showRoleWarning && (
                <p className="flex items-center gap-1.5 text-xs text-amber-600 pl-8">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  This role cannot open the Approvals page — grant academic.leave_onduty.approve in Role
                  Management.
                </p>
              )}
              {showScopeWarning && (
                <p className="flex items-center gap-1.5 text-xs text-amber-600 pl-8">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  This leave type is Day Scholar only — a hostel block scope will never resolve an approver.
                </p>
              )}
            </div>
          );
        })}

        {canManage && (
          <Button type="button" variant="outline" size="sm" onClick={addStep}>
            <Plus className="h-4 w-4 mr-2" />
            Add step
          </Button>
        )}

        {preview && (
          <p className="text-xs text-muted-foreground border-t pt-2">
            <span className="font-medium">Preview: </span>
            {preview}
          </p>
        )}

        {canManage && (
          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={saveFlow.isPending || steps.some((s) => !s.role_id)}>
              {saveFlow.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
