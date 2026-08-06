// ============================================
// LEARNER PROFILE — 360° STANDING SECTION (SERVER COMPONENT)
// ============================================
// Created: 2026-07-30
// Purpose: Show how a learner is actually DOING — the profile page previously
//   rendered eight cards off a single table and the only number anywhere on it
//   was NEET Score, a pre-admission entrance figure.
//
// Access model — enforced once, in the database:
//   * Risk band + recommended actions  → admin, HOD/faculty in-department, and
//     the learner themselves (Director decision, 2026-07-30).
//   * Contribution/value RANKING       → ADMIN-ONLY. Its RLS policy gates on
//     `learners.contribution.view`; a faculty or learner session reads no row
//     and the card is absent. There is deliberately no client-side hide.
// ============================================

import {
  Activity,
  CalendarCheck,
  ClipboardList,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { getLearner360 } from '../_data/get-learner-360';
import { AiAgencyCard } from './ai-agency-card';
import type { RiskTier, DimensionScores } from '@/types/learner-risk';
import type { ContributionTier } from '@/types/learner-contribution';
import type { ExamAuditAttendanceBucket } from '@/types/exam-audit';

interface Learner360SectionProps {
  learnerId: string;
}

// ── Honest blanks ────────────────────────────────────────────────────────────
// Four of the seven risk dimensions score 0 for EVERY learner because their
// feeder sources are empty or not wired yet — verified 2026-07-30 against all
// 4,342 assessment rows: academic, wellness, hostel and belonging had zero
// non-zero values, while attendance (2,290), engagement (3,396) and fees (723)
// were live. A 0 in those four means "unmeasured", and showing it as a score
// would read as a GOOD score, so it is rendered as "No data yet" instead.
//
// This list is a safety net, not a mute: if one of these sources comes online
// and starts producing non-zero values, the real number is rendered anyway (see
// the `value > 0` check in DimensionRow). Delete the entry when that happens.
const UNSOURCED_RISK_DIMENSIONS = new Set<keyof DimensionScores>([
  'academic',
  'wellness',
  'hostel',
  'belonging',
]);

const RISK_DIMENSION_LABELS: Record<keyof DimensionScores, string> = {
  attendance: 'Attendance',
  engagement: 'Platform engagement',
  fees: 'Fees',
  academic: 'Academic performance',
  wellness: 'Wellness',
  hostel: 'Hostel',
  belonging: 'Belonging',
};

// Ordered so the three live dimensions lead and the unmeasured ones trail.
const RISK_DIMENSION_ORDER: Array<keyof DimensionScores> = [
  'attendance',
  'engagement',
  'fees',
  'academic',
  'wellness',
  'hostel',
  'belonging',
];

const RISK_TIER_LABELS: Record<RiskTier, string> = {
  healthy: 'Healthy',
  low: 'Low concern',
  moderate: 'Moderate concern',
  high: 'High concern',
  critical: 'Critical',
};

const RISK_TIER_CLASSES: Record<RiskTier, string> = {
  healthy: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  low: 'bg-lime-100 text-lime-800 border-lime-300',
  moderate: 'bg-amber-100 text-amber-800 border-amber-300',
  high: 'bg-orange-100 text-orange-800 border-orange-300',
  critical: 'bg-red-100 text-red-800 border-red-300',
};

const CONTRIBUTION_TIER_LABELS: Record<ContributionTier, string> = {
  minimal: 'Minimal',
  emerging: 'Emerging',
  steady: 'Steady',
  strong: 'Strong',
  exceptional: 'Exceptional',
};

const CONTRIBUTION_TIER_CLASSES: Record<ContributionTier, string> = {
  minimal: 'bg-slate-100 text-slate-700 border-slate-300',
  emerging: 'bg-sky-100 text-sky-800 border-sky-300',
  steady: 'bg-blue-100 text-blue-800 border-blue-300',
  strong: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  exceptional: 'bg-violet-100 text-violet-800 border-violet-300',
};

const CONTRIBUTION_DIMENSION_LABELS: Record<string, string> = {
  events_leadership: 'Event leadership',
  events_participation: 'Event participation',
  career_development: 'Career development',
  induction_engagement: 'Induction engagement',
  pde_demonstrations: 'PDE demonstrations',
};

// The same honest-blank problem exists on the contribution side, inverted: two of
// the five dimensions are 0 for EVERY learner (verified 2026-07-30 — 0 non-zero
// values across all 4,342 rows for pde_demonstrations and induction_engagement,
// against 3,032 / 1,042 / 690 for the three live ones). Here a bare 0 reads as
// "this learner contributed nothing", which is unfair rather than flattering —
// it is still a number standing in for an unasked question. Same rule applies.
const UNSOURCED_CONTRIBUTION_DIMENSIONS = new Set<string>([
  'pde_demonstrations',
  'induction_engagement',
]);

/** Turn a snake_case risk factor code into readable prose. */
function humanizeFactor(code: string): string {
  return code.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function DimensionRow({
  label,
  value,
  unmeasured,
}: {
  label: string;
  value: number;
  unmeasured: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        {unmeasured ? (
          <span className="text-xs italic text-muted-foreground">No data yet</span>
        ) : (
          <span className="font-medium tabular-nums">{value}</span>
        )}
      </div>
      {unmeasured ? (
        <div className="h-2 w-full rounded-full border border-dashed border-muted-foreground/30" />
      ) : (
        <Progress value={value} className="h-2" />
      )}
    </div>
  );
}

function EligibilityBadge({
  bucket,
  thresholds,
}: {
  bucket: ExamAuditAttendanceBucket;
  thresholds: { eligibility: number; condonation: number };
}) {
  // The bucket NAMES ('below_65'/'below_75') are a stable API and do not track
  // the configured numbers — always render the resolved thresholds, never the
  // digits inside the bucket name.
  if (bucket === 'ok') {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">
        Clear to sit ({thresholds.eligibility}% or above)
      </Badge>
    );
  }
  if (bucket === 'below_75') {
    return (
      <Badge className="bg-amber-100 text-amber-800 border-amber-300">
        Condonation band ({thresholds.condonation}–{thresholds.eligibility}%)
      </Badge>
    );
  }
  if (bucket === 'below_65') {
    return (
      <Badge className="bg-red-100 text-red-800 border-red-300">
        Not eligible (below {thresholds.condonation}%)
      </Badge>
    );
  }
  return <Badge variant="outline">No attendance recorded</Badge>;
}

export async function Learner360Section({ learnerId }: Learner360SectionProps) {
  let data: Awaited<ReturnType<typeof getLearner360>>;
  try {
    data = await getLearner360(learnerId);
  } catch (error) {
    console.error('[Learner360Section] Failed to load 360 standing:', error);
    // Fail silent: the rest of the profile page must still render.
    return null;
  }

  const { risk, contribution, attendance, eligibility, funnel } = data;

  // Nothing readable for this viewer (or nothing computed yet) — render nothing
  // rather than a shell of empty cards. The funnel test demands PROVEN zeroes:
  // a stage we were refused must not masquerade as "did nothing" and take the
  // whole section down with it.
  const funnelProvenEmpty =
    funnel.attended.status === 'counted' &&
    funnel.attended.count === 0 &&
    funnel.builds.status === 'counted' &&
    funnel.builds.count === 0;
  if (!risk && !contribution && !attendance && funnelProvenEmpty) {
    return null;
  }

  const attendancePct =
    attendance?.last_14d_pct !== null && attendance?.last_14d_pct !== undefined
      ? Number(attendance.last_14d_pct)
      : null;

  return (
    <section className="space-y-4" aria-labelledby="learner-360-heading">
      <div>
        <h2 id="learner-360-heading" className="text-xl font-semibold tracking-tight">
          360° Standing
        </h2>
        <p className="text-sm text-muted-foreground">
          How this learner is actually doing right now — not how they were admitted.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* ── Risk band ───────────────────────────────────────────────── */}
        {risk ? (
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Risk band
                  </CardTitle>
                  <CardDescription>
                    Assessed {risk.assessment_date} · {risk.confidence} confidence
                  </CardDescription>
                </div>
                <Badge className={RISK_TIER_CLASSES[risk.risk_tier]}>
                  {RISK_TIER_LABELS[risk.risk_tier]}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">
                    Composite risk score
                  </span>
                  <span className="text-2xl font-bold tabular-nums">
                    {risk.composite_risk_score}
                    <span className="text-sm font-normal text-muted-foreground">/100</span>
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Higher means more concern. This is a band, not a grade.
                </p>
              </div>

              <div className="space-y-3">
                {RISK_DIMENSION_ORDER.map((key) => {
                  const value = Number(risk.dimension_scores?.[key] ?? 0);
                  const unmeasured = UNSOURCED_RISK_DIMENSIONS.has(key) && value === 0;
                  return (
                    <DimensionRow
                      key={key}
                      label={RISK_DIMENSION_LABELS[key]}
                      value={value}
                      unmeasured={unmeasured}
                    />
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* ── Attendance + exam eligibility ───────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarCheck className="h-5 w-5" />
              Attendance &amp; exam eligibility
            </CardTitle>
            <CardDescription>Rolling last 14 days</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {attendancePct === null ? (
              <p className="text-sm italic text-muted-foreground">
                No data yet — no attendance has been recorded for this learner.
              </p>
            ) : (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">Last 14 days</span>
                  <span className="text-2xl font-bold tabular-nums">
                    {attendancePct.toFixed(1)}%
                  </span>
                </div>
                <Progress value={Math.min(100, Math.max(0, attendancePct))} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  {attendance?.total_present_14d ?? 0} present of{' '}
                  {attendance?.total_classes_14d ?? 0} classes
                  {attendance?.last_absent_date
                    ? ` · last absent ${attendance.last_absent_date}`
                    : ''}
                </p>
                {eligibility ? (
                  <div className="pt-1">
                    <EligibilityBadge
                      bucket={eligibility.bucket}
                      thresholds={eligibility.thresholds}
                    />
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        {/* ── What to do next ─────────────────────────────────────────── */}
        {risk && (risk.recommended_actions?.length > 0 || risk.risk_factors?.length > 0) ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                What to do next
              </CardTitle>
              <CardDescription>Generated from the dimensions above</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {risk.recommended_actions?.length > 0 ? (
                <ul className="space-y-2">
                  {risk.recommended_actions.map((action) => (
                    <li key={action} className="flex items-start gap-2 text-sm">
                      <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      <span>{action}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {risk.risk_factors?.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                  <TriangleAlert
                    aria-hidden
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                  />
                  {risk.risk_factors.map((factor) => (
                    <Badge key={factor} variant="outline" className="font-normal">
                      {humanizeFactor(factor)}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {/* ── Contribution ranking — ADMIN-ONLY, gated by RLS ─────────── */}
        {contribution ? (
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5" />
                    Contribution
                  </CardTitle>
                  <CardDescription>
                    Visible to administrators only · assessed {contribution.assessment_date}
                  </CardDescription>
                </div>
                <Badge className={CONTRIBUTION_TIER_CLASSES[contribution.contribution_tier]}>
                  {CONTRIBUTION_TIER_LABELS[contribution.contribution_tier]}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Contribution score</span>
                <span className="text-2xl font-bold tabular-nums">
                  {contribution.contribution_score}
                  <span className="text-sm font-normal text-muted-foreground">/100</span>
                </span>
              </div>

              <div className="space-y-3">
                {Object.entries(contribution.dimension_scores ?? {}).map(([key, raw]) => {
                  const value = Number(raw ?? 0);
                  return (
                    <DimensionRow
                      key={key}
                      label={CONTRIBUTION_DIMENSION_LABELS[key] ?? humanizeFactor(key)}
                      value={value}
                      unmeasured={
                        UNSOURCED_CONTRIBUTION_DIMENSIONS.has(key) && value === 0
                      }
                    />
                  );
                })}
              </div>

              {contribution.highlights?.length > 0 ? (
                <ul className="space-y-1 border-t pt-3">
                  {contribution.highlights.map((highlight) => (
                    <li key={highlight} className="text-sm text-muted-foreground">
                      {highlight}
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* AI agency funnel — its own card, full width beneath the standing grid. */}
      <AiAgencyCard funnel={funnel} />
    </section>
  );
}
