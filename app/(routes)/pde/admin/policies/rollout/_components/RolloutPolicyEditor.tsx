'use client';

// =====================================================================
// PDE Cluster C — Rollout & Compliance Policy Editor
// =====================================================================
// Edits 4 platform_policies rows under pde.rollout.* (scope=global).
//   - pde.rollout.pace_cap_coordinators_per_60d        (number 1..500)
//   - pde.rollout.per_college_compliance_targets       (object: college -> string[])
//   - pde.rollout.hod_blocking_escalation              (enum: 3 values)
//   - pde.rollout.tier_eligibility                     (object: tier_N -> string)
//
// Pattern mirrors /pde/admin/policies/scoring (Cluster A) — flat global save,
// no draft/publish, no institution selector. Effective on next coordinator
// onboarding cycle. No deploy required.
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
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { createClientSupabaseClient } from '@/lib/supabase/client';

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

export const COLLEGES = [
  'medical',
  'pharmacy',
  'nursing',
  'dental',
  'engineering',
  'education',
  'arts_science',
  'default',
] as const;
export type CollegeKey = (typeof COLLEGES)[number];

export const CATEGORIES = [
  'judgment',
  'embodied',
  'problem_finding',
  'accountability',
  'social_leadership',
  'cultural_civic',
  'credential',
] as const;
export type CategoryKey = (typeof CATEGORIES)[number];

export type HodEscalation =
  | 'respect_no'
  | 'bypass_hod_to_coordinator'
  | 'dean_kpi';

export const HOD_ESCALATIONS: HodEscalation[] = [
  'respect_no',
  'bypass_hod_to_coordinator',
  'dean_kpi',
];

export const TIERS = ['tier_1', 'tier_2', 'tier_3'] as const;
export type TierKey = (typeof TIERS)[number];

export const TIER_OPTIONS: Record<TierKey, string[]> = {
  tier_1: ['natural_fit_only', 'opt_in_only', 'not_eligible'],
  tier_2: ['after_tier_1_success', 'opt_in_only', 'not_eligible'],
  tier_3: ['not_eligible', 'opt_in_only', 'after_tier_2_success'],
};

export type PerCollegeTargets = Record<CollegeKey, CategoryKey[]>;
export type TierEligibility = Record<TierKey, string>;

interface PolicyRowRaw {
  id: string;
  policy_key: string;
  value: unknown;
}

interface RolloutPolicyState {
  paceCap: number;
  perCollege: PerCollegeTargets;
  hodEscalation: HodEscalation;
  tierEligibility: TierEligibility;
}

const DEFAULT_STATE: RolloutPolicyState = {
  paceCap: 30,
  perCollege: {
    medical: ['judgment', 'embodied', 'accountability', 'credential'],
    pharmacy: ['judgment', 'embodied', 'accountability', 'credential'],
    nursing: ['judgment', 'embodied', 'social_leadership', 'credential'],
    dental: ['judgment', 'embodied', 'accountability', 'credential'],
    engineering: [
      'judgment',
      'problem_finding',
      'accountability',
      'social_leadership',
      'credential',
    ],
    education: ['judgment', 'social_leadership', 'cultural_civic', 'credential'],
    arts_science: ['judgment', 'problem_finding', 'cultural_civic', 'credential'],
    default: ['judgment', 'problem_finding', 'accountability', 'credential'],
  },
  hodEscalation: 'dean_kpi',
  tierEligibility: {
    tier_1: 'natural_fit_only',
    tier_2: 'after_tier_1_success',
    tier_3: 'not_eligible',
  },
};

const POLICY_KEYS = {
  PACE: 'pde.rollout.pace_cap_coordinators_per_60d',
  PER_COLLEGE: 'pde.rollout.per_college_compliance_targets',
  HOD: 'pde.rollout.hod_blocking_escalation',
  TIER: 'pde.rollout.tier_eligibility',
} as const;

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

function asNum(raw: unknown, fallback: number): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function parsePerCollege(raw: unknown): PerCollegeTargets {
  const obj = (raw || {}) as Record<string, unknown>;
  const out = { ...DEFAULT_STATE.perCollege } as PerCollegeTargets;
  for (const college of COLLEGES) {
    const v = obj[college];
    if (Array.isArray(v)) {
      const filtered = v.filter((x): x is CategoryKey =>
        typeof x === 'string' && (CATEGORIES as readonly string[]).includes(x),
      );
      out[college] = filtered;
    }
  }
  return out;
}

function parseHod(raw: unknown): HodEscalation {
  if (typeof raw === 'string' && (HOD_ESCALATIONS as string[]).includes(raw)) {
    return raw as HodEscalation;
  }
  return DEFAULT_STATE.hodEscalation;
}

