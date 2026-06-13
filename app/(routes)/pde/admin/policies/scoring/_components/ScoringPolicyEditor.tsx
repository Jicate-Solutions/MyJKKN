'use client';

// =====================================================================
// PDE Cluster A — Scoring & Integrity Policy Editor
// =====================================================================
// Edits 4 platform_policies rows under pde.scoring.* (scope=global).
//   - pde.scoring.demonstration_weights         (object: faculty/peer/ai → sum 100)
//   - pde.scoring.peer_bias_detection_enabled   (boolean)
//   - pde.scoring.validator_audit_threshold     (number 0..1)
//   - pde.scoring.ai_deliverable_credit_policy  (object: mode + min_agency_score + require_disclosure)
//
// Pattern mirrors /hr/admin/policies/_shared/policy-editor-shell.tsx,
// adapted for global-scope (no institution selector, no draft/publish — flat
// save). When per-institution overrides are introduced, this page can swap
// to PolicyEditorShell.
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
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { createClientSupabaseClient } from '@/lib/supabase/client';

// ---------------------------------------------------------------------------
// Types & defaults
// ---------------------------------------------------------------------------

export interface DemonstrationWeights {
  faculty: number;
  peer: number;
  ai: number;
}

export type AiCreditMode =
  | 'full_credit_if_agency_proven'
  | 'reduced_credit_proportional'
  | 'disclosure_required_full_credit';

export interface AiDeliverableCreditPolicy {
  mode: AiCreditMode;
  min_agency_score: number;
  require_disclosure: boolean;
}

interface PolicyRowRaw {
  id: string;
  policy_key: string;
  value: unknown;
}

interface ScoringPolicyState {
  weights: DemonstrationWeights;
  peerBiasEnabled: boolean;
  validatorAuditThreshold: number;
  aiCredit: AiDeliverableCreditPolicy;
}

const DEFAULT_STATE: ScoringPolicyState = {
  weights: { faculty: 50, peer: 30, ai: 20 },
  peerBiasEnabled: true,
  validatorAuditThreshold: 0.95,
  aiCredit: {
    mode: 'full_credit_if_agency_proven',
    min_agency_score: 60,
    require_disclosure: false,
  },
};

const POLICY_KEYS = {
  WEIGHTS: 'pde.scoring.demonstration_weights',
  PEER_BIAS: 'pde.scoring.peer_bias_detection_enabled',
  AUDIT_THRESHOLD: 'pde.scoring.validator_audit_threshold',
  AI_CREDIT: 'pde.scoring.ai_deliverable_credit_policy',
} as const;

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

function asNum(raw: unknown, fallback: number): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}
function asBool(raw: unknown, fallback: boolean): boolean {
  return typeof raw === 'boolean' ? raw : fallback;
}

function parseWeights(raw: unknown): DemonstrationWeights {
  const obj = (raw || {}) as Partial<DemonstrationWeights>;
  return {
    faculty: asNum(obj.faculty, DEFAULT_STATE.weights.faculty),
    peer: asNum(obj.peer, DEFAULT_STATE.weights.peer),
    ai: asNum(obj.ai, DEFAULT_STATE.weights.ai),
  };
}

