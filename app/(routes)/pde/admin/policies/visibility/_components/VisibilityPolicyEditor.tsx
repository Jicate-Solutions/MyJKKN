'use client';

// =====================================================================
// PDE Cluster B — Visibility & Transparency Policy Editor
// =====================================================================
// Edits 4 platform_policies rows under pde.visibility.* (scope=global).
//   - pde.visibility.agency_index_mode             (enum: live | semester_end | live_coarse)
//   - pde.visibility.cohort_comparison_scope       (enum: institution_wide | deans_only | aggregated_only)
//   - pde.visibility.capability_versioning_policy  (object: mode + show_version_tag + expire_after_years)
//   - pde.visibility.individual_metric_display     (object: show_numeric_score + show_percentile + show_audit_trail)
//
// Pattern mirrors /pde/admin/policies/scoring/_components/ScoringPolicyEditor.tsx,
// adapted for the visibility cluster. When per-institution overrides are
// introduced, this page can swap to PolicyEditorShell.
// =====================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Database, Eye, RotateCcw, Save } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { createClientSupabaseClient } from '@/lib/supabase/client';

// ---------------------------------------------------------------------------
// Types & defaults
// ---------------------------------------------------------------------------

export type AgencyIndexMode = 'live' | 'semester_end' | 'live_coarse';

export type CohortComparisonScope =
  | 'institution_wide'
  | 'deans_only'
  | 'aggregated_only';

export type CapabilityVersioningMode =
  | 'grandfather_with_upgrade'
  | 'auto_expire'
  | 'version_tag_only';

export interface CapabilityVersioningPolicy {
  mode: CapabilityVersioningMode;
  show_version_tag: boolean;
  expire_after_years: number | null;
}

export interface IndividualMetricDisplay {
  show_numeric_score: boolean;
  show_percentile: boolean;
  show_audit_trail: boolean;
}

interface PolicyRowRaw {
  id: string;
  policy_key: string;
  value: unknown;
}

interface VisibilityPolicyState {
  agencyIndexMode: AgencyIndexMode;
  cohortComparisonScope: CohortComparisonScope;
  capabilityVersioning: CapabilityVersioningPolicy;
  individualMetricDisplay: IndividualMetricDisplay;
}

const DEFAULT_STATE: VisibilityPolicyState = {
  agencyIndexMode: 'live',
  cohortComparisonScope: 'institution_wide',
  capabilityVersioning: {
    mode: 'grandfather_with_upgrade',
    show_version_tag: true,
    expire_after_years: null,
  },
  individualMetricDisplay: {
    show_numeric_score: true,
    show_percentile: true,
    show_audit_trail: true,
  },
};

const POLICY_KEYS = {
  AGENCY_INDEX_MODE: 'pde.visibility.agency_index_mode',
  COHORT_COMPARISON: 'pde.visibility.cohort_comparison_scope',
  CAPABILITY_VERSIONING: 'pde.visibility.capability_versioning_policy',
  INDIVIDUAL_METRICS: 'pde.visibility.individual_metric_display',
} as const;

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

function asBool(raw: unknown, fallback: boolean): boolean {
  return typeof raw === 'boolean' ? raw : fallback;
}

function asString(raw: unknown, fallback: string): string {
  return typeof raw === 'string' ? raw : fallback;
}

