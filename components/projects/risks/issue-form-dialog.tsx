'use client';

/**
 * Issue Form Dialog — create / edit a project issue.
 *
 * An issue is an already-materialized problem (simpler than a risk): title,
 * description, severity (H/M/L), status, optional link to a risk it was raised
 * from. No likelihood/impact matrix (issues have already happened).
 *
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F3 (issues as a
 * separate, simpler entity; optionally link to a risk).
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
import { useCreateIssue, useUpdateIssue, useRisks } from '@/hooks/projects/use-risks';
import type { ProjectIssue } from '@/types/projects';
import {
  ISSUE_STATUS_OPTIONS,
  RISK_SEVERITY_SIMPLE_OPTIONS,
} from '@/types/projects-risks';
import type {
  IssueSeverity,
  IssueStatusKey,
} from '@/types/projects-risks';

const NONE = '__none__';

interface IssueFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  issue?: ProjectIssue | null;
}

/**
 * Outer shell — owns the Dialog. The form body is remounted (via `key`) each
 * time the dialog opens or the edited issue changes, so its initial state comes
 * from useState initializers (no setState-in-effect).
 */
export function IssueFormDialog({
  open,
  onOpenChange,
  projectId,
  issue,
}: IssueFormDialogProps) {
  const isEdit = !!issue;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit issue' : 'Add issue'}</DialogTitle>
          <DialogDescription>
            Log a problem that has already happened on this project.
          </DialogDescription>
        </DialogHeader>

        {open && (
          <IssueFormBody
            key={issue?.id ?? 'new'}
            projectId={projectId}
            issue={issue ?? null}
            isEdit={isEdit}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function IssueFormBody({
  projectId,
  issue,
  isEdit,
  onClose,
}: {
  projectId: string;
  issue: ProjectIssue | null;
  isEdit: boolean;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(issue?.title ?? '');
  const [description, setDescription] = useState(issue?.description ?? '');
  const [severity, setSeverity] = useState<IssueSeverity>(
    (issue?.severity as IssueSeverity) ?? 'medium',
  );
  const [statusKey, setStatusKey] = useState<IssueStatusKey>(
    issue?.status_key ?? 'open',
  );
  const [riskId, setRiskId] = useState<string>(issue?.raised_from_risk_id ?? NONE);

  const { data: risks } = useRisks(projectId);
  const createIssue = useCreateIssue();
  const updateIssue = useUpdateIssue();
  const isSaving = createIssue.isPending || updateIssue.isPending;

  async function handleSubmit() {
    if (!title.trim()) {
      toast.error('An issue title is required.');
      return;
    }

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      severity,
      status_key: statusKey,
      raised_from_risk_id: riskId === NONE ? null : riskId,
    };

    try {
      if (isEdit && issue) {
        await updateIssue.mutateAsync({ id: issue.id, input: payload });
        toast.success('Issue updated.');
      } else {
        await createIssue.mutateAsync({ project_id: projectId, ...payload });
        toast.success('Issue added.');
      }
      onClose();
    } catch (err) {
      toast.error(
        `Failed to save issue: ${(err as Error)?.message ?? 'unknown error'}`,
      );
    }
  }

  return (
    <>
      <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="issue-title">Title</Label>
            <Input
              id="issue-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Test environment is down"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="issue-desc">Description</Label>
            <Textarea
              id="issue-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional detail."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Severity</Label>
              <Select
                value={severity}
                onValueChange={(v) => setSeverity(v as IssueSeverity)}
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
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={statusKey}
                onValueChange={(v) => setStatusKey(v as IssueStatusKey)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ISSUE_STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Raised from risk (optional)</Label>
            <Select value={riskId} onValueChange={setRiskId}>
              <SelectTrigger>
                <SelectValue placeholder="Not from a risk" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not from a risk</SelectItem>
                {(risks ?? []).map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.title}
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
          {isEdit ? 'Save changes' : 'Add issue'}
        </Button>
      </DialogFooter>
    </>
  );
}
