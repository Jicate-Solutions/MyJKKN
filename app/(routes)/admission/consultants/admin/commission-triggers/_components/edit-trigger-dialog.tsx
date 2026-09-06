'use client';

// ============================================================================
// Edit Trigger Dialog — add/edit a row in consultant_commission_trigger_config.
// Created: 2026-05-13.
//
// Form field set mirrors the table CHECK constraints:
//   - trigger_key (unique across the table; immutable on edit to avoid breaking
//     consumers that look up by key)
//   - display_label
//   - source_entity: admission_lead | learners_profile | manual
//   - source_status_from: optional (blank = "any prior status")
//   - source_status_to: required
//   - creates_commission: master switch (also surfaced on the row card)
//   - auto_approve_below_amount: numeric or blank (blank = always require manual approval)
//   - tds_rate_percent: 0..100
//   - clawback_grace_days: integer ≥ 0
//   - is_active
//   - notes (optional)
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
  upsertTriggerConfig,
  type CommissionTriggerSourceEntity,
  type ConsultantCommissionTriggerRow,
} from '@/lib/services/admission/consultant-commission-trigger-service';

interface EditTriggerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: ConsultantCommissionTriggerRow | null;
  onSaved: () => void;
}

interface FormState {
  trigger_key: string;
  display_label: string;
  source_entity: CommissionTriggerSourceEntity;
  source_status_from: string;
  source_status_to: string;
  creates_commission: boolean;
  auto_approve_below_amount: string; // blank means "no threshold"
  tds_rate_percent: string;
  clawback_grace_days: string;
  is_active: boolean;
  notes: string;
}

const EMPTY_FORM: FormState = {
  trigger_key: '',
  display_label: '',
  source_entity: 'admission_lead',
  source_status_from: '',
  source_status_to: '',
  creates_commission: false,
  auto_approve_below_amount: '',
  tds_rate_percent: '0',
  clawback_grace_days: '30',
  is_active: true,
  notes: '',
};

function fromRow(row: ConsultantCommissionTriggerRow): FormState {
  return {
    trigger_key: row.trigger_key,
    display_label: row.display_label,
    source_entity: row.source_entity,
    source_status_from: row.source_status_from ?? '',
    source_status_to: row.source_status_to,
    creates_commission: row.creates_commission,
    auto_approve_below_amount:
      row.auto_approve_below_amount === null
        ? ''
        : String(row.auto_approve_below_amount),
    tds_rate_percent: String(row.tds_rate_percent),
    clawback_grace_days: String(row.clawback_grace_days),
    is_active: row.is_active,
    notes: row.notes ?? '',
  };
}

