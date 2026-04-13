'use client';

/**
 * health/fitness/page.tsx
 * JKKN Health — Fitness Tests & History
 *
 * Sections:
 *  1. Latest Test Results  — metric grid with colored bars + overall score gauge
 *  2. Fitness Category Badge — color from FITNESS_CATEGORY_CONFIG
 *  3. History Timeline     — vertical list, trend arrows per test
 *  4. VO2 Max Info Card    — plain-language explanation
 *  5. New Test Entry       — faculty/admin only, all fitness fields
 *
 * No chart library — all visuals are CSS-only (progress bars, SVG gauge)
 *
 * Usage: /health/fitness
 */

import { useState, useEffect, useCallback } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
  Info,
  Plus,
  ChevronDown,
  ChevronUp,
  Scale,
  Ruler,
  Zap,
  Target,
  Wind,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { HealthSportsService } from '@/lib/services/health/health-sports-service';
import type { HealthFitnessTest, FitnessCategory } from '@/types/health-sports';
import { FITNESS_CATEGORY_CONFIG } from '@/types/health-sports';
import { cn } from '@/lib/utils';

// ============================================================================
// Metric configuration — maps DB field names to display config
// ============================================================================

type MetricKey = keyof Pick<
  HealthFitnessTest,
  | 'bmi'
  | 'beep_test_level'
  | 'push_ups_count'
  | 'sit_ups_count'
  | 'grip_strength_kg'
  | 'sit_and_reach_cm'
  | 'sprint_50m_seconds'
  | 'shuttle_run_seconds'
  | 'distance_run_meters'
>;

interface MetricConfig {
  label: string;
  unit: string;
  // Range thresholds: [poor_max, below_avg_max, avg_max, good_max] — above good_max = excellent
  // For lower-is-better metrics (sprint), thresholds are reversed and higherIsBetter=false
  thresholds: [number, number, number, number];
  higherIsBetter: boolean;
  icon: React.ElementType;
  displayMax: number; // for progress bar scaling
}

const METRIC_CONFIG: Record<MetricKey, MetricConfig> = {
  bmi: {
    label: 'BMI',
    unit: 'kg/m²',
    thresholds: [16, 18.5, 25, 30],
    higherIsBetter: false, // optimal is middle range — handled specially
    icon: Scale,
    displayMax: 40,
  },
  beep_test_level: {
    label: 'Beep Test',
    unit: 'level',
    thresholds: [4, 6, 8, 10],
    higherIsBetter: true,
    icon: Zap,
    displayMax: 15,
  },
  push_ups_count: {
    label: 'Push-ups',
    unit: 'reps',
    thresholds: [10, 20, 30, 40],
    higherIsBetter: true,
    icon: Activity,
    displayMax: 60,
  },
  sit_ups_count: {
    label: 'Sit-ups',
    unit: 'reps',
    thresholds: [15, 25, 35, 45],
    higherIsBetter: true,
    icon: Activity,
    displayMax: 60,
  },
  grip_strength_kg: {
    label: 'Grip Strength',
    unit: 'kg',
    thresholds: [20, 30, 40, 50],
    higherIsBetter: true,
    icon: Target,
    displayMax: 70,
  },
  sit_and_reach_cm: {
    label: 'Flexibility',
    unit: 'cm',
    thresholds: [0, 10, 20, 30],
    higherIsBetter: true,
    icon: Ruler,
    displayMax: 40,
  },
  sprint_50m_seconds: {
    label: '50m Sprint',
    unit: 'sec',
    thresholds: [10, 8.5, 7.5, 7],
    higherIsBetter: false, // lower is better
    icon: Wind,
    displayMax: 12,
  },
  shuttle_run_seconds: {
    label: 'Shuttle Run',
    unit: 'sec',
    thresholds: [22, 20, 18, 16],
    higherIsBetter: false,
    icon: Wind,
    displayMax: 25,
  },
  distance_run_meters: {
    label: 'Distance Run',
    unit: 'm',
    thresholds: [1000, 1500, 2000, 2500],
    higherIsBetter: true,
    icon: Activity,
    displayMax: 3000,
  },
};

