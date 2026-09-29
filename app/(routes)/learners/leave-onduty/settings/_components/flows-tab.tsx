'use client';

// Approval Flows tab: pick a leave type on the left, edit its group-default
// flow plus per-institution overrides on the right.

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useLearnerLeaveTypes, useLearnerLeaveFlows } from '@/hooks/learners/use-learner-leave-types';
import { RESIDENCY_LABELS } from '@/types/learner-leave-types';
import { FlowStepEditor } from './flow-step-editor';

export function FlowsTab({ canManage }: { canManage: boolean }) {
  const { data: leaveTypes, isLoading: typesLoading } = useLearnerLeaveTypes({});
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const selectedType = leaveTypes?.find((t) => t.id === selectedTypeId) ?? null;

  const { data: flows, isLoading: flowsLoading } = useLearnerLeaveFlows(selectedTypeId);
  const { institutions } = useInstitutionsWithAccess();
  const [addingOverrideFor, setAddingOverrideFor] = useState('');

  const overriddenInstitutionIds = new Set(
    (flows ?? []).filter((f) => f.institution_id).map((f) => f.institution_id as string)
  );
  const availableInstitutions = (institutions ?? []).filter((i) => !overriddenInstitutionIds.has(i.id));

  const defaultFlow = flows?.find((f) => f.institution_id === null) ?? null;
  const overrideFlows = flows?.filter((f) => f.institution_id !== null) ?? [];
  const pendingInstitution = addingOverrideFor
    ? institutions?.find((i) => i.id === addingOverrideFor) ?? null
    : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Leave Types</CardTitle>
          <CardDescription>Pick a type to configure its approval chain.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 max-h-[70vh] overflow-y-auto">
          {typesLoading && <Skeleton className="h-24 w-full" />}
          {(leaveTypes ?? []).map((type) => (
            <button
              key={type.id}
              type="button"
              onClick={() => {
                setSelectedTypeId(type.id);
                setAddingOverrideFor('');
              }}
              className={`w-full text-left rounded-md border px-3 py-2 text-sm transition-colors ${
                selectedTypeId === type.id ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: type.color_code }}
                />
                <span className="font-medium truncate">{type.name}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {type.category === 'onduty' ? 'On-Duty' : 'Leave'}
                </Badge>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {RESIDENCY_LABELS[type.residency]}
                </Badge>
              </div>
            </button>
          ))}
          {!typesLoading && (leaveTypes ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground px-1 py-2">No leave types yet.</p>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        {!selectedType && (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              Select a leave type on the left to view or edit its approval flow.
            </CardContent>
          </Card>
        )}

        {selectedType && flowsLoading && <Skeleton className="h-48 w-full" />}

        {selectedType && !flowsLoading && (
          <>
            <FlowStepEditor
              key={`default-${selectedType.id}`}
              leaveTypeId={selectedType.id}
              institutionId={null}
              title="Group Default"
              description="Applies to every institution without its own override."
              initialSteps={defaultFlow?.steps ?? []}
              residency={selectedType.residency}
              canManage={canManage}
            />

            {overrideFlows.map((flow) => (
              <FlowStepEditor
                key={flow.id}
                leaveTypeId={selectedType.id}
                institutionId={flow.institution_id}
                title={flow.institution?.name ?? 'Institution override'}
                description="Overrides the group default for this institution."
                initialSteps={flow.steps}
                residency={selectedType.residency}
                canManage={canManage}
                isOverride
              />
            ))}

            {pendingInstitution && (
              <FlowStepEditor
                key={`pending-${pendingInstitution.id}`}
                leaveTypeId={selectedType.id}
                institutionId={pendingInstitution.id}
                title={pendingInstitution.name}
                description="New institution override — add steps and save."
                initialSteps={[]}
                residency={selectedType.residency}
                canManage={canManage}
                isOverride
                onSaved={() => setAddingOverrideFor('')}
                onRemoved={() => setAddingOverrideFor('')}
              />
            )}

            {canManage && !pendingInstitution && availableInstitutions.length > 0 && (
              <Select value={addingOverrideFor} onValueChange={setAddingOverrideFor}>
                <SelectTrigger className="w-full sm:w-64">
                  <SelectValue placeholder="Add institution override..." />
                </SelectTrigger>
                <SelectContent>
                  {availableInstitutions.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>
                      {inst.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </>
        )}
      </div>
    </div>
  );
}
