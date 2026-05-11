'use client';

// ============================================================================
// Lead Stages Form Dialog — Director-facing add/edit form.
// Created: 2026-05-07. Plain-English UX (Director bar: PR #748).
//
// Field set mirrors the table CHECK constraints:
//   - scope_type: global | institution
//   - institution_id required iff scope_type=institution
//   - funnel_stage: known enum slug or custom text
//   - is_terminal: boolean — does this stage count toward workload?
//   - description: optional text
//
// Every label and hint is written for non-technical users.
// The ConsequencesCascade panel shows real-time impact when is_terminal toggles.
// ============================================================================

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  LeadStagePolicyService,
  type LeadActiveStagePolicy,
  type LeadStageScopeType,
  type StageLeadCount,
} from '@/lib/services/admission/lead-stage-policy-service';

import { ConsequencesCascade } from './consequences-cascade';

interface LeadStagesFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policy: LeadActiveStagePolicy | null;
  institutions: Array<{ id: string; name: string }>;
  stageCounts: StageLeadCount[];
  countsLoading: boolean;
  onSaved: () => void;
}

interface FormState {
  scope_type: LeadStageScopeType;
  institution_id: string;
  funnel_stage: string;
  is_terminal: boolean;
  description: string;
}

const EMPTY_FORM: FormState = {
  scope_type: 'global',
  institution_id: '',
  funnel_stage: '',
  is_terminal: false,
  description: '',
};

function fromPolicy(policy: LeadActiveStagePolicy): FormState {
  return {
    scope_type: policy.scope_type,
    institution_id: policy.institution_id ?? '',
    funnel_stage: policy.funnel_stage,
    is_terminal: policy.is_terminal,
    description: policy.description ?? '',
  };
}

export function LeadStagesFormDialog({
  open,
  onOpenChange,
  policy,
  institutions,
  stageCounts,
  countsLoading,
  onSaved,
}: LeadStagesFormDialogProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const isEdit = !!policy;

  // Track the original is_terminal to power the ConsequencesCascade
  const originalIsTerminal = policy?.is_terminal ?? false;

  useEffect(() => {
    if (open) {
      setForm(policy ? fromPolicy(policy) : EMPTY_FORM);
    }
  }, [open, policy]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // Live lead count for this stage
  const leadsInStage =
    stageCounts.find((c) => c.funnel_stage === form.funnel_stage)?.count ?? 0;

  const handleSave = async () => {
    if (!form.funnel_stage) {
      toast.error('Please choose a funnel stage.');
      return;
    }

    if (form.scope_type === 'institution' && !form.institution_id) {
      toast.error('Please pick a college for this college-specific rule.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        scope_type: form.scope_type,
        institution_id:
          form.scope_type === 'global' ? null : form.institution_id,
        funnel_stage: form.funnel_stage,
        is_terminal: form.is_terminal,
        description: form.description.trim() || null,
      };

      if (isEdit && policy) {
        await LeadStagePolicyService.updateStagePolicy(policy.id, payload);
        toast.success('Stage policy updated.');
      } else {
        await LeadStagePolicyService.createStagePolicy(payload);
        toast.success('Stage policy added.');
      }

      onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't save this policy.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Edit Stage Policy' : 'Add Stage Policy'}
          </DialogTitle>
          <DialogDescription>
            Decide whether leads in this stage count toward a counselor&apos;s
            active-leads cap. Stages marked as &ldquo;terminal&rdquo; do not
            count — counselors free up capacity when a lead reaches that stage.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Scope */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="scope_type">Who does this rule apply to?</Label>
              <Select
                value={form.scope_type}
                onValueChange={(v) => update('scope_type', v as LeadStageScopeType)}
              >
                <SelectTrigger id="scope_type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">All colleges (default)</SelectItem>
                  <SelectItem value="institution">Just one college (override)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* College picker — shown only for institution scope */}
            {form.scope_type === 'institution' && (
              <div className="space-y-1.5">
                <Label htmlFor="institution_id">Which college?</Label>
                <Select
                  value={form.institution_id}
                  onValueChange={(v) => update('institution_id', v)}
                >
                  <SelectTrigger id="institution_id">
                    <SelectValue placeholder="Pick a college…" />
                  </SelectTrigger>
                  <SelectContent>
                    {institutions.map((inst) => (
                      <SelectItem key={inst.id} value={inst.id}>
                        {inst.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Stage picker */}
          <div className="space-y-1.5">
            <Label htmlFor="funnel_stage">Which stage in the admission process?</Label>
            <Select
              value={form.funnel_stage}
              onValueChange={(v) => update('funnel_stage', v)}
            >
              <SelectTrigger id="funnel_stage">
                <SelectValue placeholder="Choose a stage…" />
              </SelectTrigger>
              <SelectContent>
                {LeadStagePolicyService.KNOWN_FUNNEL_STAGES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Can&apos;t find the stage? Contact your technical team to add it to the list.
            </p>
          </div>

          {/* Terminal toggle */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-3">
              <div>
                <Label htmlFor="is_terminal" className="cursor-pointer text-sm font-medium">
                  Mark this stage as &ldquo;done&rdquo; (terminal)?
                </Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {form.is_terminal
                    ? 'Yes — leads here do NOT count toward counselor workload.'
                    : 'No — leads here ARE counted toward counselor workload.'}
                </p>
              </div>
              <Switch
                id="is_terminal"
                checked={form.is_terminal}
                onCheckedChange={(v) => update('is_terminal', v)}
              />
            </div>

            {/* Consequences cascade — shown when toggle changes from original */}
            {isEdit && form.funnel_stage && (
              <ConsequencesCascade
                stageName={form.funnel_stage}
                currentIsTerminal={originalIsTerminal}
                pendingIsTerminal={form.is_terminal}
                leadsInStage={leadsInStage}
                countsLoading={countsLoading}
              />
            )}

            {/* For new policies, always show the current state explanation */}
            {!isEdit && form.funnel_stage && (
              <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                {LeadStagePolicyService.explainTerminalToggle(
                  form.is_terminal,
                  leadsInStage,
                )}
              </p>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="description">Notes (optional)</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder="Why does this rule exist? Helpful for whoever reviews this later."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? 'Save changes' : 'Add policy'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
