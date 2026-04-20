// app/(routes)/accreditation/nba/page.tsx
// ============================================================================
// /accreditation/nba — NBA Per-Program Dashboard (PR-A10 — Unification 10/15).
//
// NBA Tier-II rubric (1000 pts total):
//   1.  Vision, Mission & PEOs                  50
//   2.  POs & COs                              150
//   3.  Curriculum & Syllabus                  100
//   4.  Teaching-Learning Processes            100
//   5.  Students' Performance                  150
//   6.  Faculty Information & Contributions    200
//   7.  Facilities & Technical Support          80
//   8.  Continuous Improvement                  50
//   9.  First-year Academics                    50
//   10. Student Support Systems                 50
//
// Thresholds: ≥750 full accreditation · 600-749 3yr · 400-599 provisional.
// Scope: per engineering program (NOT per-college) — program switcher needed.
// ============================================================================

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Briefcase,
  Target,
  BookOpen,
  GraduationCap,
  Trophy,
  Users as UsersIcon,
  Building2,
  RefreshCw,
  Sparkles,
  ClipboardCheck,
  BarChart3,
  AlertTriangle,
} from 'lucide-react';
import { ACCREDITATION_BODIES } from '@/lib/types/accreditation';
import {
  useNBAMetrics,
  useNBAEvidenceCounts,
  useEngineeringPrograms,
  type NBAMetric,
} from '@/hooks/accreditation/use-nba-dashboard';

interface CriterionMeta {
  key: string;
  num: number;
  name: string;
  weight: number;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  description: string;
  matchTokens: string[];
}

const NBA_CRITERIA: CriterionMeta[] = [
  {
    key: '01_peo',
    num: 1,
    name: 'Vision, Mission & PEOs',
    weight: 50,
    icon: Target,
    accent: 'text-indigo-600',
    description: 'Program Educational Objectives stated + published + disseminated.',
    matchTokens: ['peo', 'vision', 'mission'],
  },
  {
    key: '02_po_co',
    num: 2,
    name: 'POs & COs',
    weight: 150,
    icon: ClipboardCheck,
    accent: 'text-blue-600',
    description: 'Program Outcomes + Course Outcomes mapping, attainment measurement.',
    matchTokens: ['po', 'co', 'outcome', 'mapping', 'attainment'],
  },
  {
    key: '03_curriculum',
    num: 3,
    name: 'Curriculum & Syllabus',
    weight: 100,
    icon: BookOpen,
    accent: 'text-cyan-600',
    description: 'Curriculum structure, electives, industry alignment, revision cycles.',
    matchTokens: ['curriculum', 'syllabus', 'elective'],
  },
  {
    key: '04_tl_process',
    num: 4,
    name: 'Teaching-Learning Processes',
    weight: 100,
    icon: GraduationCap,
    accent: 'text-emerald-600',
    description: 'Delivery, tutorials, labs, projects, continuous assessment methods.',
    matchTokens: ['teaching', 'learning', 'process', 'delivery', 'tutorial', 'assessment'],
  },
  {
    key: '05_student_perf',
    num: 5,
    name: "Students' Performance",
    weight: 150,
    icon: Trophy,
    accent: 'text-amber-600',
    description: 'Admissions, CGPA, graduation rates, placements, higher studies.',
    matchTokens: ['student-performance', 'cgpa', 'placement', 'graduation-rate'],
  },
  {
    key: '06_faculty',
    num: 6,
    name: 'Faculty Information & Contributions',
    weight: 200,
    icon: UsersIcon,
    accent: 'text-purple-600',
    description: 'Faculty qualifications, research output, sponsored projects, consultancy.',
    matchTokens: ['faculty', 'publication', 'research', 'consultancy', 'sponsored'],
  },
  {
    key: '07_facilities',
    num: 7,
    name: 'Facilities & Technical Support',
    weight: 80,
    icon: Building2,
    accent: 'text-sky-600',
    description: 'Labs, libraries, computing, workshops, maintenance.',
    matchTokens: ['facility', 'lab', 'library', 'infrastructure'],
  },
  {
    key: '08_ci',
    num: 8,
    name: 'Continuous Improvement',
    weight: 50,
    icon: RefreshCw,
    accent: 'text-rose-600',
    description: 'PDCA loop: feedback, corrective actions, outcome attainment trends.',
    matchTokens: ['continuous-improvement', 'pdca', 'feedback'],
  },
  {
    key: '09_fy',
    num: 9,
    name: 'First-year Academics',
    weight: 50,
    icon: Sparkles,
    accent: 'text-lime-600',
    description: 'Mathematics, physics, chemistry, engineering-graphics foundations.',
    matchTokens: ['first-year', 'foundation'],
  },
  {
    key: '10_support',
    num: 10,
    name: 'Student Support Systems',
    weight: 50,
    icon: GraduationCap,
    accent: 'text-violet-600',
    description: 'Mentoring, counselling, career cell, alumni engagement, scholarships.',
    matchTokens: ['student-support', 'mentoring', 'counselling', 'career', 'scholarship'],
  },
];