export function EditTriggerDialog({
  open,
  onOpenChange,
  row,
  onSaved,
}: EditTriggerDialogProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const isEdit = !!row;

  useEffect(() => {
    if (open) {
      setForm(row ? fromRow(row) : EMPTY_FORM);
    }
  }, [open, row]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    // Field validation
    const trimmedKey = form.trigger_key.trim();
    if (!trimmedKey) {
      toast.error('Trigger key is required');
      return;
    }
    if (!form.display_label.trim()) {
      toast.error('Display label is required');
      return;
    }
    if (!form.source_status_to.trim()) {
      toast.error('Source status (to) is required');
      return;
    }

    const tdsNum = parseFloat(form.tds_rate_percent);
    if (!Number.isFinite(tdsNum) || tdsNum < 0 || tdsNum > 100) {
      toast.error('TDS rate must be between 0 and 100');
      return;
    }

    const graceNum = parseInt(form.clawback_grace_days, 10);
    if (!Number.isInteger(graceNum) || graceNum < 0) {
      toast.error('Clawback grace days must be a non-negative integer');
      return;
    }

    let autoApprove: number | null = null;
    if (form.auto_approve_below_amount.trim() !== '') {
      const n = parseFloat(form.auto_approve_below_amount);
      if (!Number.isFinite(n) || n < 0) {
        toast.error('Auto-approve threshold must be a non-negative number');
        return;
      }
      autoApprove = n;
    }

    setSaving(true);
    try {
      await upsertTriggerConfig({
        id: row?.id,
        trigger_key: trimmedKey,
        display_label: form.display_label.trim(),
        source_entity: form.source_entity,
        source_status_from:
          form.source_status_from.trim() === ''
            ? null
            : form.source_status_from.trim(),
        source_status_to: form.source_status_to.trim(),
        creates_commission: form.creates_commission,
        auto_approve_below_amount: autoApprove,
        tds_rate_percent: tdsNum,
        clawback_grace_days: graceNum,
        is_active: form.is_active,
        notes: form.notes.trim() || null,
      });

      toast.success(isEdit ? 'Trigger updated' : 'Trigger added');
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
            {isEdit ? 'Edit Commission Trigger' : 'Add Commission Trigger'}
          </DialogTitle>
          <DialogDescription>
            Defines when a consultant commission row gets created
            automatically, at what TDS rate and clawback window.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="trigger_key">Trigger key</Label>
              <Input
                id="trigger_key"
                value={form.trigger_key}
                onChange={(e) => update('trigger_key', e.target.value)}
                placeholder="e.g. lead_admitted"
                disabled={isEdit}
              />
              <p className="text-xs text-muted-foreground">
                {isEdit
                  ? 'Cannot change — engine code looks up by this key.'
                  : 'Stable identifier engine code uses to find this row.'}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="display_label">Display label</Label>
              <Input
                id="display_label"
                value={form.display_label}
                onChange={(e) => update('display_label', e.target.value)}
                placeholder="e.g. Lead → Admitted"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="source_entity">Which entity does this watch?</Label>
            <Select
              value={form.source_entity}
              onValueChange={(v) =>
                update('source_entity', v as CommissionTriggerSourceEntity)
              }
            >
              <SelectTrigger id="source_entity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admission_lead">
                  Admission lead (admission_leads table)
                </SelectItem>
                <SelectItem value="learners_profile">
                  Learner profile (learners_profiles table)
                </SelectItem>
                <SelectItem value="manual">
                  Manual entry (no auto-fire)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="source_status_from">
                From status (blank = any)
              </Label>
              <Input
                id="source_status_from"
                value={form.source_status_from}
                onChange={(e) =>
                  update('source_status_from', e.target.value)
                }
                placeholder="e.g. admitted"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="source_status_to">To status</Label>
              <Input
                id="source_status_to"
                value={form.source_status_to}
                onChange={(e) => update('source_status_to', e.target.value)}
                placeholder="e.g. enrolled"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="tds_rate_percent">TDS %</Label>
              <Input
                id="tds_rate_percent"
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={form.tds_rate_percent}
                onChange={(e) => update('tds_rate_percent', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="auto_approve_below_amount">
                Auto-approve below ₹
              </Label>
              <Input
                id="auto_approve_below_amount"
                type="number"
                min={0}
                step="0.01"
                value={form.auto_approve_below_amount}
                onChange={(e) =>
                  update('auto_approve_below_amount', e.target.value)
                }
                placeholder="blank = always manual"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clawback_grace_days">Clawback grace (days)</Label>
              <Input
                id="clawback_grace_days"
                type="number"
                min={0}
                step={1}
                value={form.clawback_grace_days}
                onChange={(e) =>
                  update('clawback_grace_days', e.target.value)
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
              <Label
                htmlFor="creates_commission"
                className="cursor-pointer text-sm"
              >
                Auto-create commission rows?
              </Label>
              <Switch
                id="creates_commission"
                checked={form.creates_commission}
                onCheckedChange={(v) => update('creates_commission', v)}
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
              <Label htmlFor="is_active" className="cursor-pointer text-sm">
                Enabled?
              </Label>
              <Switch
                id="is_active"
                checked={form.is_active}
                onCheckedChange={(v) => update('is_active', v)}
              />
            </div>
          </div>

          {form.creates_commission && form.source_entity !== 'manual' && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Warning: turning this on will cause MyJKKN to create a
              consultant commission row in production every time the matching
              status transition happens.
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              placeholder="Why does this rule exist? Useful for the next reviewer."
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
            {isEdit ? 'Save changes' : 'Add trigger'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
