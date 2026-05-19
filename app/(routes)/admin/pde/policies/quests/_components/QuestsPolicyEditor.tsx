'use client';

// =====================================================================
// PDE Cluster D — Quest & Supply Policy Editor
// =====================================================================
// Edits 4 platform_policies rows under pde.quests.* (scope=global).
//   - pde.quests.risk_tiers              (object: enabled + tiers + default_tier + production_eligibility)
//   - pde.quests.supply_sources          (array: 4 sources, multi-select)
//   - pde.quests.compensation_model      (enum: 3 modes)
//   - pde.quests.failed_quest_recovery   (object: mode + faculty_recovery_enabled)
//
// Pattern mirrors ScoringPolicyEditor (Cluster A). Global-scope flat
// save — no institution selector, no draft/publish. When per-institution
// overrides are introduced, this page can swap to PolicyEditorShell.
// =====================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Database, RotateCcw, Save } from 'lucide-react';
import { toast } from 'sonner';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { createClientSupabaseClient } from '@/lib/supabase/client';

// ---------------------------------------------------------------------------
// Types & defaults
// ---------------------------------------------------------------------------

export type RiskTier = 'experimental' | 'production';

export interface RiskTiersConfig {
  enabled: boolean;
  tiers: RiskTier[];
  default_tier: RiskTier;
  production_eligibility: string;
}

export type SupplySource =
  | 'internal_departments'
  | 'industry_partners'
  | 'alumni_led'
  | 'student_proposed';

export type CompensationModel =
  | 'voluntary_recognition'
  | 'reciprocal_credit'
  | 'honorarium_per_quest';

export type FailedRecoveryMode = 'department_set_risk_tiers';

export interface FailedQuestRecovery {
  mode: FailedRecoveryMode;
  faculty_recovery_enabled: boolean;
}

interface PolicyRowRaw {
  id: string;
  policy_key: string;
  value: unknown;
}

interface QuestsPolicyState {
  riskTiers: RiskTiersConfig;
  supplySources: SupplySource[];
  compensationModel: CompensationModel;
  failedRecovery: FailedQuestRecovery;
}

const ALL_SUPPLY_SOURCES: SupplySource[] = [
  'internal_departments',
  'industry_partners',
  'alumni_led',
  'student_proposed',
];

const DEFAULT_STATE: QuestsPolicyState = {
  riskTiers: {
    enabled: true,
    tiers: ['experimental', 'production'],
    default_tier: 'experimental',
    production_eligibility: 'after_2_experimental_passes',
  },
  supplySources: [...ALL_SUPPLY_SOURCES],
  compensationModel: 'reciprocal_credit',
  failedRecovery: {
    mode: 'department_set_risk_tiers',
    faculty_recovery_enabled: false,
  },
};

const POLICY_KEYS = {
  RISK_TIERS: 'pde.quests.risk_tiers',
  SUPPLY_SOURCES: 'pde.quests.supply_sources',
  COMPENSATION: 'pde.quests.compensation_model',
  FAILED_RECOVERY: 'pde.quests.failed_quest_recovery',
} as const;

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

function asBool(raw: unknown, fallback: boolean): boolean {
  return typeof raw === 'boolean' ? raw : fallback;
}

function parseRiskTiers(raw: unknown): RiskTiersConfig {
  const obj = (raw || {}) as Partial<RiskTiersConfig>;
  const validTier = (t: unknown): t is RiskTier =>
    t === 'experimental' || t === 'production';
  const tiers: RiskTier[] = Array.isArray(obj.tiers)
    ? (obj.tiers.filter(validTier) as RiskTier[])
    : DEFAULT_STATE.riskTiers.tiers;
  const default_tier: RiskTier = validTier(obj.default_tier)
    ? obj.default_tier
    : DEFAULT_STATE.riskTiers.default_tier;
  return {
    enabled: asBool(obj.enabled, DEFAULT_STATE.riskTiers.enabled),
    tiers: tiers.length > 0 ? tiers : DEFAULT_STATE.riskTiers.tiers,
    default_tier,
    production_eligibility:
      typeof obj.production_eligibility === 'string'
        ? obj.production_eligibility
        : DEFAULT_STATE.riskTiers.production_eligibility,
  };
}

function parseSupplySources(raw: unknown): SupplySource[] {
  if (!Array.isArray(raw)) return DEFAULT_STATE.supplySources;
  const valid = (s: unknown): s is SupplySource =>
    s === 'internal_departments' ||
    s === 'industry_partners' ||
    s === 'alumni_led' ||
    s === 'student_proposed';
  const filtered = raw.filter(valid) as SupplySource[];
  return filtered.length > 0 ? filtered : DEFAULT_STATE.supplySources;
}

