'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, ArrowUp, ArrowDown, Save } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

import type { ApprovalWorkflowStep } from '@/types/hr-forms';

type NotifyChannel = 'whatsapp' | 'email' | 'in_app' | 'sms';

const CHANNEL_OPTIONS: Array<{ value: NotifyChannel; label: string }> = [
  { value: 'in_app', label: 'In-app' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email (stub)' },
  { value: 'sms', label: 'SMS (stub)' },
];

interface RoleRow {
  id: string;
  role_key: string;
  role_name: string;
}

interface WorkflowEditorProps {
  formId: string;
  initialSteps: ApprovalWorkflowStep[];
  availableRoles: RoleRow[];
}

export function WorkflowEditor({
  formId,
  initialSteps,
  availableRoles,
}: WorkflowEditorProps) {
  const [steps, setSteps] = useState<ApprovalWorkflowStep[]>(() =>
    sortAndReorder(initialSteps),
  );
  const [reason, setReason] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  function addStep() {
    setSteps((prev) =>
      sortAndReorder([
        ...prev,
        {
          order: prev.length + 1,
          label: `Step ${prev.length + 1}`,
          required_role: availableRoles[0]?.role_key ?? '',
          notify_channels: ['in_app', 'whatsapp'],
        },
      ]),
    );
  }

  function removeStep(idx: number) {
    setSteps((prev) =>
      sortAndReorder(prev.filter((_, i) => i !== idx)),
    );
  }

  function moveStep(idx: number, direction: -1 | 1) {
    setSteps((prev) => {
      const next = [...prev];
      const target = idx + direction;
      if (target < 0 || target >= next.length) return next;
      [next[idx], next[target]] = [next[target], next[idx]];
      return sortAndReorder(next);
    });
  }

  function updateStep<K extends keyof ApprovalWorkflowStep>(
    idx: number,
    key: K,
    value: ApprovalWorkflowStep[K],
  ) {
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, [key]: value } : s)));
  }

  function toggleChannel(idx: number, channel: NotifyChannel) {
    setSteps((prev) =>
      prev.map((s, i) => {
        if (i !== idx) return s;
        const existing = s.notify_channels ?? [];
        const next = existing.includes(channel)
          ? existing.filter((c) => c !== channel)
          : [...existing, channel];
        return { ...s, notify_channels: next };
      }),
    );
  }

  async function handleSave() {
    if (!reason.trim()) {
      toast({
        title: 'Reason required',
        description: 'Add a one-line reason for the audit trail.',
        variant: 'destructive',
      });
      return;
    }

    // Light validation client-side; API also revalidates.
    for (const step of steps) {
      if (!step.label.trim() || !step.required_role.trim()) {
        toast({
          title: 'Step incomplete',
          description: 'Every step needs a label and a required role.',
          variant: 'destructive',
        });
        return;
      }
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/hr/forms/${formId}/workflow`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ steps, reason }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        toast({
          title: 'Workflow saved as draft',
          description:
            'Publish the form from /hr/admin/forms to promote the draft.',
        });
        router.refresh();
      } catch (err) {
        toast({
          title: 'Save failed',
          description: err instanceof Error ? err.message : String(err),
          variant: 'destructive',
        });
      }
    });
  }

  return (
    <div className="space-y-4" data-test="workflow-editor">
      <Card>
        <CardHeader>
          <CardTitle>Approval steps ({steps.length})</CardTitle>
          <CardDescription>
            Each row is one approval step. Reorder with the arrow buttons;
            remove with the trash icon. Notification channels fan out when
            the step becomes active.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {steps.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No steps yet. Add one to start building the workflow.
            </p>
          ) : (
            steps.map((step, idx) => (
              <Card
                key={`step-${idx}`}
                className="border-l-4 border-l-primary/40"
                data-test={`workflow-step-${idx + 1}`}
              >
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Step {idx + 1}</Badge>
                      <span className="text-xs text-muted-foreground">
                        order = {step.order}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => moveStep(idx, -1)}
                        disabled={idx === 0}
                        aria-label="Move up"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => moveStep(idx, 1)}
                        disabled={idx === steps.length - 1}
                        aria-label="Move down"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeStep(idx)}
                        aria-label="Remove step"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor={`step-label-${idx}`}>Step label</Label>
                      <Input
                        id={`step-label-${idx}`}
                        value={step.label}
                        onChange={(e) =>
                          updateStep(idx, 'label', e.target.value)
                        }
                        placeholder="HOD approval"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`step-role-${idx}`}>Required role</Label>
                      <Select
                        value={step.required_role}
                        onValueChange={(v) =>
                          updateStep(idx, 'required_role', v)
                        }
                      >
                        <SelectTrigger id={`step-role-${idx}`}>
                          <SelectValue placeholder="Pick a role" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableRoles.map((r) => (
                            <SelectItem key={r.id} value={r.role_key}>
                              {r.role_name}{' '}
                              <span className="text-xs text-muted-foreground">
                                ({r.role_key})
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Notification channels</Label>
                    <div className="flex flex-wrap gap-3">
                      {CHANNEL_OPTIONS.map((ch) => {
                        const checked =
                          step.notify_channels?.includes(ch.value) ?? false;
                        return (
                          <label
                            key={ch.value}
                            className="flex items-center gap-2 text-sm cursor-pointer"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() =>
                                toggleChannel(idx, ch.value)
                              }
                            />
                            {ch.label}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox
                      checked={step.auto_advance ?? false}
                      onCheckedChange={(v) =>
                        updateStep(idx, 'auto_advance', v === true)
                      }
                    />
                    Auto-advance when prior step approves (no manual click)
                  </div>
                </CardContent>
              </Card>
            ))
          )}

          <Button type="button" variant="outline" onClick={addStep}>
            <Plus className="h-4 w-4 mr-2" />
            Add step
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Save as draft</CardTitle>
          <CardDescription>
            Draft workflows are stored separately from the live workflow.
            Publish the form from the index page to promote.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="save-reason">Audit reason (required)</Label>
            <Input
              id="save-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Adding HOD step for excursion approvals"
            />
          </div>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            data-test="save-workflow"
          >
            <Save className="h-4 w-4 mr-2" />
            {isPending ? 'Saving…' : 'Save draft'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sortAndReorder(
  arr: ApprovalWorkflowStep[],
): ApprovalWorkflowStep[] {
  return arr
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((s, i) => ({ ...s, order: i + 1 }));
}
