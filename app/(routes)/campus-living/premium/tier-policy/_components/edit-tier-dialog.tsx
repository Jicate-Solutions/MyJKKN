'use client';

// ============================================================================
// Premium Room — Edit Tier Dialog
// ============================================================================
// Created: 2026-05-16
// Spec: .claude/scratch/premium-stay-spec-2026-05-16.html
//
// Form for create / update of a hostel_tier_policy row. tier_key locked
// to standard / premium / premium_plus enum. Feature toggles use English
// checkbox labels. Uplift percentage is numeric with 2dp precision.
// ============================================================================

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
import { upsertHostelTier } from '@/lib/services/campus-living/hostel-tier-service';
import type {
  HostelTierPolicy,
  HostelTierKey,
  TierFeatureKey,
} from '@/types/campus-living/premium';

interface InstitutionOption {
  id: string;
  name: string;
}

interface EditTierDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: HostelTierPolicy | null;
  institutions: InstitutionOption[];
  onSaved: () => void;
}

type ScopeKind = 'global' | 'institution';

interface FormState {
  tier_key: HostelTierKey;
  tier_display_name: string;
  scope_kind: ScopeKind;
  institution_id: string | null;
  sort_order: string;
  fee_uplift_percentage_default: string;
  is_active: boolean;
  description: string;
  features: Set<TierFeatureKey>;
}

const ALL_FEATURES: ReadonlyArray<{ key: TierFeatureKey; label: string; help: string }> = [
  {
    key: 'pick_block_and_room',
    label: 'Pick block + room',
    help: 'Lets the learner choose which block and which specific room they want.',
  },
  {
    key: 'pick_specific_bed',
    label: 'Pick specific bed',
    help: 'Lets the learner pick the exact bed inside the chosen room (vs admin allocating).',
  },
  {
    key: 'pick_roommate_with_consent',
    label: 'Pick roommate (with consent)',
    help: 'Invite another learner as roommate. Both parties (and parent of any minor) must confirm in 48 hours.',
  },
  {
    key: 'extended_curfew_quota',
    label: 'Extended curfew quota',
    help: 'Adds late-return passes per month (default 4) the learner can use without warden approval.',
  },
  {
    key: 'premium_maintenance_sla',
    label: 'Premium maintenance SLA',
    help: 'Maintenance tickets from this tier get the premium SLA hours (configured in maintenance SLA admin).',
  },
];

const EMPTY: FormState = {
  tier_key: 'premium',
  tier_display_name: '',
  scope_kind: 'global',
  institution_id: null,
  sort_order: '2',
  fee_uplift_percentage_default: '25',
  is_active: true,
  description: '',
  features: new Set<TierFeatureKey>(['pick_block_and_room', 'pick_specific_bed', 'pick_roommate_with_consent']),
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

  useEffect(() => {
    if (!open) return;
    if (row) {
      setForm({
        tier_key: row.tier_key,
        tier_display_name: row.tier_display_name,
        scope_kind: row.institution_id === null ? 'global' : 'institution',
        institution_id: row.institution_id,
        sort_order: String(row.sort_order),
        fee_uplift_percentage_default: String(row.fee_uplift_percentage_default),
        is_active: row.is_active,
        description: row.description ?? '',
        features: new Set<TierFeatureKey>(row.tier_features),
      });
    } else {
      setForm(EMPTY);
    }
  }, [open, row]);

  const isEdit = !!row;

  const handleSave = async () => {
    const displayName = form.tier_display_name.trim();
    if (!displayName) {
      toast.error('Display name is required');
      return;
    }
    if (form.scope_kind === 'institution' && !form.institution_id) {
      toast.error('Pick a college for the institution override');
      return;
    }
    const sortOrder = Number.parseInt(form.sort_order, 10);
    if (!Number.isFinite(sortOrder)) {
      toast.error('Sort order must be a whole number');
      return;
    }
    const uplift = Number.parseFloat(form.fee_uplift_percentage_default);
    if (!Number.isFinite(uplift) || uplift < 0) {
      toast.error('Default uplift must be a non-negative number');
      return;
    }

    setSaving(true);
    try {
      await upsertHostelTier(
        {
          id: row?.id,
          tier_key: form.tier_key,
          tier_display_name: displayName,
          institution_id: form.scope_kind === 'global' ? null : form.institution_id,
          sort_order: sortOrder,
          fee_uplift_percentage_default: uplift,
          tier_features: Array.from(form.features),
          is_active: form.is_active,
          description: form.description.trim() || null,
        },
        // RLS overwrites updated_by from auth.uid() at the DB layer; placeholder.
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

  const toggleFeature = (key: TierFeatureKey, checked: boolean) => {
    setForm((f) => {
      const next = new Set(f.features);
      if (checked) next.add(key);
      else next.delete(key);
      return { ...f, features: next };
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Tier' : 'Add Tier'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Update the "${row?.tier_display_name}" tier configuration.`
              : 'Define a new tier row (or override an existing tier for a specific college).'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Tier key</Label>
              <Select
                value={form.tier_key}
                onValueChange={(v) => setForm((f) => ({ ...f, tier_key: v as HostelTierKey }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">standard (default)</SelectItem>
                  <SelectItem value="premium">premium</SelectItem>
                  <SelectItem value="premium_plus">premium_plus</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tier_display_name">Display name</Label>
              <Input
                id="tier_display_name"
                placeholder="e.g. Premium, Premium Plus"
                value={form.tier_display_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, tier_display_name: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Scope</Label>
              <Select
                value={form.scope_kind}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    scope_kind: v as ScopeKind,
                    institution_id: v === 'global' ? null : f.institution_id,
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
                value={form.institution_id ?? ''}
                disabled={form.scope_kind !== 'institution'}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, institution_id: v || null }))
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="sort_order">Sort order</Label>
              <Input
                id="sort_order"
                type="number"
                min={1}
                value={form.sort_order}
                onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="fee_uplift_percentage_default">Default uplift (%)</Label>
              <Input
                id="fee_uplift_percentage_default"
                type="number"
                min={0}
                step="0.01"
                value={form.fee_uplift_percentage_default}
                onChange={(e) =>
                  setForm((f) => ({ ...f, fee_uplift_percentage_default: e.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Suggested default uplift over the standard hostel fee. The exact
                ₹ amount per college is set in the fee config admin.
              </p>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Feature bundle</Label>
            <p className="text-xs text-muted-foreground">
              Check the features this tier grants. Service layer reads these at
              runtime — uncheck to revoke a feature without code change.
            </p>
            <div className="grid gap-2 rounded-md border border-border p-3">
              {ALL_FEATURES.map((f) => (
                <label key={f.key} className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={form.features.has(f.key)}
                    onCheckedChange={(checked) => toggleFeature(f.key, !!checked)}
                  />
                  <div>
                    <div className="font-medium">{f.label}</div>
                    <div className="text-xs text-muted-foreground">{f.help}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Optional plain-English summary shown in the admin table"
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              rows={2}
            />
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="is_active"
              checked={form.is_active}
              onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
            />
            <Label htmlFor="is_active">Active (visible to learners + admin UIs)</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
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
