'use client';

/**
 * WorkflowFormDialog — create / edit a project_approval_workflow.
 *
 * Fields: name, trigger_action, project_type_id (optional), is_active toggle,
 * and an inline ChainEditor for the approval_chain.
 *
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F9.
 */

import { useState, useEffect } from 'react';
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
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { ChainEditor } from './chain-editor';
import { useCreateWorkflow, useUpdateWorkflow } from '@/hooks/projects/use-approvals';
import type { ProjectApprovalWorkflow } from '@/types/projects';
import type { ApprovalStep } from './types';

interface WorkflowFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, the dialog is in edit mode. */
  workflow?: ProjectApprovalWorkflow | null;
}

interface FormState {
  name: string;
  trigger_action: string;
  is_active: boolean;
  approval_chain: ApprovalStep[];
}

function emptyForm(): FormState {
  return {
    name: '',
    trigger_action: '',
    is_active: true,
    approval_chain: [],
  };
}

function fromWorkflow(w: ProjectApprovalWorkflow): FormState {
  const chain = Array.isArray(w.approval_chain)
    ? (w.approval_chain as unknown as ApprovalStep[])
    : [];
  return {
    name: w.name,
    trigger_action: w.trigger_action,
    is_active: w.is_active,
    approval_chain: chain,
  };
}

export function WorkflowFormDialog({
  open,
  onOpenChange,
  workflow,
}: WorkflowFormDialogProps) {
  const isEdit = !!workflow;
  const createWorkflow = useCreateWorkflow();
  const updateWorkflow = useUpdateWorkflow();

  const [form, setForm] = useState<FormState>(emptyForm);

  // Sync form state when the dialog opens or workflow prop changes
  useEffect(() => {
    if (open) {
      setForm(workflow ? fromWorkflow(workflow) : emptyForm());
    }
  }, [open, workflow]);

  const isBusy = createWorkflow.isPending || updateWorkflow.isPending;

  function setField<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const name = form.name.trim();
    const trigger_action = form.trigger_action.trim();

    if (!name) {
      toast.error('Workflow name is required.');
      return;
    }
    if (!trigger_action) {
      toast.error('Trigger action is required.');
      return;
    }
    if (form.approval_chain.length === 0) {
      toast.error('At least one approval step is required.');
      return;
    }

    try {
      if (isEdit && workflow) {
        await updateWorkflow.mutateAsync({
          id: workflow.id,
          input: {
            name,
            trigger_action,
            is_active: form.is_active,
            approval_chain: form.approval_chain,
          },
        });
        toast.success('Workflow updated.');
      } else {
        await createWorkflow.mutateAsync({
          name,
          trigger_action,
          is_active: form.is_active,
          approval_chain: form.approval_chain,
        });
        toast.success('Workflow created.');
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save workflow.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit workflow' : 'New approval workflow'}</DialogTitle>
          <DialogDescription>
            Define the trigger and the ordered list of approver roles for this workflow.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wf-name">Name *</Label>
              <Input
                id="wf-name"
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
                placeholder="Budget approval"
                disabled={isBusy}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wf-trigger">Trigger action *</Label>
              <Input
                id="wf-trigger"
                value={form.trigger_action}
                onChange={(e) => setField('trigger_action', e.target.value)}
                placeholder="budget_request"
                className="font-mono text-sm"
                disabled={isBusy}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="wf-active"
              checked={form.is_active}
              onCheckedChange={(v) => setField('is_active', v)}
              disabled={isBusy}
            />
            <Label htmlFor="wf-active" className="cursor-pointer">
              Active (visible for new requests)
            </Label>
          </div>

          <div className="space-y-2">
            <Label>Approval chain *</Label>
            <p className="text-xs text-muted-foreground">
              Steps are executed in order — top to bottom.
            </p>
            <ChainEditor
              value={form.approval_chain}
              onChange={(chain) => setField('approval_chain', chain)}
              disabled={isBusy}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isBusy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isBusy}>
              {isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? 'Save changes' : 'Create workflow'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
