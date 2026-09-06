'use client';

// =====================================================================
// PDE Phase 7 — Embodied Practice Rubric Editor
// =====================================================================
// Edits 5 platform_policies rows under pde.rubrics.embodied.* (scope=global):
//   - pde.rubrics.embodied.medical
//   - pde.rubrics.embodied.pharmacy
//   - pde.rubrics.embodied.nursing
//   - pde.rubrics.embodied.dental
//   - pde.rubrics.embodied.engineering
//
// Each row's JSONB value has shape:
//   { discipline, rubric: [{skill, evidence_required, validator_role,
//     scoring_band:[min,max], passing_threshold}], min_demonstrations_per_year,
//     validity_period_months }
//
// Per-discipline Save button (updates that row only). English-consequence
// copy under each card. Toast on save. Mirrors the ScoringPolicyEditor flat
// save pattern (no draft/publish — direct update against platform_policies).
// =====================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Database,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { createClientSupabaseClient } from '@/lib/supabase/client';

// ---------------------------------------------------------------------------
// Types & defaults
// ---------------------------------------------------------------------------

export type ValidatorRole = 'faculty' | 'peer' | 'simulator';

export interface RubricSkill {
  skill: string;
  evidence_required: string;
  validator_role: ValidatorRole;
  scoring_band: [number, number];
  passing_threshold: number;
}

export interface DisciplineRubric {
  discipline: string;
  rubric: RubricSkill[];
  min_demonstrations_per_year: number;
  validity_period_months: number;
}

interface PolicyRowRaw {
  id: string;
  policy_key: string;
  value: unknown;
}

const DISCIPLINES: Array<{
  key: string;
  policyKey: string;
  label: string;
  blurb: string;
}> = [
  {
    key: 'medical',
    policyKey: 'pde.rubrics.embodied.medical',
    label: 'Medical (MBBS)',
    blurb:
      'OSCE-style clinical demonstrations: history-taking, physical exam, suturing, IV cannulation, BLS.',
  },
  {
    key: 'pharmacy',
    policyKey: 'pde.rubrics.embodied.pharmacy',
    label: 'Pharmacy (B.Pharm / Pharm.D)',
    blurb:
      'Prescription audit, compounding, drug-interaction reasoning, counselling, sterile handling.',
  },
  {
    key: 'nursing',
    policyKey: 'pde.rubrics.embodied.nursing',
    label: 'Nursing (B.Sc Nursing / GNM)',
    blurb:
      'Bedside procedures, wound care, IV therapy, patient handling, vitals, SBAR handover.',
  },
  {
    key: 'dental',
    policyKey: 'pde.rubrics.embodied.dental',
    label: 'Dental (BDS)',
    blurb:
      'Cavity prep, scaling, impressions, prosthetic fitting, dental-emergency OSCE.',
  },
  {
    key: 'engineering',
    policyKey: 'pde.rubrics.embodied.engineering',
    label: 'Engineering (B.E. / B.Tech)',
    blurb:
      'Lab demos, prototype builds, hardware debugging, safety adherence, peer review.',
  },
];

const VALIDATOR_OPTIONS: Array<{ value: ValidatorRole; label: string }> = [
  { value: 'faculty', label: 'Faculty' },
  { value: 'peer', label: 'Peer' },
  { value: 'simulator', label: 'Simulator / Auto' },
];

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function parseSkill(raw: unknown): RubricSkill {
  const obj = (raw || {}) as Partial<RubricSkill> & {
    scoring_band?: unknown;
  };
  const band = Array.isArray(obj.scoring_band) ? obj.scoring_band : [0, 100];
  return {
    skill: typeof obj.skill === 'string' ? obj.skill : '',
    evidence_required:
      typeof obj.evidence_required === 'string' ? obj.evidence_required : '',
    validator_role: (['faculty', 'peer', 'simulator'] as ValidatorRole[]).includes(
      obj.validator_role as ValidatorRole,
    )
      ? (obj.validator_role as ValidatorRole)
      : 'faculty',
    scoring_band: [
      clampInt(band[0], 0, 100, 0),
      clampInt(band[1], 0, 100, 100),
    ],
    passing_threshold: clampInt(obj.passing_threshold, 0, 100, 70),
  };
}

function parseRubric(policyKey: string, raw: unknown): DisciplineRubric {
  const obj = (raw || {}) as Partial<DisciplineRubric>;
  const fallbackDiscipline =
    DISCIPLINES.find((d) => d.policyKey === policyKey)?.label.split(' ')[0] ?? '';
  const rubric = Array.isArray(obj.rubric)
    ? obj.rubric.map(parseSkill)
    : [];
  return {
    discipline:
      typeof obj.discipline === 'string' && obj.discipline.length > 0
        ? obj.discipline
        : fallbackDiscipline,
    rubric,
    min_demonstrations_per_year: clampInt(obj.min_demonstrations_per_year, 0, 52, 3),
    validity_period_months: clampInt(obj.validity_period_months, 1, 120, 24),
  };
}

