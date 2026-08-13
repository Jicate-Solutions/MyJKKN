'use client';

/**
 * Mitigation Step List — structured mitigation steps for one risk.
 *
 * Each step: description + owner + deadline + complete toggle. "Create task"
 * spins the step into a linked project task (TaskService) and back-links it;
 * once linked, the button shows "Task created".
 *
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F3 (structured
 * mitigation steps that auto-create linked tasks).
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { TAP_TARGET_ICON } from '@/app/(routes)/projects/_lib/tap-targets';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  CheckSquare,
  ListPlus,
  Loader2,
  Trash2,
  Link2,
} from 'lucide-react';
import {
  useMitigationSteps,
  useAddMitigationStep,
  useUpdateMitigationStep,
  useDeleteMitigationStep,
  useCreateTaskFromStep,
} from '@/hooks/projects/use-risks';
import type { ProjectRiskMitigationStep } from '@/types/projects';

interface MitigationStepListProps {
  riskId: string;
  projectId: string;
}

export function MitigationStepList({ riskId, projectId }: MitigationStepListProps) {
  const { data: steps, isLoading } = useMitigationSteps(riskId);
  const addStep = useAddMitigationStep();
  const [newDesc, setNewDesc] = useState('');

  async function handleAdd() {
    if (!newDesc.trim()) return;
    try {
      await addStep.mutateAsync({
        risk_id: riskId,
        description: newDesc.trim(),
        order_index: steps?.length ?? 0,
      });
      setNewDesc('');
    } catch (err) {
      toast.error(`Failed to add step: ${(err as Error)?.message ?? 'error'}`);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input
          value={newDesc}
          onChange={(e) => setNewDesc(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="Add a mitigation step…"
          className="h-8"
        />
        <Button
          size="sm"
          variant="secondary"
          onClick={handleAdd}
          disabled={addStep.isPending || !newDesc.trim()}
        >
          {addStep.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ListPlus className="h-4 w-4" />
          )}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading steps…</p>
      ) : (steps?.length ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground">
          No mitigation steps yet. Add the first action above.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {steps!.map((step) => (
            <MitigationStepRow
              key={step.id}
              step={step}
              riskId={riskId}
              projectId={projectId}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function MitigationStepRow({
  step,
  riskId,
  projectId,
}: {
  step: ProjectRiskMitigationStep;
  riskId: string;
  projectId: string;
}) {
  const updateStep = useUpdateMitigationStep();
  const deleteStep = useDeleteMitigationStep(riskId);
  const createTask = useCreateTaskFromStep(projectId);

  async function toggleComplete(checked: boolean) {
    try {
      await updateStep.mutateAsync({ id: step.id, input: { is_complete: checked } });
    } catch (err) {
      toast.error(`Failed: ${(err as Error)?.message ?? 'error'}`);
    }
  }

  async function handleCreateTask() {
    try {
      await createTask.mutateAsync(step);
      toast.success('Task created from mitigation step.');
    } catch (err) {
      toast.error(
        `Failed to create task: ${(err as Error)?.message ?? 'error'}`,
      );
    }
  }

  async function handleDelete() {
    try {
      await deleteStep.mutateAsync(step.id);
    } catch (err) {
      toast.error(`Failed to delete: ${(err as Error)?.message ?? 'error'}`);
    }
  }

  return (
    <li className="flex items-center gap-2 rounded-md border px-2.5 py-1.5">
      <Checkbox
        checked={step.is_complete}
        onCheckedChange={(c) => toggleComplete(c === true)}
        aria-label="Mark mitigation step complete"
      />
      <span
        className={
          'flex-1 text-sm ' +
          (step.is_complete ? 'text-muted-foreground line-through' : '')
        }
      >
        {step.description}
      </span>

      {step.deadline && (
        <span className="text-xs text-muted-foreground">{step.deadline}</span>
      )}

      {step.linked_task_id ? (
        <span className="flex items-center gap-1 text-xs text-green-700">
          <Link2 className="h-3.5 w-3.5" />
          Task created
        </span>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2 text-xs"
          onClick={handleCreateTask}
          disabled={createTask.isPending}
        >
          {createTask.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckSquare className="h-3.5 w-3.5" />
          )}
          Create task
        </Button>
      )}

      <Button
        size="sm"
        variant="ghost"
        className={`h-7 w-7 p-0 text-muted-foreground hover:text-destructive ${TAP_TARGET_ICON}`}
        onClick={handleDelete}
        disabled={deleteStep.isPending}
        aria-label="Delete mitigation step"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </li>
  );
}
