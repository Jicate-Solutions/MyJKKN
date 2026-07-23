'use client';

// ============================================================================
// Tier Policy Form Dialog — Director-facing add/edit form.
// Created: 2026-05-06. Rewritten 2026-05-07 for plain-English UX.
//
// Field set still mirrors the table CHECK constraints:
//   - scope_type: global | institution
//   - institution_id required iff scope_type=institution
//   - tier_order: 1..4
//   - tier_strategy: one of 4 enum values
//   - on_duty_required: boolean
//   - is_active: boolean
//   - description: optional text
// ...but every label and hint is rewritten for non-technical users.
// ============================================================================

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  TierPolicyService,
  type CounselorTierPolicy,
  type TierScopeType,
  type TierStrategy,
} from '@/lib/services/admission/tier-policy-service';

interface TierPolicyFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policy: CounselorTierPolicy | null;
  institutions: Array<{ id: string; name: string }>;
  onSaved: () => void;
}

interface FormState {
  scope_type: TierScopeType;
  institution_id: string;
  tier_order: string;
  tier_strategy: TierStrategy;
  on_duty_required: boolean;
  is_active: boolean;
  description: string;
}

const EMPTY_FORM: FormState = {
  scope_type: 'global',
  institution_id: '',
  tier_order: '1',
  tier_strategy: 'institution_and_source',
  on_duty_required: true,
  is_active: true,
  description: '',
};

function fromPolicy(policy: CounselorTierPolicy): FormState {
  return {
    scope_type: policy.scope_type,
    institution_id: policy.institution_id ?? '',
    tier_order: String(policy.tier_order),
    tier_strategy: policy.tier_strategy,
    on_duty_required: policy.on_duty_required,
    is_active: policy.is_active,
    description: policy.description ?? '',
  };
}

export function TierPolicyFormDialog({
  open,
  onOpenChange,
  policy,
  institutions,
  onSaved,
}: TierPolicyFormDialogProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const isEdit = !!policy;

  useEffect(() => {
    if (open) {
      setForm(policy ? fromPolicy(policy) : EMPTY_FORM);
    }
  }, [open, policy]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    const tierOrderNum = parseInt(form.tier_order, 10);
    if (!Number.isInteger(tierOrderNum) || tierOrderNum < 1 || tierOrderNum > 4) {
      toast.error('Step number must be between 1 and 4');
      return;
    }

    if (form.scope_type === 'institution' && !form.institution_id) {
      toast.error('Pick a college for this college-specific rule');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        scope_type: form.scope_type,
        institution_id:
          form.scope_type === 'global' ? null : form.institution_id,
        tier_order: tierOrderNum,
        tier_strategy: form.tier_strategy,
        on_duty_required: form.on_duty_required,
        is_active: form.is_active,
        description: form.description.trim() || null,
      };

      if (isEdit && policy) {
        await TierPolicyService.updateTierPolicy(policy.id, payload);
        toast.success('Step updated');
      } else {
        await TierPolicyService.createTierPolicy(payload);
        toast.success('Step added');
      }

      onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save';
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
            {isEdit ? 'Edit Assignment Step' : 'Add Assignment Step'}
          </DialogTitle>
          <DialogDescription>
            Lower-numbered steps are tried first. The first match wins.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="scope_type">Who does this rule apply to?</Label>
              <Select
                value={form.scope_type}
                onValueChange={(v) => update('scope_type', v as TierScopeType)}
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

            <div className="space-y-1.5">
              <Label htmlFor="tier_order">Step number (1 = tried first)</Label>
              <Input
                id="tier_order"
                type="number"
                min={1}
                max={4}
                step={1}
                value={form.tier_order}
                onChange={(e) => update('tier_order', e.target.value)}
              />
            </div>
          </div>

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

          <div className="space-y-1.5">
            <Label htmlFor="tier_strategy">What kind of match should the system try?</Label>
            <Select
              value={form.tier_strategy}
              onValueChange={(v) => update('tier_strategy', v as TierStrategy)}
            >
              <SelectTrigger id="tier_strategy">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TierPolicyService.TIER_STRATEGY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {
                TierPolicyService.TIER_STRATEGY_OPTIONS.find(
                  (o) => o.value === form.tier_strategy,
                )?.hint
              }
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
              <Label htmlFor="on_duty_required" className="cursor-pointer text-sm">
                Only counselors clocked in today?
              </Label>
              <Switch
                id="on_duty_required"
                checked={form.on_duty_required}
                onCheckedChange={(v) => update('on_duty_required', v)}
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
              <Label htmlFor="is_active" className="cursor-pointer text-sm">
                Turn this step on?
              </Label>
              <Switch
                id="is_active"
                checked={form.is_active}
                onCheckedChange={(v) => update('is_active', v)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Notes (optional)</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder="Why does this step exist? Helpful for whoever reviews this later."
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
            {isEdit ? 'Save changes' : 'Add step'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