function getMetricCategory(
  key: MetricKey,
  value: number
): FitnessCategory {
  const cfg = METRIC_CONFIG[key];

  if (key === 'bmi') {
    // BMI: 18.5–25 is optimal (good), outside that degrades
    if (value >= 18.5 && value < 25) return 'good';
    if (value >= 17 && value < 27) return 'average';
    if (value >= 16 && value < 30) return 'below_average';
    return 'poor';
  }

  const [t1, t2, t3, t4] = cfg.thresholds;
  if (cfg.higherIsBetter) {
    if (value >= t4) return 'excellent';
    if (value >= t3) return 'good';
    if (value >= t2) return 'average';
    if (value >= t1) return 'below_average';
    return 'poor';
  } else {
    // Lower is better
    if (value <= t4) return 'excellent';
    if (value <= t3) return 'good';
    if (value <= t2) return 'average';
    if (value <= t1) return 'below_average';
    return 'poor';
  }
}

function metricProgressPct(key: MetricKey, value: number): number {
  const cfg = METRIC_CONFIG[key];
  if (cfg.higherIsBetter) {
    return Math.min(100, Math.round((value / cfg.displayMax) * 100));
  } else {
    // For lower-is-better: invert — lower value = higher bar
    return Math.min(100, Math.round(((cfg.displayMax - value) / cfg.displayMax) * 100));
  }
}

function categoryBarColor(cat: FitnessCategory): string {
  switch (cat) {
    case 'excellent':
      return 'bg-emerald-500';
    case 'good':
      return 'bg-green-500';
    case 'average':
      return 'bg-yellow-400';
    case 'below_average':
      return 'bg-orange-500';
    case 'poor':
      return 'bg-red-500';
  }
}

// ============================================================================
// Circular score gauge (SVG, CSS-only)
// ============================================================================

function ScoreGauge({
  score,
  category,
}: {
  score: number;
  category: FitnessCategory | null;
}) {
  const pct = Math.min(100, Math.max(0, score));
  const r = 46;
  const circumference = 2 * Math.PI * r;
  const strokeDash = circumference - (pct / 100) * circumference;

  const catCfg = category ? FITNESS_CATEGORY_CONFIG[category] : null;

  const strokeColor =
    category === 'excellent'
      ? '#10b981'
      : category === 'good'
      ? '#22c55e'
      : category === 'average'
      ? '#eab308'
      : category === 'below_average'
      ? '#f97316'
      : '#ef4444';

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative flex items-center justify-center" style={{ width: 112, height: 112 }}>
        <svg width="112" height="112" viewBox="0 0 112 112" className="-rotate-90">
          {/* Track */}
          <circle
            cx="56"
            cy="56"
            r={r}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth="10"
          />
          {/* Fill */}
          <circle
            cx="56"
            cy="56"
            r={r}
            fill="none"
            stroke={strokeColor}
            strokeWidth="10"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDash}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-extrabold text-slate-800 leading-none">
            {Math.round(score)}
          </span>
          <span className="text-xs text-slate-400 leading-none mt-0.5">/ 100</span>
        </div>
      </div>
      {catCfg && (
        <Badge
          className={cn(
            'text-sm px-3 py-1 font-bold border',
            catCfg.bg,
            catCfg.color,
            'border-current/20'
          )}
          variant="outline"
        >
          {catCfg.label}
        </Badge>
      )}
    </div>
  );
}

// ============================================================================
// Latest test results card
// ============================================================================