function asNullableNum(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

function parseAgencyIndexMode(raw: unknown): AgencyIndexMode {
  const valid: AgencyIndexMode[] = ['live', 'semester_end', 'live_coarse'];
  const v = asString(raw, DEFAULT_STATE.agencyIndexMode);
  return (valid as string[]).includes(v) ? (v as AgencyIndexMode) : DEFAULT_STATE.agencyIndexMode;
}

function parseCohortScope(raw: unknown): CohortComparisonScope {
  const valid: CohortComparisonScope[] = [
    'institution_wide',
    'deans_only',
    'aggregated_only',
  ];
  const v = asString(raw, DEFAULT_STATE.cohortComparisonScope);
  return (valid as string[]).includes(v)
    ? (v as CohortComparisonScope)
    : DEFAULT_STATE.cohortComparisonScope;
}

function parseCapabilityVersioning(raw: unknown): CapabilityVersioningPolicy {
  const obj = (raw || {}) as Partial<CapabilityVersioningPolicy>;
  const validModes: CapabilityVersioningMode[] = [
    'grandfather_with_upgrade',
    'auto_expire',
    'version_tag_only',
  ];
  const mode: CapabilityVersioningMode = (validModes as string[]).includes(
    obj.mode as string,
  )
    ? (obj.mode as CapabilityVersioningMode)
    : DEFAULT_STATE.capabilityVersioning.mode;
  return {
    mode,
    show_version_tag: asBool(
      obj.show_version_tag,
      DEFAULT_STATE.capabilityVersioning.show_version_tag,
    ),
    expire_after_years: asNullableNum(obj.expire_after_years),
  };
}

function parseIndividualMetricDisplay(raw: unknown): IndividualMetricDisplay {
  const obj = (raw || {}) as Partial<IndividualMetricDisplay>;
  return {
    show_numeric_score: asBool(
      obj.show_numeric_score,
      DEFAULT_STATE.individualMetricDisplay.show_numeric_score,
    ),
    show_percentile: asBool(
      obj.show_percentile,
      DEFAULT_STATE.individualMetricDisplay.show_percentile,
    ),
    show_audit_trail: asBool(
      obj.show_audit_trail,
      DEFAULT_STATE.individualMetricDisplay.show_audit_trail,
    ),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VisibilityPolicyEditor() {
  const [rows, setRows] = useState<Map<string, PolicyRowRaw>>(new Map());
  const [loaded, setLoaded] = useState<VisibilityPolicyState | null>(null);
  const [working, setWorking] = useState<VisibilityPolicyState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Load all 4 rows at mount.
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClientSupabaseClient();
      const { data, error: fetchErr } = await supabase
        .from('platform_policies')
        .select('id, policy_key, value')
        .in('policy_key', [
          POLICY_KEYS.AGENCY_INDEX_MODE,
          POLICY_KEYS.COHORT_COMPARISON,
          POLICY_KEYS.CAPABILITY_VERSIONING,
          POLICY_KEYS.INDIVIDUAL_METRICS,
        ])
        .eq('scope_type', 'global');
      if (fetchErr) throw fetchErr;

      const map = new Map<string, PolicyRowRaw>();
      const raw = (data || []) as unknown as PolicyRowRaw[];
      for (const r of raw) map.set(r.policy_key, r);
      setRows(map);

      const next: VisibilityPolicyState = {
        agencyIndexMode: parseAgencyIndexMode(map.get(POLICY_KEYS.AGENCY_INDEX_MODE)?.value),
        cohortComparisonScope: parseCohortScope(
          map.get(POLICY_KEYS.COHORT_COMPARISON)?.value,
        ),
        capabilityVersioning: parseCapabilityVersioning(
          map.get(POLICY_KEYS.CAPABILITY_VERSIONING)?.value,
        ),
        individualMetricDisplay: parseIndividualMetricDisplay(
          map.get(POLICY_KEYS.INDIVIDUAL_METRICS)?.value,
        ),
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

  // auto_expire mode requires a positive expire_after_years value
  const versioningValid = useMemo(() => {
    if (!working) return false;
    if (working.capabilityVersioning.mode === 'auto_expire') {
      const n = working.capabilityVersioning.expire_after_years;
      return typeof n === 'number' && n > 0;
    }
    return true;
  }, [working]);

  const canSave = dirty && versioningValid && !saving;

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

      // 4 parallel updates keyed by policy_key + scope_type=global.
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

      // For enum policies, value is the bare string (stored as jsonb string).
      updates.push(upd(POLICY_KEYS.AGENCY_INDEX_MODE, working.agencyIndexMode));
      updates.push(upd(POLICY_KEYS.COHORT_COMPARISON, working.cohortComparisonScope));
      updates.push(upd(POLICY_KEYS.CAPABILITY_VERSIONING, working.capabilityVersioning));
      updates.push(upd(POLICY_KEYS.INDIVIDUAL_METRICS, working.individualMetricDisplay));

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
      toast.success('Save policy. Takes effect on next learner view. Zero deploy required.');
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
          Expected 4 rows under <code>pde.visibility.*</code>, found {rows.size}.
          Apply migration <code>20260518_pde_cluster_b_visibility_transparency_policies.sql</code>.
        </AlertDescription>
      </Alert>
    );
  }

  if (!working) return null;

  return (
    <div className="mt-6 space-y-6">
      <Alert>
        <Eye className="h-4 w-4" />
        <AlertTitle>PDE Visibility & Transparency</AlertTitle>
        <AlertDescription>
          These four policies govern when learners see their Agency Index, how
          inter-college comparisons are scoped, how capability certifications
          age as definitions evolve, and what each learner sees about their own
          metrics. Every change takes effect on the next learner view. No
          deploy required.
        </AlertDescription>
      </Alert>

      {/* ----- B1: Agency Index mode ----- */}
      <Card>
        <CardHeader>
          <CardTitle>Agency Index visibility mode</CardTitle>
          <CardDescription>
            Key: <code className="text-xs">pde.visibility.agency_index_mode</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            value={working.agencyIndexMode}
            onValueChange={(v) =>
              setWorking({ ...working, agencyIndexMode: v as AgencyIndexMode })
            }
            disabled={saving}
            className="space-y-2"
          >
            <ModeOption
              id="aim-live"
              value="live"
              label="Live mode (recommended)"
              help="Real-time score with full audit trail — fastest self-correction loop."
            />
            <ModeOption
              id="aim-semester-end"
              value="semester_end"
              label="Semester-end mode"
              help="Score hidden until semester close — prevents shallow gaming but removes feedback loop."
            />
            <ModeOption
              id="aim-live-coarse"
              value="live_coarse"
              label="Live-coarse mode"
              help="Traffic-light status only (on-track / attention / concerning), no precise number."
            />
          </RadioGroup>

          <p className="text-xs italic text-muted-foreground">
            <strong>Live mode</strong> shows learners their Agency Index in real
            time with full audit trail — fastest self-correction loop, aligned
            with &apos;humans as Principals&apos;. <strong>Semester-end mode</strong> hides
            the score until close — prevents shallow gaming but removes the
            feedback loop. <strong>Live-coarse</strong> shows only traffic-light
            status — middle path.
          </p>
        </CardContent>
      </Card>

      {/* ----- B2: Cohort comparison scope ----- */}
      <Card>
        <CardHeader>
          <CardTitle>Cohort comparison scope</CardTitle>
          <CardDescription>
            Key: <code className="text-xs">pde.visibility.cohort_comparison_scope</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            value={working.cohortComparisonScope}
            onValueChange={(v) =>
              setWorking({
                ...working,
                cohortComparisonScope: v as CohortComparisonScope,
              })
            }
            disabled={saving}
            className="space-y-2"
          >
            <ModeOption
              id="ccs-institution-wide"
              value="institution_wide"
              label="Institution-wide"
              help="Faculty and learners see per-college Agency Index averages."
            />
            <ModeOption
              id="ccs-deans-only"
              value="deans_only"
              label="Deans only"
              help="Inter-college comparison restricted to deans and Director."
            />
            <ModeOption
              id="ccs-aggregated-only"
              value="aggregated_only"
              label="Aggregated only"
              help="No per-college breakdown anywhere internally — only institution-level rollups."
            />
          </RadioGroup>

          <p className="text-xs italic text-muted-foreground">
            <strong>Institution-wide visibility</strong> means faculty and learners
            see per-college Agency Index averages. Maximum transparency; risk:
            triggers ranking dynamics, lower-scoring colleges feel singled out.{' '}
            <strong>Deans-only</strong> keeps comparison internal to leadership.{' '}
            <strong>Aggregated-only</strong> removes per-college breakdown entirely.
          </p>
        </CardContent>
      </Card>

      {/* ----- B3: Capability versioning ----- */}
      <Card>
        <CardHeader>
          <CardTitle>Capability versioning policy</CardTitle>
          <CardDescription>
            Key: <code className="text-xs">pde.visibility.capability_versioning_policy</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            value={working.capabilityVersioning.mode}
            onValueChange={(v) =>
              setWorking({
                ...working,
                capabilityVersioning: {
                  ...working.capabilityVersioning,
                  mode: v as CapabilityVersioningMode,
                },
              })
            }
            disabled={saving}
            className="space-y-2"
          >
            <ModeOption
              id="cv-grandfather"
              value="grandfather_with_upgrade"
              label="Grandfather with upgrade (recommended)"
              help="Old certificates stay valid forever with version tag; optional re-demonstration offered."
            />
            <ModeOption
              id="cv-auto-expire"
              value="auto_expire"
              label="Auto-expire"
              help="Certificates expire after N years and require re-demonstration. Cleaner signal; devalues original work."
            />
            <ModeOption
              id="cv-version-tag-only"
              value="version_tag_only"
              label="Version tag only"
              help="Old certs valid forever; only the year/version is shown — no upgrade prompt."
            />
          </RadioGroup>

          {working.capabilityVersioning.mode === 'auto_expire' && (
            <div className="max-w-xs space-y-1 border-t pt-4">
              <Label className="text-xs">Expire after (years)</Label>
              <Input
                type="number"
                min={1}
                max={50}
                step={1}
                value={working.capabilityVersioning.expire_after_years ?? ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  const n = raw === '' ? null : Number(raw);
                  const next = n === null || !Number.isFinite(n) ? null : Math.max(1, Math.floor(n));
                  setWorking({
                    ...working,
                    capabilityVersioning: {
                      ...working.capabilityVersioning,
                      expire_after_years: next,
                    },
                  });
                }}
                disabled={saving}
              />
              <p className="text-[11px] text-muted-foreground">
                Required for auto-expire mode. Typical range: 2–5 years.
              </p>
            </div>
          )}

          <div className="flex items-center gap-3 border-t pt-4">
            <Switch
              checked={working.capabilityVersioning.show_version_tag}
              onCheckedChange={(v) =>
                setWorking({
                  ...working,
                  capabilityVersioning: {
                    ...working.capabilityVersioning,
                    show_version_tag: v,
                  },
                })
              }
              disabled={saving}
            />
            <Label className="text-sm">
              Show version tag on certificates
            </Label>
          </div>

          <p className="text-xs italic text-muted-foreground">
            <strong>Grandfather with upgrade (recommended)</strong>: old
            certificates stay valid forever with version tag, offer optional
            re-demonstration. Respects past work, signals freshness.{' '}
            <strong>Auto-expire</strong> forces re-demonstration after N years —
            cleaner signal but devalues original work.{' '}
            <strong>Version tag only</strong> keeps certs valid forever with year visible.
          </p>
        </CardContent>
      </Card>

      {/* ----- B4: Individual metric display ----- */}
      <Card>
        <CardHeader>
          <CardTitle>Individual metric display</CardTitle>
          <CardDescription>
            Key: <code className="text-xs">pde.visibility.individual_metric_display</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              checked={working.individualMetricDisplay.show_numeric_score}
              onCheckedChange={(v) =>
                setWorking({
                  ...working,
                  individualMetricDisplay: {
                    ...working.individualMetricDisplay,
                    show_numeric_score: v,
                  },
                })
              }
              disabled={saving}
            />
            <Label className="text-sm">Show numeric score (0–100)</Label>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              checked={working.individualMetricDisplay.show_percentile}
              onCheckedChange={(v) =>
                setWorking({
                  ...working,
                  individualMetricDisplay: {
                    ...working.individualMetricDisplay,
                    show_percentile: v,
                  },
                })
              }
              disabled={saving}
            />
            <Label className="text-sm">Show cohort percentile rank</Label>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              checked={working.individualMetricDisplay.show_audit_trail}
              onCheckedChange={(v) =>
                setWorking({
                  ...working,
                  individualMetricDisplay: {
                    ...working.individualMetricDisplay,
                    show_audit_trail: v,
                  },
                })
              }
              disabled={saving}
            />
            <Label className="text-sm">
              Show audit trail (AI modifications & blind acceptances)
            </Label>
          </div>

          <p className="text-xs italic text-muted-foreground">
            <strong>Show numeric score</strong> = learner sees their Agency Index
            0–100. <strong>Show percentile</strong> = learner sees their cohort rank.{' '}
            <strong>Show audit trail</strong> = learner sees their own log of AI
            modifications and blind acceptances. Turning OFF any of these
            reduces self-awareness signal.
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

      {dirty && !versioningValid && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Auto-expire mode requires a positive &quot;expire after years&quot;
            value before saving.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ModeOption({
  id,
  value,
  label,
  help,
}: {
  id: string;
  value: string;
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