const NBA_TIER2_TOTAL = 1000;

function categoriseMetric(m: NBAMetric): string {
  const haystack = `${m.category ?? ''} ${m.metric_code} ${m.metric_name}`.toLowerCase();
  for (const c of NBA_CRITERIA) {
    if (c.matchTokens.some((tok) => haystack.includes(tok))) return c.key;
  }
  return 'other';
}

export default function NBADashboardPage() {
  const [selectedProgram, setSelectedProgram] = useState<string>('all');

  const { data: programs, isLoading: progLoading } = useEngineeringPrograms();
  const { data: metrics, isLoading: metricsLoading } = useNBAMetrics();
  const { data: evidenceCounts, isLoading: evLoading } = useNBAEvidenceCounts();

  const nbaMeta = ACCREDITATION_BODIES.find((b) => b.code === 'NBA')!;

  const metricsByCriterion = (metrics ?? []).reduce<Record<string, NBAMetric[]>>(
    (acc, m) => {
      const key = categoriseMetric(m);
      if (!acc[key]) acc[key] = [];
      acc[key]!.push(m);
      return acc;
    },
    {},
  );

  const totalMetrics = (metrics ?? []).length;
  const totalEvidence = Object.values(evidenceCounts ?? {}).reduce((s, n) => s + n, 0);
  const uncategorisedCount = (metricsByCriterion['other'] ?? []).length;

  return (
    <ContentLayout title="NBA — Per-Program Dashboard">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Accreditation', href: '/accreditation' },
          { label: 'NBA', href: '/accreditation/nba' },
        ]}
      />

      <div className="space-y-6">
        {/* Header */}
        <Card className={`border-2 ${nbaMeta.accentClass}`}>
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <Briefcase className="h-7 w-7 text-emerald-600" />
                  NBA — National Board of Accreditation
                </CardTitle>
                <p className="mt-2 text-sm text-muted-foreground">
                  Program-level accreditation (Tier-II, 1000 pts). Thresholds:
                  ≥750 full · 600-749 3-yr · 400-599 provisional. Scope: engineering
                  programs at JKKN College of Engineering.
                </p>
              </div>

              {/* Program switcher (not a college switcher — NBA is per-program) */}
              <div className="min-w-[280px]">
                <Select
                  value={selectedProgram}
                  onValueChange={setSelectedProgram}
                  disabled={progLoading}
                >
                  <SelectTrigger className="bg-card">
                    <SelectValue placeholder="Select engineering program" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All engineering programs</SelectItem>
                    {(programs ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.program_code ? `[${p.program_code}] ` : ''}
                        {p.program_name ?? 'Unnamed program'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!progLoading && (programs ?? []).length === 0 && (
                  <p className="mt-1 text-[10px] text-amber-700">
                    No engineering programs found
                  </p>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Metrics seeded</div>
                <div className="text-2xl font-bold">
                  {metricsLoading ? '—' : totalMetrics}
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Tier-II max</div>
                <div className="text-2xl font-bold">{NBA_TIER2_TOTAL}</div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Evidence rows</div>
                <div className="text-2xl font-bold">
                  {evLoading ? '—' : totalEvidence}
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Eligible programs</div>
                <div className="text-2xl font-bold">
                  {progLoading ? '—' : programs?.length ?? 0}
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/accreditation/coverage">
                <Button variant="outline" size="sm">
                  <BarChart3 className="mr-2 h-4 w-4" />
                  Coverage matrix
                </Button>
              </Link>
              <Button variant="outline" size="sm" disabled>
                SAR generator (soon)
              </Button>
            </div>

            {!progLoading && (programs ?? []).length === 0 && (
              <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="text-xs">
                  No engineering programs found. Ensure at least one institution has{' '}
                  <code>iqac_code = &apos;ENGG&apos;</code> or{' '}
                  <code>name ILIKE &apos;%engineering%&apos;</code> and at least one row in{' '}
                  <code>programs</code>.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 10 criteria cards */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {NBA_CRITERIA.map((c) => {
            const metricList = metricsByCriterion[c.key] ?? [];
            const critMax = metricList.reduce((s, m) => s + (m.max_score ?? 0), 0);
            const critEvidence = metricList.reduce(
              (s, m) => s + (evidenceCounts?.[m.metric_code] ?? 0),
              0,
            );
            const Icon = c.icon;
            return (
              <Card key={c.key} className="h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Icon className={`h-5 w-5 ${c.accent}`} />
                      <span>Criterion {c.num}</span>
                    </CardTitle>
                    <Badge variant="outline" className="text-[10px]">
                      {c.weight} pts
                    </Badge>
                  </div>
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.description}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-muted-foreground">Metrics</div>
                      <div className="text-lg font-semibold">{metricList.length}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Evidence</div>
                      <div className="text-lg font-semibold">{critEvidence}</div>
                    </div>
                  </div>
                  {metricList.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        View {metricList.length} metric{metricList.length === 1 ? '' : 's'}
                      </summary>
                      <ul className="mt-2 space-y-1 pl-2">
                        {metricList.map((m) => (
                          <li
                            key={m.metric_code}
                            className="flex items-start justify-between gap-2"
                          >
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {m.metric_code}
                            </span>
                            <span className="flex-1 text-[11px]">{m.metric_name}</span>
                            <Badge variant="secondary" className="text-[9px]">
                              {evidenceCounts?.[m.metric_code] ?? 0}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {uncategorisedCount > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Uncategorised NBA metrics</CardTitle>
              <p className="text-xs text-muted-foreground">
                Metrics not matched against any of the 10 Tier-II criteria. Re-tag
                at source or extend <code>NBA_CRITERIA[].matchTokens</code>.
              </p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-xs">
                {(metricsByCriterion['other'] ?? []).map((m) => (
                  <li
                    key={m.metric_code}
                    className="flex items-start justify-between gap-2"
                  >
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {m.metric_code}
                    </span>
                    <span className="flex-1">{m.metric_name}</span>
                    <Badge variant="secondary" className="text-[9px]">
                      {evidenceCounts?.[m.metric_code] ?? 0}
                    </Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <Card className="bg-muted/30">
          <CardContent className="pt-6 text-xs text-muted-foreground space-y-2">
            <p>
              <strong>Per-program, not per-college:</strong> NBA accredits individual
              programs. This dashboard's program switcher lists all engineering
              programs at JKKN College of Engineering. Non-engineering programs
              are out of NBA scope (they flow through AICTE / NAAC instead).
            </p>
            <p>
              <strong>Tier-I vs Tier-II:</strong> JKKN currently targets Tier-II
              (NBA-2019 rubric, 1000 pts total). Tier-I (for post-graduate programs
              with Masters-qualified intake) uses a slightly different weight
              distribution — add a Tier-I rubric variant in a follow-up PR as needed.
            </p>
            <p>
              Evidence flows will wire from academic (CO/PO mapping, CGPA), HR
              (faculty qualifications, publications), and placement (graduation
              outcomes) modules as they get retrofitted under the Unification Program.
            </p>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