function parseAiCredit(raw: unknown): AiDeliverableCreditPolicy {
  const obj = (raw || {}) as Partial<AiDeliverableCreditPolicy>;
  const validModes: AiCreditMode[] = [
    'full_credit_if_agency_proven',
    'reduced_credit_proportional',
    'disclosure_required_full_credit',
  ];
  const mode: AiCreditMode = validModes.includes(obj.mode as AiCreditMode)
    ? (obj.mode as AiCreditMode)
    : DEFAULT_STATE.aiCredit.mode;
  return {
    mode,
    min_agency_score: asNum(obj.min_agency_score, DEFAULT_STATE.aiCredit.min_agency_score),
    require_disclosure: asBool(obj.require_disclosure, DEFAULT_STATE.aiCredit.require_disclosure),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScoringPolicyEditor() {
  const [rows, setRows] = useState<Map<string, PolicyRowRaw>>(new Map());
  const [loaded, setLoaded] = useState<ScoringPolicyState | null>(null);
  const [working, setWorking] = useState<ScoringPolicyState | null>(null);
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
          POLICY_KEYS.WEIGHTS,
          POLICY_KEYS.PEER_BIAS,
          POLICY_KEYS.AUDIT_THRESHOLD,
          POLICY_KEYS.AI_CREDIT,
        ])
        .eq('scope_type', 'global');
      if (fetchErr) throw fetchErr;

      const map = new Map<string, PolicyRowRaw>();
      const raw = (data || []) as unknown as PolicyRowRaw[];
      for (const r of raw) map.set(r.policy_key, r);
      setRows(map);

      const next: ScoringPolicyState = {
        weights: parseWeights(map.get(POLICY_KEYS.WEIGHTS)?.value),
        peerBiasEnabled: asBool(
          map.get(POLICY_KEYS.PEER_BIAS)?.value,
          DEFAULT_STATE.peerBiasEnabled,
        ),
        validatorAuditThreshold: asNum(
          map.get(POLICY_KEYS.AUDIT_THRESHOLD)?.value,
          DEFAULT_STATE.validatorAuditThreshold,
        ),
        aiCredit: parseAiCredit(map.get(POLICY_KEYS.AI_CREDIT)?.value),
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

  const weightsSum = useMemo(() => {
    if (!working) return 0;
    return working.weights.faculty + working.weights.peer + working.weights.ai;
  }, [working]);

  const weightsValid = weightsSum === 100;

  const dirty = useMemo(() => {
    if (!loaded || !working) return false;
    return JSON.stringify(loaded) !== JSON.stringify(working);
  }, [loaded, working]);

  const canSave = dirty && weightsValid && !saving;

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

      updates.push(upd(POLICY_KEYS.WEIGHTS, working.weights));
      updates.push(upd(POLICY_KEYS.PEER_BIAS, working.peerBiasEnabled));
      updates.push(upd(POLICY_KEYS.AUDIT_THRESHOLD, working.validatorAuditThreshold));
      updates.push(upd(POLICY_KEYS.AI_CREDIT, working.aiCredit));

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
      toast.success('Policy updated. Takes effect on next demonstration submission. Zero deploy required.');
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
          Expected 4 rows under <code>pde.scoring.*</code>, found {rows.size}.
          Apply migration <code>20260518_pde_cluster_a_scoring_integrity_policies.sql</code>.
        </AlertDescription>
      </Alert>
    );
  }

  if (!working) return null;

  return (
    <div className="mt-6 space-y-6">
      <Alert>
        <Database className="h-4 w-4" />
        <AlertTitle>PDE Scoring & Integrity</AlertTitle>
        <AlertDescription>
          These four policies govern how demonstration gates are scored, how peer
          bias is detected, when faculty get flagged for calibration audits, and
          how AI-built deliverables are credited. Every change takes effect on
          the next demonstration submission. No deploy required.
        </AlertDescription>
      </Alert>

      {/* ----- Demonstration weights ----- */}
      <Card>
        <CardHeader>
          <CardTitle>Demonstration weights</CardTitle>
          <CardDescription>
            Key: <code className="text-xs">pde.scoring.demonstration_weights</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <WeightSlider
            label="Faculty (expert judgment)"
            value={working.weights.faculty}
            onChange={(v) =>
              setWorking({ ...working, weights: { ...working.weights, faculty: v } })
            }
            disabled={saving}
          />
          <WeightSlider
            label="Peer (cohort calibration)"
            value={working.weights.peer}
            onChange={(v) =>
              setWorking({ ...working, weights: { ...working.weights, peer: v } })
            }
            disabled={saving}
          />
          <WeightSlider
            label="AI (technical correctness)"
            value={working.weights.ai}
            onChange={(v) =>
              setWorking({ ...working, weights: { ...working.weights, ai: v } })
            }
            disabled={saving}
          />
          <div
            className={`text-sm font-medium ${
              weightsValid ? 'text-emerald-700' : 'text-destructive'
            }`}
          >
            Sum: {weightsSum} / 100 {weightsValid ? '✓' : '— must equal 100'}
          </div>
          <p className="text-xs italic text-muted-foreground">
            Adjust the three sliders. They must sum to 100.{' '}
            <strong>
              If you raise peer to 50%, scores favor cohort agreement over
              faculty expertise — protects against single-faculty bias but
              hides genuine excellence from peer-group bias.
            </strong>{' '}
            Recommended: keep faculty ≥ 40%.
          </p>
        </CardContent>
      </Card>

      {/* ----- Peer bias detection ----- */}
      <Card>
        <CardHeader>
          <CardTitle>Peer bias detection</CardTitle>
          <CardDescription>
            Key: <code className="text-xs">pde.scoring.peer_bias_detection_enabled</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              checked={working.peerBiasEnabled}
              onCheckedChange={(v) => setWorking({ ...working, peerBiasEnabled: v })}
              disabled={saving}
            />
            <Label className="text-sm">
              {working.peerBiasEnabled ? 'Enabled' : 'Disabled'}
            </Label>
          </div>
          <p className="text-xs italic text-muted-foreground">
            <strong>
              When ON, the system tracks each peer reviewer&apos;s score pattern
              against the cohort average.
            </strong>{' '}
            Reviewers who systematically punish or favor certain student groups
            get flagged for human moderation. Turning OFF lets all peer reviews
            count equally — including any bias they carry.
          </p>
        </CardContent>
      </Card>

      {/* ----- Validator audit threshold ----- */}
      <Card>
        <CardHeader>
          <CardTitle>Validator audit threshold</CardTitle>
          <CardDescription>
            Key: <code className="text-xs">pde.scoring.validator_audit_threshold</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs space-y-1">
            <Label className="text-xs">Approval-rate threshold (0.00 – 1.00)</Label>
            <Input
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={working.validatorAuditThreshold}
              onChange={(e) => {
                const n = Number(e.target.value);
                const clamped = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
                setWorking({ ...working, validatorAuditThreshold: clamped });
              }}
              disabled={saving}
            />
          </div>
          <p className="text-xs italic text-muted-foreground">
            A faculty member who approves more than this fraction of
            demonstrations gets flagged for calibration review.{' '}
            <strong>
              Default 0.95 means: approve 96+ of 100 submissions with no
              rejections → flagged for audit.
            </strong>{' '}
            Lower the threshold for stricter audits.
          </p>
        </CardContent>
      </Card>

      {/* ----- AI deliverable credit ----- */}
      <Card>
        <CardHeader>
          <CardTitle>AI deliverable credit</CardTitle>
          <CardDescription>
            Key: <code className="text-xs">pde.scoring.ai_deliverable_credit_policy</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            value={working.aiCredit.mode}
            onValueChange={(v) =>
              setWorking({
                ...working,
                aiCredit: { ...working.aiCredit, mode: v as AiCreditMode },
              })
            }
            disabled={saving}
            className="space-y-2"
          >
            <ModeOption
              id="mode-full-agency"
              value="full_credit_if_agency_proven"
              label="Full credit if agency proven"
              help="Default. Student gets full credit when their Agency Index ≥ min threshold."
            />
            <ModeOption
              id="mode-reduced"
              value="reduced_credit_proportional"
              label="Reduced credit proportional"
              help="Credit scales with Agency Index — heavier AI use → lower credit."
            />
            <ModeOption
              id="mode-disclosure"
              value="disclosure_required_full_credit"
              label="Disclosure required, full credit"
              help="Students must declare AI use to receive credit; full credit if declared."
            />
          </RadioGroup>

          <div className="max-w-xs space-y-1 border-t pt-4">
            <Label className="text-xs">Min Agency Score (0 – 100)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step={1}
              value={working.aiCredit.min_agency_score}
              onChange={(e) => {
                const n = Number(e.target.value);
                const clamped = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
                setWorking({
                  ...working,
                  aiCredit: { ...working.aiCredit, min_agency_score: clamped },
                });
              }}
              disabled={saving}
            />
          </div>

          <div className="flex items-center gap-3 border-t pt-4">
            <Switch
              checked={working.aiCredit.require_disclosure}
              onCheckedChange={(v) =>
                setWorking({
                  ...working,
                  aiCredit: { ...working.aiCredit, require_disclosure: v },
                })
              }
              disabled={saving}
            />
            <Label className="text-sm">
              Require explicit AI-use disclosure on every submission
            </Label>
          </div>

          <p className="text-xs italic text-muted-foreground">
            Students using AI heavily get{' '}
            <strong>
              full credit IF their Agency Index proves real judgment (modifications,
              critical evaluation).
            </strong>{' '}
            Switch to &apos;reduced_credit_proportional&apos; for stricter standards.
            &apos;disclosure_required_full_credit&apos; = students must declare AI
            use to receive credit.
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

      {dirty && !weightsValid && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Demonstration weights must sum to exactly 100 before saving.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function WeightSlider({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        <span className="text-sm font-semibold tabular-nums">{value}%</span>
      </div>
      <Slider
        value={[value]}
        onValueChange={(arr) => onChange(arr[0] ?? 0)}
        min={0}
        max={100}
        step={1}
        disabled={disabled}
      />
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
  value: AiCreditMode;
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