function LatestTestCard({
  test,
  isLoading,
}: {
  test: HealthFitnessTest | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return <Skeleton className="h-64 w-full rounded-xl" />;
  }

  if (!test) {
    return (
      <Card className="border-dashed border-slate-200">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 border">
            <Activity className="h-6 w-6 text-slate-300" />
          </div>
          <p className="text-sm font-medium text-slate-500">No fitness test on record</p>
          <p className="text-xs text-slate-400 max-w-xs">
            Your PE faculty will add your test results after the next assessment session.
          </p>
        </CardContent>
      </Card>
    );
  }

  const metricKeys = Object.keys(METRIC_CONFIG) as MetricKey[];
  const availableMetrics = metricKeys.filter(
    (k) => test[k] !== null && test[k] !== undefined
  );

  return (
    <Card>
      <CardHeader className="pb-3 pt-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-600" />
              Latest Fitness Test
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {new Date(test.test_date).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
              {test.assessed_by && ` · ${test.assessed_by}`}
            </p>
          </div>

          {/* Overall score gauge */}
          {test.fitness_score !== null && (
            <div className="shrink-0">
              <ScoreGauge
                score={test.fitness_score}
                category={test.fitness_category ?? null}
              />
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="pb-4">
        {/* Height / Weight / BMI quick stats */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {test.height_cm && (
            <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-center">
              <p className="text-sm font-bold text-slate-800">{test.height_cm}</p>
              <p className="text-xs text-slate-400">Height cm</p>
            </div>
          )}
          {test.weight_kg && (
            <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-center">
              <p className="text-sm font-bold text-slate-800">{test.weight_kg}</p>
              <p className="text-xs text-slate-400">Weight kg</p>
            </div>
          )}
          {test.bmi && (
            <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-center">
              <p className="text-sm font-bold text-slate-800">{test.bmi.toFixed(1)}</p>
              <p className="text-xs text-slate-400">BMI</p>
            </div>
          )}
        </div>

        {/* Metric grid with colored progress bars */}
        {availableMetrics.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {availableMetrics.map((key) => {
              const val = test[key] as number;
              const cfg = METRIC_CONFIG[key];
              const cat = getMetricCategory(key, val);
              const catCfg = FITNESS_CATEGORY_CONFIG[cat];
              const pct = metricProgressPct(key, val);
              const Icon = cfg.icon;

              return (
                <div
                  key={key}
                  className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5 text-slate-400" />
                      <span className="text-xs font-medium text-slate-600">
                        {cfg.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-slate-800">
                        {val}
                        <span className="text-xs font-normal text-slate-400 ml-0.5">
                          {cfg.unit}
                        </span>
                      </span>
                      <span
                        className={cn(
                          'text-xs px-1.5 py-0.5 rounded font-medium',
                          catCfg.bg,
                          catCfg.color
                        )}
                      >
                        {catCfg.label}
                      </span>
                    </div>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-700',
                        categoryBarColor(cat)
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* VO2 max estimated */}
        {test.vo2_max_estimated !== null && test.vo2_max_estimated !== undefined && (
          <div className="mt-3 flex items-center gap-3 rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
            <Wind className="h-5 w-5 text-blue-500 shrink-0" />
            <div>
              <p className="text-xs text-blue-600 font-medium">
                Estimated VO2 Max
              </p>
              <p className="text-lg font-extrabold text-blue-800">
                {test.vo2_max_estimated}{' '}
                <span className="text-sm font-normal text-blue-400">
                  ml/kg/min
                </span>
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// History timeline
// ============================================================================

function trendArrow(current: number | null, previous: number | null, higherIsBetter: boolean) {
  if (current === null || previous === null) return null;
  const delta = current - previous;
  if (Math.abs(delta) < 0.5) return 'same';
  const improved = higherIsBetter ? delta > 0 : delta < 0;
  return improved ? 'up' : 'down';
}

function TrendIndicator({ trend }: { trend: 'up' | 'down' | 'same' | null }) {
  if (!trend) return null;
  if (trend === 'up')
    return <TrendingUp className="h-4 w-4 text-green-500 shrink-0" />;
  if (trend === 'down')
    return <TrendingDown className="h-4 w-4 text-red-400 shrink-0" />;
  return <Minus className="h-4 w-4 text-slate-300 shrink-0" />;
}

function HistoryTimeline({
  tests,
  isLoading,
}: {
  tests: HealthFitnessTest[];
  isLoading: boolean;
}) {
  if (isLoading) return <Skeleton className="h-40 w-full rounded-xl" />;
  if (tests.length <= 1) return null; // No history if only one test

  return (
    <Card>
      <CardHeader className="pb-3 pt-4">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-emerald-600" />
          Test History
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[17px] top-2 bottom-2 w-px bg-slate-100" />

          <div className="space-y-4">
            {tests.map((test, i) => {
              const prevTest = tests[i + 1] ?? null;
              const scoreTrend = trendArrow(
                test.fitness_score,
                prevTest?.fitness_score ?? null,
                true
              );
              const catCfg = test.fitness_category
                ? FITNESS_CATEGORY_CONFIG[test.fitness_category]
                : null;

              return (
                <div key={test.id} className="flex gap-3 items-start">
                  {/* Timeline dot */}
                  <div
                    className={cn(
                      'relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2',
                      i === 0
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : 'bg-white border-slate-200 text-slate-400'
                    )}
                  >
                    <span className="text-xs font-bold">{tests.length - i}</span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          {new Date(test.test_date).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </p>
                        {test.assessed_by && (
                          <p className="text-xs text-slate-400">
                            by {test.assessed_by}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {test.fitness_score !== null && (
                          <span className="text-sm font-bold text-slate-700">
                            {test.fitness_score}/100
                          </span>
                        )}
                        <TrendIndicator trend={scoreTrend} />
                        {catCfg && (
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-xs border',
                              catCfg.bg,
                              catCfg.color,
                              'border-current/20'
                            )}
                          >
                            {catCfg.label}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Mini metric summary */}
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5">
                      {test.push_ups_count !== null && (
                        <span className="text-xs text-slate-500">
                          Push-ups: <strong>{test.push_ups_count}</strong>
                        </span>
                      )}
                      {test.beep_test_level !== null && (
                        <span className="text-xs text-slate-500">
                          Beep: <strong>L{test.beep_test_level}</strong>
                        </span>
                      )}
                      {test.bmi !== null && (
                        <span className="text-xs text-slate-500">
                          BMI: <strong>{test.bmi.toFixed(1)}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// VO2 Max info card
// ============================================================================

function VO2MaxInfoCard() {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="border-blue-100 bg-blue-50/30">
      <CardContent className="py-4 px-5">
        <button
          className="flex w-full items-center justify-between gap-2 text-left"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-blue-500 shrink-0" />
            <span className="text-sm font-semibold text-blue-800">
              What is VO2 Max?
            </span>
          </div>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-blue-400 shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 text-blue-400 shrink-0" />
          )}
        </button>

        {expanded && (
          <div className="mt-3 space-y-2 text-sm text-blue-800/80 leading-relaxed">
            <p>
              <strong>VO2 Max</strong> (maximal oxygen uptake) measures how much
              oxygen your body can use during intense exercise. It's expressed in
              millilitres of oxygen per kilogram of body weight per minute
              (ml/kg/min).
            </p>
            <p>
              A <strong>higher VO2 Max</strong> means your heart and lungs can
              deliver more oxygen to your muscles — so you can run faster or
              longer before getting tired.
            </p>
            <p>
              <strong>How it's calculated from the Beep Test:</strong> The beep
              test (multi-stage fitness test) records the level you reach. JKKN
              uses the <em>Leger formula</em>:
            </p>
            <div className="rounded-lg bg-white/60 border border-blue-100 px-3 py-2 font-mono text-xs text-blue-700">
              VO2 Max ≈ 18.04 + (3.24 × level) − (0.015 × level²)
            </div>
            <div className="rounded-lg bg-white/60 border border-blue-100 px-3 py-2">
              <p className="text-xs font-semibold text-blue-700 mb-1">
                Reference ranges for college students:
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-blue-700">
                <span>Below 35 — Poor</span>
                <span>35–42 — Below Average</span>
                <span>42–50 — Average</span>
                <span>50–56 — Good</span>
                <span>56+ — Excellent</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// New Test Entry form (faculty/admin only)
// ============================================================================

type FitnessFormState = {
  test_date: string;
  assessed_by: string;
  height_cm: string;
  weight_kg: string;
  beep_test_level: string;
  push_ups_count: string;
  sit_ups_count: string;
  grip_strength_kg: string;
  sit_and_reach_cm: string;
  sprint_50m_seconds: string;
  shuttle_run_seconds: string;
  distance_run_meters: string;
  fitness_score: string;
  notes: string;
};

const EMPTY_FITNESS_FORM: FitnessFormState = {
  test_date: new Date().toISOString().split('T')[0],
  assessed_by: '',
  height_cm: '',
  weight_kg: '',
  beep_test_level: '',
  push_ups_count: '',
  sit_ups_count: '',
  grip_strength_kg: '',
  sit_and_reach_cm: '',
  sprint_50m_seconds: '',
  shuttle_run_seconds: '',
  distance_run_meters: '',
  fitness_score: '',
  notes: '',
};

function parseOptionalFloat(val: string): number | null {
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function parseOptionalInt(val: string): number | null {
  const n = parseInt(val, 10);
  return isNaN(n) ? null : n;
}

function NewTestEntryForm({
  learnerId,
  onTestAdded,
}: {
  learnerId: string;
  onTestAdded: (test: HealthFitnessTest) => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FitnessFormState>(EMPTY_FITNESS_FORM);
  const [submitting, setSubmitting] = useState(false);

  const f = (key: keyof FitnessFormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = async () => {
    if (!learnerId || !form.test_date) return;
    setSubmitting(true);
    try {
      const result = await HealthSportsService.submitFitnessTest(learnerId, {
        test_date: form.test_date,
        assessed_by: form.assessed_by || null,
        height_cm: parseOptionalFloat(form.height_cm),
        weight_kg: parseOptionalFloat(form.weight_kg),
        beep_test_level: parseOptionalFloat(form.beep_test_level),
        push_ups_count: parseOptionalInt(form.push_ups_count),
        sit_ups_count: parseOptionalInt(form.sit_ups_count),
        grip_strength_kg: parseOptionalFloat(form.grip_strength_kg),
        sit_and_reach_cm: parseOptionalFloat(form.sit_and_reach_cm),
        sprint_50m_seconds: parseOptionalFloat(form.sprint_50m_seconds),
        shuttle_run_seconds: parseOptionalFloat(form.shuttle_run_seconds),
        distance_run_meters: parseOptionalFloat(form.distance_run_meters),
        fitness_score: parseOptionalFloat(form.fitness_score),
        notes: form.notes || null,
      });
      onTestAdded(result);
      setForm(EMPTY_FITNESS_FORM);
      setOpen(false);
    } catch (err) {
      console.error('[health/fitness] Failed to submit fitness test', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-3 pt-4">
        <button
          className="flex w-full items-center justify-between gap-2 text-left"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="h-4 w-4 text-emerald-600" />
            Record New Fitness Test
          </CardTitle>
          {open ? (
            <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
          )}
        </button>
      </CardHeader>

      {open && (
        <CardContent className="pb-5 space-y-5">
          {/* Meta */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Test Date *</Label>
              <Input type="date" value={form.test_date} onChange={f('test_date')} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Assessed By</Label>
              <Input
                placeholder="Faculty name"
                value={form.assessed_by}
                onChange={f('assessed_by')}
              />
            </div>
          </div>

          {/* Body Composition */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Body Composition
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Height (cm)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 170"
                  value={form.height_cm}
                  onChange={f('height_cm')}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Weight (kg)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 65"
                  value={form.weight_kg}
                  onChange={f('weight_kg')}
                />
              </div>
            </div>
          </div>

          {/* Cardiorespiratory */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Cardiorespiratory
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Beep Test Level</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 8.5"
                  value={form.beep_test_level}
                  onChange={f('beep_test_level')}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Distance Run (m)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 2400"
                  value={form.distance_run_meters}
                  onChange={f('distance_run_meters')}
                />
              </div>
            </div>
          </div>

          {/* Muscular Strength */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Muscular Strength & Endurance
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Push-ups (reps)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 30"
                  value={form.push_ups_count}
                  onChange={f('push_ups_count')}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Sit-ups (reps)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 35"
                  value={form.sit_ups_count}
                  onChange={f('sit_ups_count')}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Grip Strength (kg)</Label>
                <Input
                  type="number"
                  step="0.5"
                  placeholder="e.g. 40"
                  value={form.grip_strength_kg}
                  onChange={f('grip_strength_kg')}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Sit & Reach (cm)</Label>
                <Input
                  type="number"
                  step="0.5"
                  placeholder="e.g. 18"
                  value={form.sit_and_reach_cm}
                  onChange={f('sit_and_reach_cm')}
                />
              </div>
            </div>
          </div>

          {/* Speed & Agility */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Speed & Agility
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">50m Sprint (sec)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 7.8"
                  value={form.sprint_50m_seconds}
                  onChange={f('sprint_50m_seconds')}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Shuttle Run (sec)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 18.5"
                  value={form.shuttle_run_seconds}
                  onChange={f('shuttle_run_seconds')}
                />
              </div>
            </div>
          </div>

          {/* Overall Score */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Overall Fitness Score (0–100)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                placeholder="e.g. 72"
                value={form.fitness_score}
                onChange={f('fitness_score')}
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea
              placeholder="Any observations, injuries during test, conditions..."
              rows={2}
              value={form.notes}
              onChange={f('notes')}
              className="resize-none"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setOpen(false);
                setForm(EMPTY_FITNESS_FORM);
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!form.test_date || !learnerId || submitting}
              onClick={handleSubmit}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {submitting ? 'Saving...' : 'Save Test Results'}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ============================================================================
// Main page
// ============================================================================

export default function FitnessPage() {
  const { profile: authProfile, isLoading: authLoading } = useAuth();
  const learnerId = authProfile?.learner_id ?? authProfile?.id ?? '';

  // Show new-test form for faculty/admin roles
  const canAddTest =
    authProfile?.role === 'faculty' ||
    authProfile?.role === 'admin' ||
    authProfile?.role === 'super_admin';

  const [tests, setTests] = useState<HealthFitnessTest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!learnerId) return;
    setLoading(true);
    try {
      const data = await HealthSportsService.getFitnessTests(learnerId);
      setTests(data);
    } catch (err) {
      console.error('[health/fitness] Load error', err);
    } finally {
      setLoading(false);
    }
  }, [learnerId]);

  useEffect(() => {
    if (!authLoading && learnerId) {
      load();
    }
  }, [authLoading, learnerId, load]);

  const isLoading = authLoading || loading;
  const latestTest = tests[0] ?? null;

  const handleTestAdded = (test: HealthFitnessTest) => {
    setTests((prev) => [test, ...prev]);
  };

  return (
    <ContentLayout title="Fitness Tests">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Health', href: '/health/dashboard' },
          { label: 'Fitness Tests' },
        ]}
      />

      <div className="mt-4 space-y-5 max-w-2xl pb-10">
        {/* Page heading */}
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Fitness Tests</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Khelo India-aligned fitness assessments tracked each semester.
          </p>
        </div>

        {/* 1. Latest Test Results */}
        <LatestTestCard test={latestTest} isLoading={isLoading} />

        {/* 2. Fitness Category Badge — shown alongside latest test */}
        {!isLoading && latestTest?.fitness_category && (
          <div className="flex items-center gap-3">
            <p className="text-sm text-slate-500">Overall Category</p>
            {(() => {
              const cfg = FITNESS_CATEGORY_CONFIG[latestTest.fitness_category];
              return (
                <Badge
                  className={cn(
                    'text-base px-4 py-1.5 font-bold border',
                    cfg.bg,
                    cfg.color,
                    'border-current/20'
                  )}
                  variant="outline"
                >
                  {cfg.label}
                </Badge>
              );
            })()}
          </div>
        )}

        {/* 3. History Timeline */}
        <HistoryTimeline tests={tests} isLoading={isLoading} />

        {/* 4. VO2 Max Info */}
        <VO2MaxInfoCard />

        {/* 5. New Test Entry — faculty/admin only */}
        {canAddTest && (
          <NewTestEntryForm learnerId={learnerId} onTestAdded={handleTestAdded} />
        )}
      </div>
    </ContentLayout>
  );
}
