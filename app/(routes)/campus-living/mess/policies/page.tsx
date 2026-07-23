'use client';

// ============================================================================
// /campus-living/mess/policies — Mess Menu policy editor (relocated from /admin/mess 2026-06-01)
// ============================================================================
// Surfaces the 6 mess.menu.* platform_policies rows seeded in PR 1 as
// English-consequence widgets. Pattern reference: /internships/policy/*.
//
//   • mess.menu.edit_cutoff_minutes      → number input
//   • mess.menu.seed_size_default        → number input
//   • mess.menu.image_source             → select (photos | ai_generated | none)
//   • mess.menu.source_locale            → select (ta | en)
//   • mess.menu.tier_crossing_allowed    → toggle
//   • mess.menu.fee_model                → select (bundled | per_meal | per_day)
// ============================================================================

import { useEffect, useState } from 'react';
import { Settings, Loader2 } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import {
  useMessMenuPolicies,
  useUpdateMessMenuPolicy,
  type MessMenuPolicyKey,
} from '@/hooks/campus-living/use-mess-menu-policies';
import {
  MESS_MENU_POLICY_KEYS,
  type MessMenuPolicySnapshot,
} from '@/lib/services/campus-living/mess-menu-policy-service';

export const navMeta = { label: 'Mess Policies', icon: 'Settings' } as const;

interface PolicyCardProps<TValue> {
  title: string;
  description: string;
  policyKey: MessMenuPolicyKey;
  value: TValue;
  render: (params: {
    value: TValue;
    setValue: (v: TValue) => void;
    isPending: boolean;
  }) => React.ReactNode;
  onSave: (v: TValue) => void | Promise<void>;
}

function PolicyCard<TValue>({
  title,
  description,
  value: initialValue,
  render,
  onSave,
}: PolicyCardProps<TValue>) {
  const [draft, setDraft] = useState<TValue>(initialValue);
  const [saving, setSaving] = useState(false);

  // Re-sync when the snapshot upstream changes (e.g. after another tab edits).
  useEffect(() => {
    setDraft(initialValue);
  }, [initialValue]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  const dirty = draft !== initialValue;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription className="text-xs leading-relaxed">{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {render({ value: draft, setValue: setDraft, isPending: saving })}
        <div className="flex justify-end">
          <Button size="sm" onClick={handleSave} disabled={!dirty || saving}>
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            {dirty ? 'Save' : 'Saved'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function MessPoliciesPage() {
  const { data: snapshot, isLoading } = useMessMenuPolicies();
  const update = useUpdateMessMenuPolicy();

  const saveOne = (key: MessMenuPolicyKey, value: number | string | boolean) =>
    update.mutateAsync({ policyKey: key, value });

  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout>
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout>
        <header className="mb-6 flex items-center gap-3">
          <Settings className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Mess Menu Policies</h1>
            <p className="text-sm text-muted-foreground">
              Tune the 6 runtime knobs. Changes take effect within ~1 hour
              (React Query staleTime) without redeploy.
            </p>
          </div>
        </header>

        {isLoading || !snapshot ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-full" />
            ))}
          </div>
        ) : (
          <PolicyCardsGrid snapshot={snapshot} saveOne={saveOne} />
        )}
      </ContentLayout>
    </SuperAdminOnly>
  );
}

function PolicyCardsGrid({
  snapshot,
  saveOne,
}: {
  snapshot: MessMenuPolicySnapshot;
  saveOne: (key: MessMenuPolicyKey, value: number | string | boolean) => Promise<void>;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <PolicyCard<number>
        title="Edit cutoff (minutes)"
        description="Minutes before a meal's start when the cell freezes from edits for the current week. Next-week edits remain open until that week arrives."
        policyKey={MESS_MENU_POLICY_KEYS.EDIT_CUTOFF_MINUTES}
        value={snapshot.editCutoffMinutes}
        onSave={(v) => saveOne(MESS_MENU_POLICY_KEYS.EDIT_CUTOFF_MINUTES, v)}
        render={({ value, setValue }) => (
          <div>
            <Label className="text-xs">Minutes (default 120 = 2 hours)</Label>
            <Input
              type="number"
              min={0}
              max={1440}
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
            />
          </div>
        )}
      />

      <PolicyCard<number>
        title="Seed-size default"
        description="Chairperson's minimum-viable seed when initialising a new institution's weekly menu. Advisory only — Director can publish a sparser menu."
        policyKey={MESS_MENU_POLICY_KEYS.SEED_SIZE_DEFAULT}
        value={snapshot.seedSizeDefault}
        onSave={(v) => saveOne(MESS_MENU_POLICY_KEYS.SEED_SIZE_DEFAULT, v)}
        render={({ value, setValue }) => (
          <div>
            <Label className="text-xs">Default seed item count (default 48)</Label>
            <Input
              type="number"
              min={1}
              max={500}
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
            />
          </div>
        )}
      />

      <PolicyCard<string>
        title="Image source"
        description="Where item illustrations come from. photos = uploaded by chairperson (preferred). ai_generated = LLM fallback. none = text-only menu."
        policyKey={MESS_MENU_POLICY_KEYS.IMAGE_SOURCE}
        value={snapshot.imageSource}
        onSave={(v) => saveOne(MESS_MENU_POLICY_KEYS.IMAGE_SOURCE, v)}
        render={({ value, setValue }) => (
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="photos">Uploaded photos (chairperson)</SelectItem>
              <SelectItem value="ai_generated">AI generated</SelectItem>
              <SelectItem value="none">No images</SelectItem>
            </SelectContent>
          </Select>
        )}
      />

      <PolicyCard<string>
        title="Source locale"
        description="Which locale is source-authoritative when both Tamil and English are present. ta = Tamil wins (current chairperson photos are Tamil-only)."
        policyKey={MESS_MENU_POLICY_KEYS.SOURCE_LOCALE}
        value={snapshot.sourceLocale}
        onSave={(v) => saveOne(MESS_MENU_POLICY_KEYS.SOURCE_LOCALE, v)}
        render={({ value, setValue }) => (
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ta">Tamil (ta)</SelectItem>
              <SelectItem value="en">English (en)</SelectItem>
            </SelectContent>
          </Select>
        )}
      />

      <PolicyCard<boolean>
        title="Tier crossing allowed"
        description="Whether a resident may eat at a tier different from their assigned hostel tier. Default OFF — tier-fixed enforcement (chairperson's preference)."
        policyKey={MESS_MENU_POLICY_KEYS.TIER_CROSSING_ALLOWED}
        value={snapshot.tierCrossingAllowed}
        onSave={(v) => saveOne(MESS_MENU_POLICY_KEYS.TIER_CROSSING_ALLOWED, v)}
        render={({ value, setValue }) => (
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <Label className="text-sm">Allow residents to dine at other tiers</Label>
            <Switch checked={value} onCheckedChange={setValue} />
          </div>
        )}
      />

      <PolicyCard<string>
        title="Fee model"
        description="How monthly mess fee is structured. bundled = single per-month price per tier (default). per_meal / per_day require attendance scans."
        policyKey={MESS_MENU_POLICY_KEYS.FEE_MODEL}
        value={snapshot.feeModel}
        onSave={(v) => saveOne(MESS_MENU_POLICY_KEYS.FEE_MODEL, v)}
        render={({ value, setValue }) => (
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bundled">Bundled per month</SelectItem>
              <SelectItem value="per_meal">Per meal</SelectItem>
              <SelectItem value="per_day">Per day</SelectItem>
            </SelectContent>
          </Select>
        )}
      />
    </div>
  );
}