function emptySkill(): RubricSkill {
  return {
    skill: '',
    evidence_required: '',
    validator_role: 'faculty',
    scoring_band: [0, 100],
    passing_threshold: 70,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EmbodiedRubricEditor() {
  const [loaded, setLoaded] = useState<Record<string, DisciplineRubric> | null>(
    null,
  );
  const [working, setWorking] = useState<Record<string, DisciplineRubric> | null>(
    null,
  );
  const [rowIds, setRowIds] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClientSupabaseClient();
      const { data, error: fetchErr } = await supabase
        .from('platform_policies')
        .select('id, policy_key, value')
        .in(
          'policy_key',
          DISCIPLINES.map((d) => d.policyKey),
        )
        .eq('scope_type', 'global');
      if (fetchErr) throw fetchErr;

      const raw = (data || []) as unknown as PolicyRowRaw[];
      const next: Record<string, DisciplineRubric> = {};
      const ids: Record<string, string> = {};
      for (const d of DISCIPLINES) {
        const row = raw.find((r) => r.policy_key === d.policyKey);
        next[d.policyKey] = parseRubric(d.policyKey, row?.value);
        if (row) ids[d.policyKey] = row.id;
      }
      setLoaded(next);
      setWorking(JSON.parse(JSON.stringify(next)));
      setRowIds(ids);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dirtyKeys = useMemo(() => {
    if (!loaded || !working) return new Set<string>();
    const set = new Set<string>();
    for (const d of DISCIPLINES) {
      if (
        JSON.stringify(loaded[d.policyKey]) !==
        JSON.stringify(working[d.policyKey])
      ) {
        set.add(d.policyKey);
      }
    }
    return set;
  }, [loaded, working]);

  function patchDiscipline(
    policyKey: string,
    patch: Partial<DisciplineRubric>,
  ) {
    if (!working) return;
    setWorking({
      ...working,
      [policyKey]: { ...working[policyKey], ...patch },
    });
  }

  function patchSkill(
    policyKey: string,
    index: number,
    patch: Partial<RubricSkill>,
  ) {
    if (!working) return;
    const current = working[policyKey];
    const nextSkills = current.rubric.map((s, i) =>
      i === index ? { ...s, ...patch } : s,
    );
    setWorking({
      ...working,
      [policyKey]: { ...current, rubric: nextSkills },
    });
  }

  function addSkill(policyKey: string) {
    if (!working) return;
    const current = working[policyKey];
    setWorking({
      ...working,
      [policyKey]: { ...current, rubric: [...current.rubric, emptySkill()] },
    });
  }

  function removeSkill(policyKey: string, index: number) {
    if (!working) return;
    const current = working[policyKey];
    setWorking({
      ...working,
      [policyKey]: {
        ...current,
        rubric: current.rubric.filter((_, i) => i !== index),
      },
    });
  }

  function revert(policyKey: string) {
    if (!loaded || !working) return;
    setWorking({
      ...working,
      [policyKey]: JSON.parse(JSON.stringify(loaded[policyKey])),
    });
  }

  async function save(policyKey: string) {
    if (!working) return;
    const value = working[policyKey];
    // Validate: every skill must have a name + evidence text
    const invalidSkill = value.rubric.find(
      (s) => s.skill.trim().length === 0 || s.evidence_required.trim().length === 0,
    );
    if (invalidSkill) {
      toast.error('Each skill needs a name and evidence-required text before saving.');
      return;
    }
    if (value.rubric.length === 0) {
      toast.error('At least one skill is required for the discipline.');
      return;
    }
    setSavingKey(policyKey);
    try {
      const supabase = createClientSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const now = new Date().toISOString();
      const updatedBy = user?.id ?? null;

      const { error: updErr } = await supabase
        .from('platform_policies')
        .update({
          value: value as never,
          updated_by: updatedBy,
          updated_at: now,
        })
        .eq('policy_key', policyKey)
        .eq('scope_type', 'global');
      if (updErr) throw updErr;

      if (loaded) {
        setLoaded({ ...loaded, [policyKey]: JSON.parse(JSON.stringify(value)) });
      }
      toast.success(
        `${value.discipline} rubric saved. Takes effect on next demonstration submission. Zero deploy required.`,
      );
    } catch (e) {
      toast.error(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSavingKey(null);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="mt-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mt-6">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Failed to load rubrics</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!working || !loaded) return null;

  const missingKeys = DISCIPLINES.filter((d) => !rowIds[d.policyKey]);

  return (
    <div className="mt-6 space-y-6">
      <Alert>
        <Database className="h-4 w-4" />
        <AlertTitle>PDE Phase 7 — Embodied Practice</AlertTitle>
        <AlertDescription>
          These five rubrics define what hands-on skill demonstrations look like
          for each JKKN college discipline. Faculty (or peer/simulator
          validators) use them to mark whether a student has actually shown the
          skill. Edits take effect on the next demonstration submission. No
          deploy required.
        </AlertDescription>
      </Alert>

      {missingKeys.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Some rubrics not seeded</AlertTitle>
          <AlertDescription>
            Missing rows for:{' '}
            <code>
              {missingKeys.map((d) => d.policyKey).join(', ')}
            </code>
            . Apply migration{' '}
            <code>20260518_pde_embodied_practice_rubrics.sql</code>.
          </AlertDescription>
        </Alert>
      )}

      {DISCIPLINES.map((d) => {
        const value = working[d.policyKey];
        const isDirty = dirtyKeys.has(d.policyKey);
        const isSaving = savingKey === d.policyKey;
        return (
          <Card key={d.key}>
            <CardHeader>
              <CardTitle>{d.label}</CardTitle>
              <CardDescription>
                Key: <code className="text-xs">{d.policyKey}</code>
                <br />
                <span className="text-xs">{d.blurb}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Skills table */}
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[180px]">Skill</TableHead>
                      <TableHead className="min-w-[260px]">
                        Evidence required
                      </TableHead>
                      <TableHead className="w-[150px]">Validator</TableHead>
                      <TableHead className="w-[140px]">Scoring band</TableHead>
                      <TableHead className="w-[100px]">Passing</TableHead>
                      <TableHead className="w-[60px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {value.rubric.map((s, idx) => (
                      <TableRow key={`${d.key}-${idx}`}>
                        <TableCell>
                          <Input
                            value={s.skill}
                            placeholder="e.g. IV cannulation"
                            onChange={(e) =>
                              patchSkill(d.policyKey, idx, {
                                skill: e.target.value,
                              })
                            }
                            disabled={isSaving}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={s.evidence_required}
                            placeholder="What proves the skill is demonstrated"
                            onChange={(e) =>
                              patchSkill(d.policyKey, idx, {
                                evidence_required: e.target.value,
                              })
                            }
                            disabled={isSaving}
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={s.validator_role}
                            onValueChange={(v) =>
                              patchSkill(d.policyKey, idx, {
                                validator_role: v as ValidatorRole,
                              })
                            }
                            disabled={isSaving}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {VALIDATOR_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              value={s.scoring_band[0]}
                              onChange={(e) =>
                                patchSkill(d.policyKey, idx, {
                                  scoring_band: [
                                    clampInt(e.target.value, 0, 100, 0),
                                    s.scoring_band[1],
                                  ],
                                })
                              }
                              disabled={isSaving}
                              className="w-16"
                            />
                            <span className="text-xs text-muted-foreground">–</span>
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              value={s.scoring_band[1]}
                              onChange={(e) =>
                                patchSkill(d.policyKey, idx, {
                                  scoring_band: [
                                    s.scoring_band[0],
                                    clampInt(e.target.value, 0, 100, 100),
                                  ],
                                })
                              }
                              disabled={isSaving}
                              className="w-16"
                            />
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={s.passing_threshold}
                            onChange={(e) =>
                              patchSkill(d.policyKey, idx, {
                                passing_threshold: clampInt(e.target.value, 0, 100, 70),
                              })
                            }
                            disabled={isSaving}
                            className="w-20"
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeSkill(d.policyKey, idx)}
                            disabled={isSaving}
                            aria-label="Remove skill"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addSkill(d.policyKey)}
                disabled={isSaving}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add skill
              </Button>

              {/* Min demonstrations + validity */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 border-t pt-4">
                <div className="space-y-1">
                  <Label className="text-xs">Min demonstrations per year</Label>
                  <Input
                    type="number"
                    min={0}
                    max={52}
                    value={value.min_demonstrations_per_year}
                    onChange={(e) =>
                      patchDiscipline(d.policyKey, {
                        min_demonstrations_per_year: clampInt(
                          e.target.value,
                          0,
                          52,
                          3,
                        ),
                      })
                    }
                    disabled={isSaving}
                    className="max-w-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Validity period (months)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={120}
                    value={value.validity_period_months}
                    onChange={(e) =>
                      patchDiscipline(d.policyKey, {
                        validity_period_months: clampInt(
                          e.target.value,
                          1,
                          120,
                          24,
                        ),
                      })
                    }
                    disabled={isSaving}
                    className="max-w-xs"
                  />
                </div>
              </div>

              <p className="text-xs italic text-muted-foreground">
                <strong>
                  Changes take effect on next demonstration submission. Zero
                  deploy required.
                </strong>{' '}
                A student must complete at least{' '}
                {value.min_demonstrations_per_year} demonstrations per year, and
                each passing demonstration remains valid for{' '}
                {value.validity_period_months} months before re-certification.
              </p>

              {/* Per-discipline save bar */}
              <div className="flex items-center justify-end gap-2 border-t pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => revert(d.policyKey)}
                  disabled={!isDirty || isSaving}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  Revert
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => save(d.policyKey)}
                  disabled={!isDirty || isSaving || !rowIds[d.policyKey]}
                >
                  <Save className="h-3.5 w-3.5 mr-1" />
                  {isSaving ? 'Saving…' : `Save ${value.discipline}`}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