function parseTier(raw: unknown): TierEligibility {
  const obj = (raw || {}) as Partial<Record<TierKey, unknown>>;
  const out = { ...DEFAULT_STATE.tierEligibility } as TierEligibility;
  for (const tier of TIERS) {
    const v = obj[tier];
    if (typeof v === 'string' && TIER_OPTIONS[tier].includes(v)) {
      out[tier] = v;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RolloutPolicyEditor() {
  const [rows, setRows] = useState<Map<string, PolicyRowRaw>>(new Map());
  const [loaded, setLoaded] = useState<RolloutPolicyState | null>(null);
  const [working, setWorking] = useState<RolloutPolicyState | null>(null);
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
          POLICY_KEYS.PACE,
          POLICY_KEYS.PER_COLLEGE,
          POLICY_KEYS.HOD,
          POLICY_KEYS.TIER,
        ])
        .eq('scope_type', 'global');
      if (fetchErr) throw fetchErr;

      const map = new Map<string, PolicyRowRaw>();
      const raw = (data || []) as unknown as PolicyRowRaw[];
      for (const r of raw) map.set(r.policy_key, r);
      setRows(map);

      const next: RolloutPolicyState = {
        paceCap: asNum(map.get(POLICY_KEYS.PACE)?.value, DEFAULT_STATE.paceCap),
        perCollege: parsePerCollege(map.get(POLICY_KEYS.PER_COLLEGE)?.value),
        hodEscalation: parseHod(map.get(POLICY_KEYS.HOD)?.value),
        tierEligibility: parseTier(map.get(POLICY_KEYS.TIER)?.value),
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

  const paceValid = useMemo(() => {
    if (!working) return false;
    return (
      Number.isFinite(working.paceCap) &&
      working.paceCap >= 1 &&
      working.paceCap <= 500
    );
  }, [working]);

  const dirty = useMemo(() => {
    if (!loaded || !working) return false;
    return JSON.stringify(loaded) !== JSON.stringify(working);
  }, [loaded, working]);

  const canSave = dirty && paceValid && !saving;

  function revert() {
    if (loaded) setWorking(loaded);
  }

  function toggleCategory(college: CollegeKey, cat: CategoryKey) {
    if (!working) return;
    const current = working.perCollege[college] || [];
    const next = current.includes(cat)
      ? current.filter((c) => c !== cat)
      : [...current, cat];
    setWorking({
      ...working,
      perCollege: { ...working.perCollege, [college]: next },
    });
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

      updates.push(upd(POLICY_KEYS.PACE, working.paceCap));
      updates.push(upd(POLICY_KEYS.PER_COLLEGE, working.perCollege));
      updates.push(upd(POLICY_KEYS.HOD, working.hodEscalation));
      updates.push(upd(POLICY_KEYS.TIER, working.tierEligibility));

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
        'Policy updated. Takes effect on next coordinator onboarding. Zero deploy required.',
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
          Expected 4 rows under <code>pde.rollout.*</code>, found {rows.size}.
          Apply migration{' '}
          <code>20260518_pde_cluster_c_rollout_compliance_policies.sql</code>.
        </AlertDescription>
      </Alert>
    );
  }

  if (!working) return null;

  return (
    <div className="mt-6 space-y-6">
      <Alert>
        <Database className="h-4 w-4" />
        <AlertTitle>PDE Rollout & Compliance</AlertTitle>
        <AlertDescription>
          These four policies govern the institutional pace of PDE adoption,
          which durable-value categories each college targets, how blocking
          HODs are escalated, and which course tiers are eligible for PDE
          wrapping. Every change takes effect on the next coordinator
          onboarding cycle. No deploy required.
        </AlertDescription>
      </Alert>

      {/* ----- Pace cap ----- */}
      <Card>
        <CardHeader>
          <CardTitle>Coordinator onboarding pace cap</CardTitle>
          <CardDescription>
            Key:{' '}
            <code className="text-xs">
              pde.rollout.pace_cap_coordinators_per_60d
            </code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs space-y-1">
            <Label className="text-xs">
              New coordinators per 60-day window (1 – 500)
            </Label>
            <Input
              type="number"
              min={1}
              max={500}
              step={1}
              value={working.paceCap}
              onChange={(e) => {
                const n = Number(e.target.value);
                const clamped = Number.isFinite(n)
                  ? Math.min(500, Math.max(1, Math.round(n)))
                  : DEFAULT_STATE.paceCap;
                setWorking({ ...working, paceCap: clamped });
              }}
              disabled={saving}
            />
          </div>
          <p className="text-xs italic text-muted-foreground">
            <strong>
              Maximum new course coordinators per 60-day window.
            </strong>{' '}
            Default 30 across 8 colleges.{' '}
            <strong>Below 10 = pilot pace</strong> (3-5 coordinators is safe).{' '}
            <strong>Above 50 = institutional stretch</strong> (validation
            backlog risk). Adjust based on current support capacity.
          </p>
        </CardContent>
      </Card>

      {/* ----- Per-college compliance targets ----- */}
      <Card>
        <CardHeader>
          <CardTitle>Per-college category targets</CardTitle>
          <CardDescription>
            Key:{' '}
            <code className="text-xs">
              pde.rollout.per_college_compliance_targets
            </code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs italic text-muted-foreground">
            <strong>
              Per-college category targets define which of the 7 durable-value
              categories each college pursues.
            </strong>{' '}
            Medical/pharmacy/nursing/dental focus on embodied skills.
            Engineering on problem-finding. Education on cultural-civic. All
            colleges include judgment + credential as baseline. Tick a category
            to require it for that college.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left font-medium px-2 py-2 sticky left-0 bg-background">
                    College
                  </th>
                  {CATEGORIES.map((cat) => (
                    <th
                      key={cat}
                      className="text-center font-medium px-2 py-2 whitespace-nowrap"
                    >
                      {cat.replace(/_/g, ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COLLEGES.map((college) => (
                  <tr key={college} className="border-b last:border-b-0">
                    <td className="text-left px-2 py-2 font-medium sticky left-0 bg-background">
                      {college.replace(/_/g, ' ')}
                    </td>
                    {CATEGORIES.map((cat) => {
                      const checked =
                        working.perCollege[college]?.includes(cat) ?? false;
                      return (
                        <td key={cat} className="text-center px-2 py-2">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleCategory(college, cat)}
                            disabled={saving}
                            aria-label={`${college} ${cat}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ----- HOD blocking escalation ----- */}
      <Card>
        <CardHeader>
          <CardTitle>HOD-block escalation</CardTitle>
          <CardDescription>
            Key:{' '}
            <code className="text-xs">
              pde.rollout.hod_blocking_escalation
            </code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            value={working.hodEscalation}
            onValueChange={(v) =>
              setWorking({ ...working, hodEscalation: v as HodEscalation })
            }
            disabled={saving}
            className="space-y-2"
          >
            <HodOption
              id="hod-respect"
              value="respect_no"
              label="Respect no — wait for social proof"
              help="If an HOD refuses, leave their department alone until willing departments produce visible wins."
            />
            <HodOption
              id="hod-bypass"
              value="bypass_hod_to_coordinator"
              label="Bypass HOD — work with individual coordinators"
              help="Engage individual willing coordinators directly. Political risk: HOD finds out."
            />
            <HodOption
              id="hod-dean"
              value="dean_kpi"
              label="Escalate to dean KPI (default)"
              help="If an HOD refuses without specific objection, make PDE adoption part of dean-level KPIs. Top-down enforcement."
            />
          </RadioGroup>
          <p className="text-xs italic text-muted-foreground">
            <strong>Default: dean_kpi</strong> — if an HOD refuses PDE without
            specific objection, escalate to dean-level KPI. Top-down
            enforcement. <strong>respect_no</strong> = wait for social proof
            from willing departments.{' '}
            <strong>bypass_hod_to_coordinator</strong> = work with individual
            coordinators directly (political risk).
          </p>
        </CardContent>
      </Card>

      {/* ----- Tier eligibility ----- */}
      <Card>
        <CardHeader>
          <CardTitle>Course-tier eligibility</CardTitle>
          <CardDescription>
            Key: <code className="text-xs">pde.rollout.tier_eligibility</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {TIERS.map((tier) => (
            <div key={tier} className="space-y-2">
              <Label className="text-sm font-medium">
                {tier.replace('_', ' ').toUpperCase()}
              </Label>
              <RadioGroup
                value={working.tierEligibility[tier]}
                onValueChange={(v) =>
                  setWorking({
                    ...working,
                    tierEligibility: { ...working.tierEligibility, [tier]: v },
                  })
                }
                disabled={saving}
                className="space-y-1.5"
              >
                {TIER_OPTIONS[tier].map((opt) => (
                  <div
                    key={opt}
                    className="flex items-center gap-2 rounded-md border p-2"
                  >
                    <RadioGroupItem value={opt} id={`${tier}-${opt}`} />
                    <Label
                      htmlFor={`${tier}-${opt}`}
                      className="text-xs cursor-pointer"
                    >
                      {opt.replace(/_/g, ' ')}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          ))}
          <p className="text-xs italic text-muted-foreground">
            <strong>Tier 1 (natural fit)</strong> = capstones, internships,
            design projects, clinical rotations — first wave.{' '}
            <strong>Tier 2 (after success)</strong> = applied theory courses —
            wave 2 once Tier 1 ships success stories.{' '}
            <strong>Tier 3 (not eligible)</strong> = pure-theory or
            memorization-heavy courses where quest model degrades outcomes.
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
          {saving
            ? 'Saving…'
            : 'Save policy. Takes effect on next coordinator onboarding. Zero deploy required.'}
        </Button>
      </div>

      {dirty && !paceValid && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Pace cap must be between 1 and 500 before saving.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function HodOption({
  id,
  value,
  label,
  help,
}: {
  id: string;
  value: HodEscalation;
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
