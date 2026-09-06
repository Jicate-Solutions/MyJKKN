'use client';

// =====================================================================
// /hr/admin/automation-rules — Director's zero-deploy HR automation editor
// =====================================================================
// Standing rule (2026-04-29): every policy decision = config-table row +
// super_admin UI. Edits land in `platform_policies` (policy_key
// 'hr.automation_rules') and the next attendance run reads them. No
// deploy, no PR, no developer round-trip.
//
// Workisy gap #1, Wave 1 (2026-05-15). Backed by:
//   - Table:    public.platform_policies (existing, Phase 1.5a)
//   - Helper:   public.fn_get_policy (existing)
//   - Substrate: Agent α PR seeds policy_key 'hr.automation_rules' with
//     starter rules. This page reads/writes that same row.
//   - Consumer: HR attendance cron writer (Wave 2) reads the policy and
//     records firings into hr_automation_rule_fires (this PR adds that table).
//
// Permission: super_admin only for EDIT (admin can view).
//
// Cleanup PR: this file references 'hr.automation_rules' as a STRING
// LITERAL. After Agent α merges and POLICY_KEYS.HR_AUTOMATION_RULES
// constant lands in lib/policies/keys.ts, swap the literal to the constant.
// =====================================================================

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Database, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
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
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { usePermissions } from '@/hooks/use-permissions';

// ---------------------------------------------------------------------------
// Types — match the JSONB shape seeded by Agent α
// ---------------------------------------------------------------------------

type DeductionType = 'per_minute' | 'per_hour' | 'fixed_amount';

interface AutomationRule {
  rule_key: string;                 // stable identifier: 'late_entry', 'break', 'early_exit', 'overtime'
  rule_name: string;                // human label shown in the firings audit
  threshold_hhmm: string;           // "HH:MM" — for late_entry: clock-in cutoff; for break/early_exit/overtime: duration threshold
  deduction_type: DeductionType;
  deduction_value: number;          // ₹ if fixed_amount; ₹/unit if per_minute/per_hour
  monthly_cap_enabled: boolean;     // "Set Occurrences (Monthly)"
  monthly_cap_count: number | null; // max occurrences per month when cap enabled
  active: boolean;
}

interface PolicyRow {
  id: string;
  policy_key: string;
  value: AutomationRule[];
  description: string | null;
  updated_at: string | null;
}

const POLICY_KEY_LITERAL = 'hr.automation_rules';

// Starter rules used when the policy row is missing (Agent α hasn't merged
// yet). Mirror the four Workisy buckets so the page renders before the seed
// migration lands. Once seeded, the server value wins.
const FALLBACK_RULES: AutomationRule[] = [
  {
    rule_key: 'late_entry',
    rule_name: 'Late Entry',
    threshold_hhmm: '00:15',
    deduction_type: 'per_minute',
    deduction_value: 10,
    monthly_cap_enabled: false,
    monthly_cap_count: null,
    active: true,
  },
  {
    rule_key: 'break',
    rule_name: 'Break Overrun',
    threshold_hhmm: '01:00',
    deduction_type: 'per_minute',
    deduction_value: 10,
    monthly_cap_enabled: false,
    monthly_cap_count: null,
    active: true,
  },
  {
    rule_key: 'early_exit',
    rule_name: 'Early Exit',
    threshold_hhmm: '00:15',
    deduction_type: 'per_minute',
    deduction_value: 10,
    monthly_cap_enabled: false,
    monthly_cap_count: null,
    active: true,
  },
  {
    rule_key: 'overtime',
    rule_name: 'Overtime',
    threshold_hhmm: '00:30',
    deduction_type: 'per_hour',
    deduction_value: 100,
    monthly_cap_enabled: false,
    monthly_cap_count: null,
    active: true,
  },
];

const DEDUCTION_TYPE_LABEL: Record<DeductionType, string> = {
  per_minute: 'Per minute (₹)',
  per_hour: 'Per hour (₹)',
  fixed_amount: 'Fixed amount (₹)',
};

