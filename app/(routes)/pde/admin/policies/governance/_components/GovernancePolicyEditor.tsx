'use client';

// =====================================================================
// PDE Cluster E — Gamification & Defense Policy Editor
// =====================================================================
// Edits 4 platform_policies rows under pde.governance.* (scope=global).
//   - pde.governance.agency_gaming_defense       (object: mode + audit_sample_rate)
//   - pde.governance.feedback_identity_policy    (object: mode + moderator_role)
//   - pde.governance.placement_signal_response   (enum)
//   - pde.governance.framework_branding          (enum)
//
// Pattern mirrors /pde/admin/policies/scoring/_components/ScoringPolicyEditor.tsx,
// adapted for the 4 governance keys. Global-scope (no institution selector,
// no draft/publish — flat save). When per-institution overrides are
// introduced, this page can swap to PolicyEditorShell.
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
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { createClientSupabaseClient } from '@/lib/supabase/client';

// ---------------------------------------------------------------------------
// Types & defaults
// ---------------------------------------------------------------------------

export type GamingDefenseMode =
  | 'judgment_of_judgment_audit'
  | 'relative_percentile'
  | 'rotating_metrics';

export interface AgencyGamingDefense {
  mode: GamingDefenseMode;
  audit_sample_rate: number;
}

export type FeedbackIdentityMode =
  | 'attributed_moderated'
  | 'fully_anonymous'
  | 'fully_attributed';

export interface FeedbackIdentityPolicy {
  mode: FeedbackIdentityMode;
  moderator_role: string;
}

export type PlacementSignalResponse =
  | 'active_briefing'
  | 'wait_2_cycles'
  | 'scope_reduction';

export type FrameworkBranding =
  | 'attribution_and_claim'
  | 'cite_only'
  | 'original_synthesis';

interface PolicyRowRaw {
  id: string;
  policy_key: string;
  value: unknown;
}

interface GovernancePolicyState {
  gamingDefense: AgencyGamingDefense;
  feedbackIdentity: FeedbackIdentityPolicy;
  placementResponse: PlacementSignalResponse;
  framework: FrameworkBranding;
}

const DEFAULT_STATE: GovernancePolicyState = {
  gamingDefense: {
    mode: 'judgment_of_judgment_audit',
    audit_sample_rate: 0.1,
  },
  feedbackIdentity: {
    mode: 'attributed_moderated',
    moderator_role: 'faculty',
  },
  placementResponse: 'active_briefing',
  framework: 'attribution_and_claim',
};

const POLICY_KEYS = {
  GAMING_DEFENSE: 'pde.governance.agency_gaming_defense',
  FEEDBACK_IDENTITY: 'pde.governance.feedback_identity_policy',
  PLACEMENT_RESPONSE: 'pde.governance.placement_signal_response',
  FRAMEWORK: 'pde.governance.framework_branding',
} as const;

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

function asNum(raw: unknown, fallback: number): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}
function asStr(raw: unknown, fallback: string): string {
  return typeof raw === 'string' && raw.length > 0 ? raw : fallback;
}

function parseGamingDefense(raw: unknown): AgencyGamingDefense {
  const obj = (raw || {}) as Partial<AgencyGamingDefense>;
  const validModes: GamingDefenseMode[] = [
    'judgment_of_judgment_audit',
    'relative_percentile',
    'rotating_metrics',
  ];
  const mode: GamingDefenseMode = validModes.includes(obj.mode as GamingDefenseMode)
    ? (obj.mode as GamingDefenseMode)
    : DEFAULT_STATE.gamingDefense.mode;
  return {
    mode,
    audit_sample_rate: asNum(
      obj.audit_sample_rate,
      DEFAULT_STATE.gamingDefense.audit_sample_rate,
    ),
  };
}

