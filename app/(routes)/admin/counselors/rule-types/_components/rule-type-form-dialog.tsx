'use client';

// ============================================================================
// Rule Type Form Dialog — create/edit a row in assignment_rule_type_registry.
// Created: 2026-05-07.
// Field set mirrors the table schema:
//   - rule_type_key   (snake_case, 2-64 chars; read-only on edit for is_system)
//   - display_label   (required)
//   - description     (optional)
//   - icon_name       (lucide icon name; optional)
//   - sort_order      (integer)
//   - is_active       (boolean)
// is_system is NEVER user-editable — it's set on seed and stays true forever.
// ============================================================================

import { useEffect, useState } from 'react';
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
import { useRuleTypeMutations } from '@/hooks/admission';
import type { AssignmentRuleTypeRow } from '@/lib/services/admission/rule-type-registry-service';

interface RuleTypeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ruleType: AssignmentRuleTypeRow | null;
  onSaved: () => void;
}

interface FormState {
  rule_type_key: string;
  display_label: string;
  description: string;
  icon_name: string;
  sort_order: string;
  is_active: boolean;
}

const EMPTY_FORM: FormState = {
  rule_type_key: '',
  display_label: '',
  description: '',
  icon_name: '',
  sort_order: '0',
  is_active: true,
};

function fromRow(row: AssignmentRuleTypeRow): FormState {
  return {
    rule_type_key: row.rule_type_key,
    display_label: row.display_label,
    description: row.description ?? '',
    icon_name: row.icon_name ?? '',
    sort_order: String(row.sort_order),
    is_active: row.is_active,
  };
}

const KEY_PATTERN = /^[a-z][a-z0-9_]{1,63}$/;

export function RuleTypeFormDialog({
  open,
  onOpenChange,
  ruleType,
  onSaved,
}: RuleTypeFormDialogProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [keyError, setKeyError] = useState<string | null>(null);
  const { createRuleType, updateRuleType, isCreating, isUpdating } =
    useRuleTypeMutations();

  const isEdit = !!ruleType;
  const isSystem = !!ruleType?.is_system;
  const isBusy = isCreating || isUpdating;

  useEffect(() => {
    if (open) {
      setForm(ruleType ? fromRow(ruleType) : EMPTY_FORM);
      setKeyError(null);
    }
  }, [open, ruleType]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    setKeyError(null);

    // Validate sort_order
    const sortOrderNum = parseInt(form.sort_order, 10);
    if (!Number.isInteger(sortOrderNum)) {
      setKeyError('Sort order must be a whole number');
      return;
    }

    // Validate key shape (only when creating or when editing a non-system row)
    if (!isEdit || !isSystem) {
      if (!KEY_PATTERN.test(form.rule_type_key)) {
        setKeyError(
          'Key must be snake_case: start with a lowercase letter, 2-64 chars, only a-z 0-9 _',
        );
        return;
      }
    }

    if (!form.display_label.trim()) {
      setKeyError('Display label is required');
      return;
    }

    const basePayload = {
      display_label: form.display_label.trim(),
      description: form.description.trim() || null,
      icon_name: form.icon_name.trim() || null,
      sort_order: sortOrderNum,
      is_active: form.is_active,
    };

    if (isEdit && ruleType) {
      // Don't allow rule_type_key changes for system rows (would break virtual `type` resolution)
      const updatePayload = isSystem
        ? basePayload
        : { ...basePayload, rule_type_key: form.rule_type_key };

      updateRuleType.mutate(
        { id: ruleType.id, input: updatePayload },
        { onSuccess: () => onSaved() },
      );
    } else {
      createRuleType.mutate(
        { ...basePayload, rule_type_key: form.rule_type_key },
        { onSuccess: () => onSaved() },
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Edit Rule Type' : 'New Rule Type'}
            {isSystem && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                (system row — key is locked)
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Drives the rule-type dropdown shown to counselors when they create
            assignment rules.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="rule_type_key">
              Key <span className="text-xs text-muted-foreground">(snake_case)</span>
            </Label>
            <Input
              id="rule_type_key"
              value={form.rule_type_key}
              onChange={(e) => update('rule_type_key', e.target.value)}
              placeholder="e.g. weighted_random"
              disabled={isBusy || isSystem}
              className="font-mono text-sm"
            />
            {isSystem && (
              <p className="text-xs text-muted-foreground">
                System rows cannot be re-keyed. Changing the key would orphan
                existing assignment rules whose virtual <code>type</code> resolves
                to this string.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="display_label">Display Label *</Label>
            <Input
              id="display_label"
              value={form.display_label}
              onChange={(e) => update('display_label', e.target.value)}
              placeholder="e.g. Weighted Random"
              disabled={isBusy}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder="What does this strategy do? Helps the counselor pick the right one."
              rows={2}
              disabled={isBusy}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="icon_name">
                Icon Name{' '}
                <span className="text-xs text-muted-foreground">(lucide-react)</span>
              </Label>
              <Input
                id="icon_name"
                value={form.icon_name}
                onChange={(e) => update('icon_name', e.target.value)}
                placeholder="e.g. Shuffle"
                disabled={isBusy}
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sort_order">Sort Order</Label>
              <Input
                id="sort_order"
                type="number"
                step={1}
                value={form.sort_order}
                onChange={(e) => update('sort_order', e.target.value)}
                disabled={isBusy}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <Label htmlFor="is_active" className="cursor-pointer">
              Active
            </Label>
            <Switch
              id="is_active"
              checked={form.is_active}
              onCheckedChange={(v) => update('is_active', v)}
              disabled={isBusy}
            />
          </div>

          {keyError && <p className="text-sm text-destructive">{keyError}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isBusy}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isBusy}>
            {isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? 'Save changes' : 'Create rule type'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