// ---------------------------------------------------------------------------
// Page wrapper — gated by SuperAdminOnly (admin or super_admin to view).
// ---------------------------------------------------------------------------
export default function HRAutomationRulesPage() {
  return (
    <SuperAdminOnly>
      <ContentLayout title="HR Automation Rules">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR' },
            { label: 'Automation Rules' },
          ]}
        />
        <HRAutomationRulesContent />
      </ContentLayout>
    </SuperAdminOnly>
  );
}

// ---------------------------------------------------------------------------
// Content — loads the row, lets super_admin edit, persists on Save.
// ---------------------------------------------------------------------------
function HRAutomationRulesContent() {
  const { isSuperAdmin } = usePermissions();
  const [row, setRow] = useState<PolicyRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seedMissing, setSeedMissing] = useState(false);

  // Drafts — only set when the user has touched a field; un-touched state
  // renders server values.
  const [draftRules, setDraftRules] = useState<AutomationRule[] | null>(null);
  const [saving, setSaving] = useState(false);

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const supabase = createClientSupabaseClient();
        const { data, error: rpcErr } = await supabase
          .from('platform_policies')
          .select('id, policy_key, value, description, updated_at')
          .eq('policy_key', POLICY_KEY_LITERAL)
          .eq('scope_type', 'global')
          .is('scope_id', null)
          .maybeSingle();

        if (rpcErr) throw rpcErr;
        if (cancelled) return;

        if (data) {
          // PostgREST returns JSONB as parsed JS object. Tolerate either a
          // bare array or an envelope { rules: [...] } from Agent α.
          const value = data.value;
          let rules: AutomationRule[] = [];
          if (Array.isArray(value)) {
            rules = value as AutomationRule[];
          } else if (value && typeof value === 'object' && Array.isArray((value as { rules?: unknown }).rules)) {
            rules = (value as { rules: AutomationRule[] }).rules;
          }
          setRow({
            id: data.id,
            policy_key: data.policy_key,
            value: rules.length > 0 ? rules : FALLBACK_RULES,
            description: data.description,
            updated_at: data.updated_at,
          });
          setSeedMissing(false);
        } else {
          setRow(null);
          setSeedMissing(true);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rules = draftRules ?? row?.value ?? FALLBACK_RULES;

  const dirty = useMemo(() => {
    if (!row) return false;
    if (!draftRules) return false;
    return JSON.stringify(draftRules) !== JSON.stringify(row.value);
  }, [row, draftRules]);

  const canSave = dirty && rules.length > 0 && isSuperAdmin && !saving && !seedMissing;

  function updateRule(index: number, patch: Partial<AutomationRule>) {
    const next = [...rules];
    next[index] = { ...next[index], ...patch };
    setDraftRules(next);
  }

  function addRule() {
    const next: AutomationRule[] = [
      ...rules,
      {
        rule_key: `custom_${Date.now()}`,
        rule_name: 'New Rule',
        threshold_hhmm: '00:15',
        deduction_type: 'per_minute',
        deduction_value: 0,
        monthly_cap_enabled: false,
        monthly_cap_count: null,
        active: true,
      },
    ];
    setDraftRules(next);
  }

  function removeRule(index: number) {
    const next = rules.filter((_, i) => i !== index);
    setDraftRules(next);
  }

  function revert() {
    setDraftRules(null);
  }

  async function save() {
    if (!row) return;
    setSaving(true);
    try {
      const supabase = createClientSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data, error: upErr } = await supabase
        .from('platform_policies')
        .update({
          value: rules,
          updated_by: user?.id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .select('id, policy_key, value, description, updated_at')
        .single();

      if (upErr) throw upErr;
      if (data) {
        const value = data.value;
        const parsedRules: AutomationRule[] = Array.isArray(value)
          ? (value as AutomationRule[])
          : Array.isArray((value as { rules?: unknown })?.rules)
            ? (value as { rules: AutomationRule[] }).rules
            : [];
        setRow({
          id: data.id,
          policy_key: data.policy_key,
          value: parsedRules,
          description: data.description,
          updated_at: data.updated_at,
        });
        setDraftRules(null);
        toast.success('Rules saved — will apply from next attendance run.');
      }
    } catch (e) {
      toast.error(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mt-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mt-6">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Failed to load HR automation rules</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (seedMissing) {
    return (
      <Alert className="mt-6">
        <Database className="h-4 w-4" />
        <AlertTitle>HR automation rules not seeded</AlertTitle>
        <AlertDescription>
          The <code>{POLICY_KEY_LITERAL}</code> row is missing in{' '}
          <code>platform_policies</code>. Apply the policy seed migration
          (Agent α PR — feat/hr-automation-rules-policy) to enable editing.
          Until then, the four starter rules render below from local fallback
          but cannot be persisted.
        </AlertDescription>
        <div className="mt-6 space-y-4 opacity-60 pointer-events-none">
          {FALLBACK_RULES.map((r, i) => (
            <RuleCardReadonly key={i} rule={r} />
          ))}
        </div>
      </Alert>
    );
  }

  if (!row) {
    return null;
  }

  return (
    <div className="mt-6 space-y-6">
      <Alert>
        <Database className="h-4 w-4" />
        <AlertTitle>Zero-deploy HR automation tweaks</AlertTitle>
        <AlertDescription>
          Edit the rules that automatically deduct minutes or ₹ from staff
          attendance (late entry, break overrun, early exit, overtime). The
          next attendance run picks up the new value &mdash; no deploy, no
          PR, no developer round-trip.
        </AlertDescription>
      </Alert>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          Policy key: <code className="text-xs">{row.policy_key}</code>{' '}
          &middot; Last updated:{' '}
          {row.updated_at ? format(new Date(row.updated_at), 'MMM d, HH:mm') : '—'}
        </p>
        {isSuperAdmin && (
          <Button type="button" size="sm" variant="outline" onClick={addRule} disabled={saving} className="shrink-0">
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add rule
          </Button>
        )}
      </div>

      <div className="space-y-4">
        {rules.map((rule, i) => (
          <RuleCard
            key={`${rule.rule_key}-${i}`}
            rule={rule}
            disabled={!isSuperAdmin || saving}
            onChange={(patch) => updateRule(i, patch)}
            onRemove={() => removeRule(i)}
          />
        ))}
        {rules.length === 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              No rules configured. Click <strong>Add rule</strong> to create one,
              or attendance runs will skip all deductions.
            </AlertDescription>
          </Alert>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t pt-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!dirty || saving}
          onClick={revert}
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1" />
          Revert
        </Button>
        <Button type="button" size="sm" disabled={!canSave} onClick={save}>
          <Save className="h-3.5 w-3.5 mr-1" />
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>

      {!isSuperAdmin && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            You can view HR automation rules but only{' '}
            <strong>super_admin</strong> can edit them. Contact the Director
            to request a change.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RuleCard — one editable card per rule. Mirrors the four-section Workisy
// layout (Rule Name, Threshold, Deduction, Monthly Cap, Active).
// ---------------------------------------------------------------------------
interface RuleCardProps {
  rule: AutomationRule;
  disabled: boolean;
  onChange: (patch: Partial<AutomationRule>) => void;
  onRemove: () => void;
}

function RuleCard({ rule, disabled, onChange, onRemove }: RuleCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex-1 space-y-1">
          <CardTitle className="text-base">
            <Input
              value={rule.rule_name}
              onChange={(e) => onChange({ rule_name: e.target.value })}
              disabled={disabled}
              className="max-w-md text-base font-semibold"
              placeholder="Rule name"
            />
          </CardTitle>
          <CardDescription className="text-xs font-mono">
            rule_key: {rule.rule_key}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <Label htmlFor={`active-${rule.rule_key}`} className="text-xs">
            Active
          </Label>
          <Switch
            id={`active-${rule.rule_key}`}
            checked={rule.active}
            onCheckedChange={(v) => onChange({ active: Boolean(v) })}
            disabled={disabled}
          />
          {!disabled && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRemove}
              aria-label={`Remove ${rule.rule_name}`}
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Threshold */}
        <div className="space-y-2">
          <Label htmlFor={`threshold-${rule.rule_key}`} className="text-sm font-semibold">
            Threshold (hh:mm)
          </Label>
          <p className="text-xs text-muted-foreground">
            For late entry: minutes after shift-start before the rule fires.
            For break / early exit / overtime: the duration that triggers a
            deduction.
          </p>
          <Input
            id={`threshold-${rule.rule_key}`}
            value={rule.threshold_hhmm}
            onChange={(e) => onChange({ threshold_hhmm: e.target.value })}
            disabled={disabled}
            placeholder="00:15"
            pattern="^\d{1,2}:\d{2}$"
            className="max-w-xs font-mono"
          />
        </div>

        {/* Deduction Type */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Deduction Type</Label>
          <RadioGroup
            value={rule.deduction_type}
            onValueChange={(v) => onChange({ deduction_type: v as DeductionType })}
            disabled={disabled}
            className="flex flex-col gap-2 sm:flex-row sm:gap-6"
          >
            {(['per_minute', 'per_hour', 'fixed_amount'] as DeductionType[]).map((t) => (
              <label
                key={t}
                htmlFor={`dt-${rule.rule_key}-${t}`}
                className="flex items-center gap-2 cursor-pointer"
              >
                <RadioGroupItem id={`dt-${rule.rule_key}-${t}`} value={t} disabled={disabled} />
                <span className="text-sm">{DEDUCTION_TYPE_LABEL[t]}</span>
              </label>
            ))}
          </RadioGroup>
        </div>

        {/* Deduction Value */}
        <div className="space-y-2">
          <Label htmlFor={`val-${rule.rule_key}`} className="text-sm font-semibold">
            Deduction Value
          </Label>
          <p className="text-xs text-muted-foreground">
            Amount in ₹. For <em>per_minute</em> / <em>per_hour</em>, this is
            the rate. For <em>fixed_amount</em>, this is the flat deduction
            per firing.
          </p>
          <Input
            id={`val-${rule.rule_key}`}
            type="number"
            min={0}
            step="0.01"
            value={rule.deduction_value}
            onChange={(e) => onChange({ deduction_value: Number(e.target.value) })}
            disabled={disabled}
            className="max-w-xs"
          />
        </div>

        {/* Monthly Cap */}
        <div className="space-y-2 border-t pt-4">
          <div className="flex items-center gap-2">
            <Switch
              id={`cap-${rule.rule_key}`}
              checked={rule.monthly_cap_enabled}
              onCheckedChange={(v) =>
                onChange({
                  monthly_cap_enabled: Boolean(v),
                  monthly_cap_count: v ? rule.monthly_cap_count ?? 3 : null,
                })
              }
              disabled={disabled}
            />
            <Label htmlFor={`cap-${rule.rule_key}`} className="text-sm font-semibold">
              Set Occurrences (Monthly)
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            When enabled, this rule stops deducting after N occurrences per
            calendar month per staff member. Firings still get audited; the
            deduction is just zero past the cap.
          </p>
          {rule.monthly_cap_enabled && (
            <Input
              type="number"
              min={1}
              step="1"
              value={rule.monthly_cap_count ?? 0}
              onChange={(e) => onChange({ monthly_cap_count: Number(e.target.value) })}
              disabled={disabled}
              className="max-w-xs"
              placeholder="3"
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Read-only card used inside the seed-missing alert.
function RuleCardReadonly({ rule }: { rule: AutomationRule }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{rule.rule_name}</CardTitle>
        <CardDescription className="text-xs font-mono">rule_key: {rule.rule_key}</CardDescription>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <p>Threshold: <span className="font-mono">{rule.threshold_hhmm}</span></p>
        <p>Deduction: {DEDUCTION_TYPE_LABEL[rule.deduction_type]} = ₹{rule.deduction_value}</p>
        <p>
          Monthly cap:{' '}
          {rule.monthly_cap_enabled ? `${rule.monthly_cap_count} occurrences` : 'no cap'}
        </p>
        <p>Active: {rule.active ? 'yes' : 'no'}</p>
      </CardContent>
    </Card>
  );
}