function parseCompensation(raw: unknown): CompensationModel {
  const valid: CompensationModel[] = [
    'voluntary_recognition',
    'reciprocal_credit',
    'honorarium_per_quest',
  ];
  return valid.includes(raw as CompensationModel)
    ? (raw as CompensationModel)
    : DEFAULT_STATE.compensationModel;
}

function parseFailedRecovery(raw: unknown): FailedQuestRecovery {
  const obj = (raw || {}) as Partial<FailedQuestRecovery>;
  return {
    mode: 'department_set_risk_tiers',
    faculty_recovery_enabled: asBool(
      obj.faculty_recovery_enabled,
      DEFAULT_STATE.failedRecovery.faculty_recovery_enabled,
    ),
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SourceCheckbox({
  id,
  label,
  help,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  help: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border p-3">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        disabled={disabled}
        className="mt-1"
      />
      <div className="space-y-0.5">
        <Label htmlFor={id} className="text-sm font-medium cursor-pointer">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{help}</p>
      </div>
    </div>
  );
}

function ModeOption({
  id,
  value,
  label,
  help,
}: {
  id: string;
  value: CompensationModel;
  label: string;
  help: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border p-3">
      <RadioGroupItem value={value} id={id} className="mt-1" />
      <div className="space-y-0.5">
        <Label htmlFor={id} className="text-sm font-medium cursor-pointer">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{help}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QuestsPolicyEditor() {
  const [rows, setRows] = useState<Map<string, PolicyRowRaw>>(new Map());
  const [loaded, setLoaded] = useState<QuestsPolicyState | null>(null);
  const [working, setWorking] = useState<QuestsPolicyState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClientSupabaseClient();
      const { data, error: fetchErr } = await supabase
        .from('platform_policies')
        .select('id, policy_key, value')
        .in('policy_key', [
          POLICY_KEYS.RISK_TIERS,
          POLICY_KEYS.SUPPLY_SOURCES,
          POLICY_KEYS.COMPENSATION,
          POLICY_KEYS.FAILED_RECOVERY,
        ])
        .eq('scope_type', 'global');
      if (fetchErr) throw fetchErr;

      const map = new Map<string, PolicyRowRaw>();
      const raw = (data || []) as unknown as PolicyRowRaw[];
      for (const r of raw) map.set(r.policy_key, r);
      setRows(map);

      const next: QuestsPolicyState = {
        riskTiers: parseRiskTiers(map.get(POLICY_KEYS.RISK_TIERS)?.value),
        supplySources: parseSupplySources(map.get(POLICY_KEYS.SUPPLY_SOURCES)?.value),
        compensationModel: parseCompensation(map.get(POLICY_KEYS.COMPENSATION)?.value),
        failedRecovery: parseFailedRecovery(map.get(POLICY_KEYS.FAILED_RECOVERY)?.value),
      };
      setLoaded(next);
      setWorking(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = useMemo(() => {
    if (!loaded || !working) return false;
    return JSON.stringify(loaded) !== JSON.stringify(working);
  }, [loaded, working]);

  const supplyValid = (working?.supplySources?.length ?? 0) > 0;
  const canSave = dirty && supplyValid && !saving;

  function revert() {
    if (loaded) setWorking(loaded);
  }

  async function save() {
    if (!working || !canSave) return;
    setSaving(true);
    try {
      const supabase = createClientSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const now = new Date().toISOString();
      const updatedBy = user?.id ?? null;

      const updates: Array<Promise<{ error: unknown }>> = [];
      const upd = (key: string, value: unknown) =>
        supabase
          .from('platform_policies')
          .update({
            value: value as never,
            updated_by: updatedBy,
            updated_at: now,
          })
          .eq('policy_key', key)
          .eq('scope_type', 'global') as unknown as Promise<{ error: unknown }>;

      updates.push(upd(POLICY_KEYS.RISK_TIERS, working.riskTiers));
      updates.push(upd(POLICY_KEYS.SUPPLY_SOURCES, working.supplySources));
      updates.push(upd(POLICY_KEYS.COMPENSATION, working.compensationModel));
      updates.push(upd(POLICY_KEYS.FAILED_RECOVERY, working.failedRecovery));

      const results = await Promise.all(updates);
      const firstErr = results.find((r) => r.error);
      if (firstErr?.error) {
        const msg =
          typeof firstErr.error === 'object' &&
          firstErr.error !== null &&
          'message' in firstErr.error
            ? String((firstErr.error as { message: unknown }).message)
            : String(firstErr.error);
        throw new Error(msg);
      }

      setLoaded(working);
      toast.success('Save policy. Takes effect on next quest sourcing. Zero deploy required.');
    } catch (e) {
      toast.error(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="mt-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mt-6">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Failed to load policy</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (rows.size < 4) {
    return (
      <Alert className="mt-6">
        <Database className="h-4 w-4" />
        <AlertTitle>Policy not seeded</AlertTitle>
        <AlertDescription>
          Expected 4 rows under <code>pde.quests.*</code>, found {rows.size}.
          Apply migration{' '}
          <code>20260518_pde_cluster_d_quests_supply_policies.sql</code>.
        </AlertDescription>
      </Alert>
    );
  }

  if (!working) return null;

  const isSourceChecked = (s: SupplySource) =>
    working.supplySources.includes(s);

  const toggleSource = (s: SupplySource, on: boolean) => {
    const next = on
      ? Array.from(new Set([...working.supplySources, s]))
      : working.supplySources.filter((x) => x !== s);
    setWorking({ ...working, supplySources: next });
  };

  return (
    <div className="mt-6 space-y-6">
      <Alert>
        <Database className="h-4 w-4" />
        <AlertTitle>PDE Quests & Supply</AlertTitle>
        <AlertDescription>
          These four policies govern how PDE quests are sourced, classified by
          risk, who supplies them, how contributors are compensated, and what
          happens when a learner fails a real-world quest. Every change takes
          effect on the next quest sourcing run. No deploy required.
        </AlertDescription>
      </Alert>

      {/* ----- Risk tiers ----- */}
      <Card>
        <CardHeader>
          <CardTitle>Risk tiers</CardTitle>
          <CardDescription>
            Key: <code className="text-xs">pde.quests.risk_tiers</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              checked={working.riskTiers.enabled}
              onCheckedChange={(v) =>
                setWorking({
                  ...working,
                  riskTiers: { ...working.riskTiers, enabled: v },
                })
              }
              disabled={saving}
            />
            <Label className="text-sm">
              {working.riskTiers.enabled ? 'Tiers enabled' : 'Tiers disabled'}
            </Label>
          </div>

          {working.riskTiers.enabled && (
            <div className="space-y-3 border-t pt-4">
              <div className="space-y-2">
                <Label className="text-xs">Default tier for new quests</Label>
                <RadioGroup
                  value={working.riskTiers.default_tier}
                  onValueChange={(v) =>
                    setWorking({
                      ...working,
                      riskTiers: {
                        ...working.riskTiers,
                        default_tier: v as RiskTier,
                      },
                    })
                  }
                  disabled={saving}
                  className="flex gap-4"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="experimental" id="tier-experimental" />
                    <Label htmlFor="tier-experimental" className="text-sm cursor-pointer">
                      Experimental
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="production" id="tier-production" />
                    <Label htmlFor="tier-production" className="text-sm cursor-pointer">
                      Production
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Production eligibility rule</Label>
                <p className="text-xs text-muted-foreground">
                  Learners earn production-tier access{' '}
                  <code className="text-[10px]">
                    {working.riskTiers.production_eligibility}
                  </code>
                  . Default: after 2 successful experimental-tier passes.
                </p>
              </div>
            </div>
          )}

          <p className="text-xs italic text-muted-foreground">
            <strong>
              Risk tiers protect the trust pipeline with Solutions Departments.
            </strong>{' '}
            experimental = expected to be educational, failure OK. production =
            must deliver, learners only access after 2 experimental passes.{' '}
            <strong>
              Disabling tiers means departments may stop contributing when
              learners fail.
            </strong>
          </p>
        </CardContent>
      </Card>

      {/* ----- Supply sources ----- */}
      <Card>
        <CardHeader>
          <CardTitle>Supply sources</CardTitle>
          <CardDescription>
            Key: <code className="text-xs">pde.quests.supply_sources</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <SourceCheckbox
            id="src-internal"
            label="Internal departments (44 JKKN Solutions Depts)"
            help="30-40 quests/month cap. Primary source."
            checked={isSourceChecked('internal_departments')}
            onChange={(v) => toggleSource('internal_departments', v)}
            disabled={saving}
          />
          <SourceCheckbox
            id="src-industry"
            label="Industry partners"
            help="External companies bringing real-world problems."
            checked={isSourceChecked('industry_partners')}
            onChange={(v) => toggleSource('industry_partners', v)}
            disabled={saving}
          />
          <SourceCheckbox
            id="src-alumni"
            label="Alumni-led"
            help="Problems sourced from the alumni network."
            checked={isSourceChecked('alumni_led')}
            onChange={(v) => toggleSource('alumni_led', v)}
            disabled={saving}
          />
          <SourceCheckbox
            id="src-student"
            label="Student-proposed"
            help="Learner-curated, faculty-vetted before publishing."
            checked={isSourceChecked('student_proposed')}
            onChange={(v) => toggleSource('student_proposed', v)}
            disabled={saving}
          />

          <p className="text-xs italic text-muted-foreground">
            <strong>
              Multiple supply sources scale quest availability beyond the
              30-40/month internal cap.
            </strong>{' '}
            internal_departments = 44 Solutions Depts. industry_partners =
            external companies. alumni_led = alumni network. student_proposed =
            learner-curated, faculty-vetted. Uncheck a source to remove that
            pipeline.
          </p>

          {!supplyValid && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                At least one supply source must be enabled.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* ----- Compensation model ----- */}
      <Card>
        <CardHeader>
          <CardTitle>Compensation model</CardTitle>
          <CardDescription>
            Key: <code className="text-xs">pde.quests.compensation_model</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            value={working.compensationModel}
            onValueChange={(v) =>
              setWorking({
                ...working,
                compensationModel: v as CompensationModel,
              })
            }
            disabled={saving}
            className="space-y-2"
          >
            <ModeOption
              id="comp-reciprocal"
              value="reciprocal_credit"
              label="Reciprocal credit (recommended)"
              help="Contributors get priority access to PDE-graduate intern support — mutually beneficial loop."
            />
            <ModeOption
              id="comp-voluntary"
              value="voluntary_recognition"
              label="Voluntary recognition"
              help="Contributors listed publicly only, no compensation."
            />
            <ModeOption
              id="comp-honorarium"
              value="honorarium_per_quest"
              label="Honorarium per quest"
              help="Cash compensation per quest used — adds budget line that scales with adoption."
            />
          </RadioGroup>

          <p className="text-xs italic text-muted-foreground">
            <strong>Reciprocal credit (recommended)</strong>: departments who
            contribute quests get priority access to PDE-graduate interns.
            Mutually beneficial loop. <strong>Voluntary recognition</strong>:
            only public listing, no compensation. <strong>Honorarium</strong>:
            cash per quest used — adds budget line scaling with adoption.
          </p>
        </CardContent>
      </Card>

      {/* ----- Failed quest recovery ----- */}
      <Card>
        <CardHeader>
          <CardTitle>Failed quest recovery</CardTitle>
          <CardDescription>
            Key:{' '}
            <code className="text-xs">pde.quests.failed_quest_recovery</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">Recovery mode</Label>
            <RadioGroup
              value={working.failedRecovery.mode}
              onValueChange={() => {
                /* single-option for now */
              }}
              disabled={saving}
              className="space-y-2"
            >
              <div className="flex items-start gap-3 rounded-md border p-3">
                <RadioGroupItem
                  value="department_set_risk_tiers"
                  id="recovery-dept-tiers"
                  className="mt-1"
                />
                <div className="space-y-0.5">
                  <Label
                    htmlFor="recovery-dept-tiers"
                    className="text-sm font-medium cursor-pointer"
                  >
                    Department-set risk tiers (recommended)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Failure handling depends on the tier the contributor chose
                    for the quest.
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>

          <div className="flex items-center gap-3 border-t pt-4">
            <Switch
              checked={working.failedRecovery.faculty_recovery_enabled}
              onCheckedChange={(v) =>
                setWorking({
                  ...working,
                  failedRecovery: {
                    ...working.failedRecovery,
                    faculty_recovery_enabled: v,
                  },
                })
              }
              disabled={saving}
            />
            <Label className="text-sm">
              Faculty recovery enabled (default OFF)
            </Label>
          </div>

          <p className="text-xs italic text-muted-foreground">
            <strong>Department-set risk tiers (recommended)</strong>: failure
            handling depends on tier the contributor chose for the quest.{' '}
            <strong>Faculty recovery enabled</strong>: faculty completes
            deliverable when learner fails — preserves trust but burns faculty
            time. Default OFF to keep learner accountability intact.
          </p>
        </CardContent>
      </Card>

      {/* ----- Save bar ----- */}
      <div className="flex items-center justify-end gap-2 border-t pt-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={revert}
          disabled={!dirty || saving}
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1" />
          Revert
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={!canSave}>
          <Save className="h-3.5 w-3.5 mr-1" />
          {saving ? 'Saving…' : 'Save policy'}
        </Button>
      </div>
    </div>
  );
}
