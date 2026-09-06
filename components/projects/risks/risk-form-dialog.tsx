'use client';

/**
 * Risk Form Dialog — create / edit a project risk.
 *
 * Severity has two modes (toggle):
 *   - simple  → H / M / L (severity_simple), RAG derived via ragFromSimple
 *   - matrix  → 5×5 likelihood × impact picker, RAG derived via ragFromMatrix
 * The form always links to the project; optionally links to a task.
 * rag_status is computed client-side on submit (DB column is not generated).
 *
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F3.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { SeverityMatrix } from './severity-matrix';
import { useCreateRisk, useUpdateRisk } from '@/hooks/projects/use-risks';
import { useTasks } from '@/hooks/projects/use-tasks';
import type { ProjectRisk } from '@/types/projects';
import {
  RISK_STATUS_OPTIONS,
  RISK_SEVERITY_SIMPLE_OPTIONS,
  RISK_CATEGORY_OPTIONS,
  ragFromMatrix,
  ragFromSimple,
} from '@/types/projects-risks';
import type {
  RiskSeverityMode,
  RiskSeveritySimple,
  RiskStatusKey,
} from '@/types/projects-risks';

const NONE = '__none__'; // Radix SelectItem may never be empty-string.

interface RiskFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** Provided → edit mode; omitted → create mode. */
  risk?: ProjectRisk | null;
}

/**
 * Outer shell — owns the Dialog. The form body is remounted (via `key`) each
 * time the dialog opens or the edited risk changes, so its initial state comes
 * from useState initializers (no setState-in-effect).
 */
export function RiskFormDialog({
  open,
  onOpenChange,
  projectId,
  risk,
}: RiskFormDialogProps) {
  const isEdit = !!risk;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit risk' : 'Add risk'}</DialogTitle>
          <DialogDescription>
            Capture a potential risk and how severe it is. Severity drives the RAG
            band shown in the register.
          </DialogDescription>
        </DialogHeader>

        {open && (
          <RiskFormBody
            key={risk?.id ?? 'new'}
            projectId={projectId}
            risk={risk ?? null}
            isEdit={isEdit}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RiskFormBody({
  projectId,
  risk,
  isEdit,
  onClose,
}: {
  projectId: string;
  risk: ProjectRisk | null;
  isEdit: boolean;
  onClose: () => void;
}) {
  const isMatrixInitial = risk?.likelihood != null && risk?.impact != null;

  const [title, setTitle] = useState(risk?.title ?? '');
  const [description, setDescription] = useState(risk?.description ?? '');
  const [category, setCategory] = useState<string>(risk?.risk_category ?? NONE);
  const [statusKey, setStatusKey] = useState<RiskStatusKey>(
    risk?.status_key ?? 'identified',
  );
  const [severityMode, setSeverityMode] = useState<RiskSeverityMode>(
    isMatrixInitial ? 'matrix' : 'simple',
  );
  const [severitySimple, setSeveritySimple] = useState<RiskSeveritySimple>(
    (risk?.severity_simple as RiskSeveritySimple) ?? 'medium',
  );
  const [likelihood, setLikelihood] = useState<number | null>(risk?.likelihood ?? 3);
  const [impact, setImpact] = useState<number | null>(risk?.impact ?? 3);
  const [taskId, setTaskId] = useState<string>(risk?.task_id ?? NONE);

  const { data: tasks } = useTasks(projectId);
  const createRisk = useCreateRisk();
  const updateRisk = useUpdateRisk();
  const isSaving = createRisk.isPending || updateRisk.isPending;

  async function handleSubmit() {
    if (!title.trim()) {
      toast.error('A risk title is required.');
      return;
    }

    const isMatrix = severityMode === 'matrix';
    const rag = isMatrix
      ? ragFromMatrix(likelihood ?? 3, impact ?? 3)
      : ragFromSimple(severitySimple);

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      risk_category: category === NONE ? null : category,
      severity_simple: isMatrix ? null : severitySimple,
      likelihood: isMatrix ? likelihood : null,
      impact: isMatrix ? impact : null,
      rag_status: rag,
      status_key: statusKey,
      task_id: taskId === NONE ? null : taskId,
    };

    try {
      if (isEdit && risk) {
        await updateRisk.mutateAsync({ id: risk.id, input: payload });
        toast.success('Risk updated.');
      } else {
        await createRisk.mutateAsync({ project_id: projectId, ...payload });
        toast.success('Risk added.');
      }
      onClose();
    } catch (err) {
      toast.error(
        `Failed to save risk: ${(err as Error)?.message ?? 'unknown error'}`,
      );
    }
  }

  return (
    <>
      <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="risk-title">Title</Label>
            <Input
              id="risk-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Key vendor may miss the delivery window"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="risk-desc">Description</Label>
            <Textarea
              id="risk-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional context — what is the risk and why does it matter?"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Uncategorized" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Uncategorized</SelectItem>
                  {RISK_CATEGORY_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={statusKey}
                onValueChange={(v) => setStatusKey(v as RiskStatusKey)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RISK_STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Severity */}
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <Label>Severity</Label>
              <div className="flex rounded-md border p-0.5">
                <button
                  type="button"
                  onClick={() => setSeverityMode('simple')}
                  className={
                    'rounded px-2.5 py-1 text-xs font-medium transition-colors ' +
                    (severityMode === 'simple'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground')
                  }
                >
                  Simple
                </button>
                <button
                  type="button"
                  onClick={() => setSeverityMode('matrix')}
                  className={
                    'rounded px-2.5 py-1 text-xs font-medium transition-colors ' +
                    (severityMode === 'matrix'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground')
                  }
                >
                  Matrix
                </button>
              </div>
            </div>

            {severityMode === 'simple' ? (
              <Select
                value={severitySimple}
                onValueChange={(v) => setSeveritySimple(v as RiskSeveritySimple)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RISK_SEVERITY_SIMPLE_OPTIONS.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex flex-col items-center gap-2 pt-1">
                <SeverityMatrix
                  likelihood={likelihood}
                  impact={impact}
                  onChange={(l, i) => {
                    setLikelihood(l);
                    setImpact(i);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Selected: likelihood {likelihood} × impact {impact} ={' '}
                  {(likelihood ?? 0) * (impact ?? 0)}
                </p>
              </div>
            )}
          </div>

          {/* Optional task link */}
          <div className="space-y-1.5">
            <Label>Link to task (optional)</Label>
            <Select value={taskId} onValueChange={setTaskId}>
              <SelectTrigger>
                <SelectValue placeholder="No task" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No task</SelectItem>
                {(tasks ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={isSaving}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={isSaving}>
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEdit ? 'Save changes' : 'Add risk'}
        </Button>
      </DialogFooter>
    </>
  );
}
