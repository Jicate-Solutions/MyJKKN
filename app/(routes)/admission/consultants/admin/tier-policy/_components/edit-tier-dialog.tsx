'use client';

// ============================================================================
// Edit Tier Dialog — create/update a consultant_tier_policy row.
// Created: 2026-05-13.
//
// Used by tier-policy-data-table. Renders a form for tier_name, scope,
// thresholds, next_tier, badge color, active flag. Surfaces PG constraint
// errors verbatim (e.g. unique-index violation on duplicate scope+name).
// ============================================================================

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';

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
  upsertTier,
  type ConsultantTierPolicyRow,
  type TierScopeType,
} from '@/lib/services/admission/consultant-tier-policy-service';

interface InstitutionOption {
  id: string;
  name: string;
}

interface EditTierDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: ConsultantTierPolicyRow | null;
  institutions: InstitutionOption[];
  onSaved: () => void;
}

interface FormState {
  tier_name: string;
  scope_type: TierScopeType;
  scope_id: string | null;
  display_order: string;
  min_conversions: string;
  max_conversions: string; // empty string = NULL (open-ended)
  next_tier: string;        // empty string = NULL (terminal)
  badge_color: string;
  is_active: boolean;
  description: string;
}

const EMPTY: FormState = {
  tier_name: '',
  scope_type: 'global',
  scope_id: null,
  display_order: '1',
  min_conversions: '0',
  max_conversions: '',
  next_tier: '',
  badge_color: '#CD7F32',
  is_active: true,
  description: '',
};

export function EditTierDialog({
  open,
  onOpenChange,
  row,
  institutions,
  onSaved,
}: EditTierDialogProps) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  // Reset/prefill on open.
  useEffect(() => {
    if (!open) return;
    if (row) {
      setForm({
        tier_name: row.tier_name,
        scope_type: row.scope_type,
        scope_id: row.scope_id,
        display_order: String(row.display_order),
        min_conversions: String(row.min_conversions),
        max_conversions:
          row.max_conversions === null ? '' : String(row.max_conversions),
        next_tier: row.next_tier ?? '',
        badge_color: row.badge_color ?? '#CD7F32',
        is_active: row.is_active,
        description: row.description ?? '',
      });
    } else {
      setForm(EMPTY);
    }
  }, [open, row]);

  const isEdit = !!row;

  const handleSave = async () => {
    // Client-side validation
    const tierName = form.tier_name.trim().toLowerCase();
    if (!tierName) {
      toast.error('Tier name is required');
      return;
    }
    if (form.scope_type === 'institution' && !form.scope_id) {
      toast.error('Pick a college for institution-scoped overrides');
      return;
    }
    const displayOrder = Number.parseInt(form.display_order, 10);
    if (!Number.isFinite(displayOrder)) {
      toast.error('Display order must be a whole number');
      return;
    }
    const minConv = Number.parseInt(form.min_conversions, 10);
    if (!Number.isFinite(minConv) || minConv < 0) {
      toast.error('Min conversions must be a non-negative whole number');
      return;
    }
    let maxConv: number | null = null;
    if (form.max_conversions.trim() !== '') {
      const parsed = Number.parseInt(form.max_conversions, 10);
      if (!Number.isFinite(parsed) || parsed < minConv) {
        toast.error('Max conversions must be >= min conversions, or blank for open-ended');
        return;
      }
      maxConv = parsed;
    }

    setSaving(true);
    try {
      await upsertTier(
        {
          id: row?.id,
          tier_name: tierName,
          scope_type: form.scope_type,
          scope_id: form.scope_type === 'global' ? null : form.scope_id,
          display_order: displayOrder,
          min_conversions: minConv,
          max_conversions: maxConv,
          next_tier: form.next_tier.trim().toLowerCase() || null,
          badge_color: form.badge_color.trim() || null,
          is_active: form.is_active,
          description: form.description.trim() || null,
        },
        // RLS rewrites updated_by from auth.uid() at the DB layer; a placeholder
        // is fine here.
        row?.updated_by ?? 'system',
      );
      toast.success(isEdit ? 'Tier updated' : 'Tier created');
      onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save tier';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Tier' : 'Add Tier'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Update the ${row?.tier_name} tier configuration.`
              : 'Define a new tier in the consultant ladder.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="tier_name">Tier name</Label>
            <Input
              id="tier_name"
              placeholder="e.g. bronze, silver, gold, platinum, diamond"
              value={form.tier_name}
              onChange={(e) =>
                setForm((f) => ({ ...f, tier_name: e.target.value }))
              }
            />
            <p className="text-xs text-muted-foreground">
              Lowercase identifier. Must be unique within its scope.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Scope</Label>
              <Select
                value={form.scope_type}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    scope_type: v as TierScopeType,
                    scope_id: v === 'global' ? null : f.scope_id,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">All colleges (default)</SelectItem>
                  <SelectItem value="institution">One college (override)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>College</Label>
              <Select
                value={form.scope_id ?? ''}
                disabled={form.scope_type !== 'institution'}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, scope_id: v || null }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick a college" />
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
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="display_order">Display order</Label>
              <Input
                id="display_order"
                type="number"
                min={1}
                value={form.display_order}
                onChange={(e) =>
                  setForm((f) => ({ ...f, display_order: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="min_conversions">Min conv.</Label>
              <Input
                id="min_conversions"
                type="number"
                min={0}
                value={form.min_conversions}
                onChange={(e) =>
                  setForm((f) => ({ ...f, min_conversions: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="max_conversions">Max conv.</Label>
              <Input
                id="max_conversions"
                type="number"
                min={0}
                placeholder="blank = ∞"
                value={form.max_conversions}
                onChange={(e) =>
                  setForm((f) => ({ ...f, max_conversions: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="next_tier">Next tier</Label>
              <Input
                id="next_tier"
                placeholder="blank = terminal (top tier)"
                value={form.next_tier}
                onChange={(e) =>
                  setForm((f) => ({ ...f, next_tier: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="badge_color">Badge color</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="badge_color"
                  placeholder="#CD7F32"
                  value={form.badge_color}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, badge_color: e.target.value }))
                  }
                />
                <span
                  aria-hidden
                  className="inline-block h-9 w-9 rounded border border-border"
                  style={{ backgroundColor: form.badge_color || 'transparent' }}
                />
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              rows={2}
              placeholder="Optional note for other admins."
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
            <div>
              <Label htmlFor="is_active" className="text-sm">
                Active
              </Label>
              <p className="text-xs text-muted-foreground">
                Inactive tiers are skipped by the reader fn.
              </p>
            </div>
            <Switch
              id="is_active"
              checked={form.is_active}
              onCheckedChange={(v) =>
                setForm((f) => ({ ...f, is_active: v }))
              }
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
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create tier'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