function parseFeedbackIdentity(raw: unknown): FeedbackIdentityPolicy {
  const obj = (raw || {}) as Partial<FeedbackIdentityPolicy>;
  const validModes: FeedbackIdentityMode[] = [
    'attributed_moderated',
    'fully_anonymous',
    'fully_attributed',
  ];
  const mode: FeedbackIdentityMode = validModes.includes(obj.mode as FeedbackIdentityMode)
    ? (obj.mode as FeedbackIdentityMode)
    : DEFAULT_STATE.feedbackIdentity.mode;
  return {
    mode,
    moderator_role: asStr(obj.moderator_role, DEFAULT_STATE.feedbackIdentity.moderator_role),
  };
}

function parsePlacement(raw: unknown): PlacementSignalResponse {
  const validModes: PlacementSignalResponse[] = [
    'active_briefing',
    'wait_2_cycles',
    'scope_reduction',
  ];
  return validModes.includes(raw as PlacementSignalResponse)
    ? (raw as PlacementSignalResponse)
    : DEFAULT_STATE.placementResponse;
}

function parseFramework(raw: unknown): FrameworkBranding {
  const validModes: FrameworkBranding[] = [
    'attribution_and_claim',
    'cite_only',
    'original_synthesis',
  ];
  return validModes.includes(raw as FrameworkBranding)
    ? (raw as FrameworkBranding)
    : DEFAULT_STATE.framework;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GovernancePolicyEditor() {
  const [rows, setRows] = useState<Map<string, PolicyRowRaw>>(new Map());
  const [loaded, setLoaded] = useState<GovernancePolicyState | null>(null);
  const [working, setWorking] = useState<GovernancePolicyState | null>(null);
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
          POLICY_KEYS.GAMING_DEFENSE,
          POLICY_KEYS.FEEDBACK_IDENTITY,
          POLICY_KEYS.PLACEMENT_RESPONSE,
          POLICY_KEYS.FRAMEWORK,
        ])
        .eq('scope_type', 'global');
      if (fetchErr) throw fetchErr;

      const map = new Map<string, PolicyRowRaw>();
      const raw = (data || []) as unknown as PolicyRowRaw[];
      for (const r of raw) map.set(r.policy_key, r);
      setRows(map);

      const next: GovernancePolicyState = {
        gamingDefense: parseGamingDefense(map.get(POLICY_KEYS.GAMING_DEFENSE)?.value),
        feedbackIdentity: parseFeedbackIdentity(
          map.get(POLICY_KEYS.FEEDBACK_IDENTITY)?.value,
        ),
        placementResponse: parsePlacement(map.get(POLICY_KEYS.PLACEMENT_RESPONSE)?.value),
        framework: parseFramework(map.get(POLICY_KEYS.FRAMEWORK)?.value),
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

  const auditRateValid = useMemo(() => {
    if (!working) return false;
    const r = working.gamingDefense.audit_sample_rate;
    return Number.isFinite(r) && r >= 0 && r <= 1;
  }, [working]);

  const dirty = useMemo(() => {
    if (!loaded || !working) return false;
    return JSON.stringify(loaded) !== JSON.stringify(working);
  }, [loaded, working]);

  const canSave = dirty && auditRateValid && !saving;

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

      updates.push(upd(POLICY_KEYS.GAMING_DEFENSE, working.gamingDefense));
      updates.push(upd(POLICY_KEYS.FEEDBACK_IDENTITY, working.feedbackIdentity));
      updates.push(upd(POLICY_KEYS.PLACEMENT_RESPONSE, working.placementResponse));
      updates.push(upd(POLICY_KEYS.FRAMEWORK, working.framework));

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
      toast.success(
        'Policy updated. Takes effect on next reporting cycle. Zero deploy required.',
      );
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
          Expected 4 rows under <code>pde.governance.*</code>, found {rows.size}.
          Apply migration{' '}
          <code>20260518112603_pde_cluster_e_governance_defense_policies.sql</code>.
        </AlertDescription>
      </Alert>
    );
  }

  if (!working) return null;

  return (
    <div className="mt-6 space-y-6">
      <Alert>
        <Database className="h-4 w-4" />
        <AlertTitle>PDE Gamification & Defense</AlertTitle>
        <AlertDescription>
          These four policies govern how the system defends against gaming the
          Agency Index, how 360-degree leadership feedback identity is handled,
          how to respond to year-1 placement signals, and how the 7-category
          framework is publicly attributed. Every change takes effect on the
          next reporting cycle. No deploy required.
        </AlertDescription>
      </Alert>

      {/* ----- E1: Agency gaming defense ----- */}
      <Card>
        <CardHeader>
          <CardTitle>Agency-gaming defense</CardTitle>
          <CardDescription>
            Key:{' '}
            <code className="text-xs">pde.governance.agency_gaming_defense</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            value={working.gamingDefense.mode}
            onValueChange={(v) =>
              setWorking({
                ...working,
                gamingDefense: {
                  ...working.gamingDefense,
                  mode: v as GamingDefenseMode,
                },
              })
            }
            disabled={saving}
            className="space-y-2"
          >
            <ModeOption
              id="defense-audit"
              value="judgment_of_judgment_audit"
              label="Judgment-of-judgment audit (recommended)"
              help="Faculty randomly audits a sample of student AI modifications to check depth."
            />
            <ModeOption
              id="defense-percentile"
              value="relative_percentile"
              label="Relative percentile"
              help="Score becomes rank within cohort — gaming raises the bar for everyone."
            />
            <ModeOption
              id="defense-rotating"
              value="rotating_metrics"
              label="Rotating metrics"
              help="Optimization target moves annually — strongest gaming defense; harder cross-cohort comparison."
            />
          </RadioGroup>

          <div className="max-w-xs space-y-1 border-t pt-4">
            <Label className="text-xs">Audit sample rate (0.00 – 1.00)</Label>
            <Input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={working.gamingDefense.audit_sample_rate}
              onChange={(e) => {
                const n = Number(e.target.value);
                const clamped = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
                setWorking({
                  ...working,
                  gamingDefense: {
                    ...working.gamingDefense,
                    audit_sample_rate: clamped,
                  },
                });
              }}
              disabled={saving}
            />
          </div>

          <p className="text-xs italic text-muted-foreground">
            <strong>Judgment-of-judgment audit (recommended)</strong>: faculty
            randomly audits a sample of student AI modifications to check depth.
            Sample rate 0.1 = audit 1 in 10 modifications. Lower for less faculty
            load, higher for tighter gaming defense.{' '}
            <strong>Relative percentile</strong>: score becomes rank within
            cohort — gaming raises bar for everyone.{' '}
            <strong>Rotating metrics</strong>: optimization target moves annually
            — strongest gaming defense but harder cross-cohort comparison.
          </p>
        </CardContent>
      </Card>

      {/* ----- E2: Feedback identity policy ----- */}
      <Card>
        <CardHeader>
          <CardTitle>360 feedback identity policy</CardTitle>
          <CardDescription>
            Key:{' '}
            <code className="text-xs">pde.governance.feedback_identity_policy</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            value={working.feedbackIdentity.mode}
            onValueChange={(v) =>
              setWorking({
                ...working,
                feedbackIdentity: {
                  ...working.feedbackIdentity,
                  mode: v as FeedbackIdentityMode,
                },
              })
            }
            disabled={saving}
            className="space-y-2"
          >
            <ModeOption
              id="feedback-moderated"
              value="attributed_moderated"
              label="Attributed + moderated (recommended)"
              help="Attributed but faculty reviews before it enters the record. Bias caught, identity available if challenged."
            />
            <ModeOption
              id="feedback-anonymous"
              value="fully_anonymous"
              label="Fully anonymous"
              help="Maximizes honesty but unverifiable — bullying risk."
            />
            <ModeOption
              id="feedback-attributed"
              value="fully_attributed"
              label="Fully attributed"
              help="Maximizes accountability with self-censorship risk."
            />
          </RadioGroup>

          <div className="max-w-xs space-y-1 border-t pt-4">
            <Label className="text-xs">Moderator role (when moderated)</Label>
            <Input
              type="text"
              value={working.feedbackIdentity.moderator_role}
              onChange={(e) =>
                setWorking({
                  ...working,
                  feedbackIdentity: {
                    ...working.feedbackIdentity,
                    moderator_role: e.target.value,
                  },
                })
              }
              disabled={saving}
              placeholder="faculty"
            />
          </div>

          <p className="text-xs italic text-muted-foreground">
            <strong>Attributed + moderated (recommended)</strong>: 360 feedback
            is attributed but faculty reviews before it enters the record. Bias
            caught, identity available if challenged.{' '}
            <strong>Anonymous</strong> maximizes honesty but unverifiable —
            bullying risk. <strong>Fully attributed</strong> maximizes
            accountability with self-censorship risk.
          </p>
        </CardContent>
      </Card>

      {/* ----- E3: Placement signal response ----- */}
      <Card>
        <CardHeader>
          <CardTitle>Year-1 placement signal response</CardTitle>
          <CardDescription>
            Key:{' '}
            <code className="text-xs">pde.governance.placement_signal_response</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            value={working.placementResponse}
            onValueChange={(v) =>
              setWorking({
                ...working,
                placementResponse: v as PlacementSignalResponse,
              })
            }
            disabled={saving}
            className="space-y-2"
          >
            <ModeOption
              id="placement-active"
              value="active_briefing"
              label="Active briefing (recommended)"
              help="Director outreach to 30-50 recruiters, treat as recognition investment."
            />
            <ModeOption
              id="placement-wait"
              value="wait_2_cycles"
              label="Wait 2 cycles"
              help="Patience; employer recognition lags 18-24mo."
            />
            <ModeOption
              id="placement-scope"
              value="scope_reduction"
              label="Scope reduction"
              help="If placement same/lower than peers, pull back PDE scope."
            />
          </RadioGroup>

          <p className="text-xs italic text-muted-foreground">
            <strong>Active briefing (recommended)</strong>: when year-1 placement
            signal is weak, Director briefs 30-50 recruiters on what PDE
            certificates mean. Treat as recognition investment.{' '}
            <strong>Wait 2 cycles</strong>: passive, employer recognition lags
            18-24mo. <strong>Scope reduction</strong>: pull back PDE if signal
            is concerning.
          </p>
        </CardContent>
      </Card>

      {/* ----- E4: Framework branding ----- */}
      <Card>
        <CardHeader>
          <CardTitle>Framework branding</CardTitle>
          <CardDescription>
            Key:{' '}
            <code className="text-xs">pde.governance.framework_branding</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            value={working.framework}
            onValueChange={(v) =>
              setWorking({ ...working, framework: v as FrameworkBranding })
            }
            disabled={saving}
            className="space-y-2"
          >
            <ModeOption
              id="framework-attribution"
              value="attribution_and_claim"
              label="Attribution + claim (recommended)"
              help={'"Synthesized at JKKN, drawing on Fink, OECD, and NEP." Credits the field while owning the contribution.'}
            />
            <ModeOption
              id="framework-cite"
              value="cite_only"
              label="Cite only"
              help="Academic-conservative, loses thought-leader positioning."
            />
            <ModeOption
              id="framework-original"
              value="original_synthesis"
              label="Original synthesis"
              help="High scrutiny risk, high reward if it holds."
            />
          </RadioGroup>

          <p className="text-xs italic text-muted-foreground">
            <strong>Attribution + claim (recommended)</strong>: &ldquo;Synthesized
            at JKKN, drawing on Fink, OECD, and NEP.&rdquo; Credits the field
            while owning the contribution. <strong>Cite only</strong>:
            academic-conservative, loses thought-leader positioning.{' '}
            <strong>Original synthesis</strong>: high scrutiny risk, high reward
            if it holds.
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
          {saving ? 'Saving…' : 'Save policy. Takes effect on next reporting cycle. Zero deploy required.'}
        </Button>
      </div>

      {dirty && !auditRateValid && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Audit sample rate must be between 0.00 and 1.00.
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
