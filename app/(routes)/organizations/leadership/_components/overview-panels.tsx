'use client';

import { Building2, Crown, PieChart, UserX, Users, type LucideIcon } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { LeadershipStats } from '@/lib/organizations/leadership-stats';

// Gradient stat cards. Every gradient starts at a 700-weight stop (600 for
// indigo/fuchsia) so white text stays at roughly 4.9:1 or better on the LIGHTER
// end, where the label sits (estimated from Tailwind's palette values, not
// measured in a browser). Dark mode deepens the gradient rather than washing it out.
type Tone = 'emerald' | 'indigo' | 'amber' | 'sky' | 'fuchsia';

const TONES: Record<Tone, string> = {
  emerald: 'from-emerald-700 to-teal-800 dark:from-emerald-700 dark:to-teal-900',
  indigo: 'from-indigo-600 to-violet-700 dark:from-indigo-700 dark:to-violet-900',
  amber: 'from-orange-700 to-rose-700 dark:from-orange-700 dark:to-rose-900',
  sky: 'from-sky-700 to-blue-800 dark:from-sky-700 dark:to-blue-900',
  fuchsia: 'from-fuchsia-600 to-purple-700 dark:from-fuchsia-700 dark:to-purple-900',
};

function Kpi({
  label,
  value,
  hint,
  tone,
  icon: Icon,
  ratio,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone: Tone;
  icon: LucideIcon;
  /** 0–100; draws a slim progress bar when a ratio is meaningful. */
  ratio?: number;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br p-4 text-white shadow-lg ${TONES[tone]}`}
    >
      {/* soft light blob — depth without a second colour */}
      <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/15 blur-2xl" aria-hidden />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-white/85">{label}</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums leading-none">{value}</p>
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      </div>
      {ratio !== undefined && (
        <div className="relative mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/25" role="presentation">
          <div className="h-full rounded-full bg-white" style={{ width: `${Math.min(100, Math.max(0, ratio))}%` }} />
        </div>
      )}
      {hint && <p className="relative mt-2 text-xs text-white/80">{hint}</p>}
    </div>
  );
}

export function KpiRow({
  stats,
  group,
}: {
  stats: LeadershipStats;
  group: { filled: number; total: number };
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Kpi
        label="Institutions fully staffed"
        value={`${stats.fullyStaffed} / ${stats.colleges}`}
        hint="Every applicable post filled"
        tone="emerald"
        icon={Building2}
        ratio={stats.colleges ? (stats.fullyStaffed / stats.colleges) * 100 : 0}
      />
      <Kpi
        label="Overall coverage"
        value={`${stats.coveragePct}%`}
        hint={`${stats.filledPosts} of ${stats.totalPosts} posts filled`}
        tone="indigo"
        icon={PieChart}
        ratio={stats.coveragePct}
      />
      <Kpi
        label="Vacant posts"
        value={stats.vacantPosts}
        hint="Across each institution's own posts"
        tone="amber"
        icon={UserX}
      />
      <Kpi
        label="Group posts appointed"
        value={group.total ? `${group.filled} / ${group.total}` : '—'}
        hint={group.total ? 'Common to all institutions' : 'No group posts yet'}
        tone="fuchsia"
        icon={Crown}
        ratio={group.total ? (group.filled / group.total) * 100 : undefined}
      />
      <Kpi
        label="Leaders at 2+ institutions"
        value={stats.multiCollege.length}
        hint="Hold posts in more than one"
        tone="sky"
        icon={Users}
      />
    </div>
  );
}

export function CoverageByPost({ stats }: { stats: LeadershipStats }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Coverage by post</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {stats.perPost.map((p) => (
          <div key={p.code}>
            <div className="mb-1.5 flex items-baseline justify-between text-sm">
              <span className="font-medium">{p.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {p.filled}/{p.applicable} · {p.pct}%
                {p.vacant > 0 && (
                  <span className="ml-2 text-amber-700 dark:text-amber-500">{p.vacant} vacant</span>
                )}
              </span>
            </div>
            <Progress value={p.pct} aria-label={`${p.label} coverage`} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function BasisBreakdownPanel({ stats }: { stats: LeadershipStats }) {
  const { basis } = stats;
  const rows = [
    { label: 'Personal — does not pass to a successor', n: basis.personal, bar: 'bg-violet-500' },
    { label: 'Comes with another post / passes on', n: basis.successor, bar: 'bg-emerald-500' },
    { label: 'Reason not recorded', n: basis.notRecorded, bar: 'bg-amber-500' },
  ];
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Why Principal / VP posts were given</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {basis.total === 0 ? (
          <p className="text-sm text-muted-foreground">No Principal or Vice Principal posts are filled.</p>
        ) : (
          <>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted" role="img"
              aria-label="Appointment basis breakdown">
              {rows.map((r) => (
                <div key={r.label} className={r.bar} style={{ width: `${(r.n / basis.total) * 100}%` }} />
              ))}
            </div>
            <ul className="space-y-1.5 text-sm">
              {rows.map((r) => (
                <li key={r.label} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${r.bar}`} aria-hidden />
                    {r.label}
                  </span>
                  <span className="tabular-nums text-muted-foreground">{r.n}</span>
                </li>
              ))}
            </ul>
            {basis.notRecorded > 0 && (
              <p className="text-xs text-muted-foreground">
                Unrecorded posts are never assumed to be ex officio. Open the college to record the reason.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function MultiCollegePanel({ stats }: { stats: LeadershipStats }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Leaders across multiple colleges</CardTitle>
      </CardHeader>
      <CardContent>
        {stats.multiCollege.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody holds posts at more than one college.</p>
        ) : (
          <ul className="space-y-3">
            {stats.multiCollege.map((h) => (
              <li key={h.user_id} className="text-sm">
                <p className="font-medium">{h.name}</p>
                <dl className="mt-1 space-y-0.5">
                  {[...new Set(h.colleges.map((c) => c.post))].map((post) => {
                    const at = h.colleges.filter((c) => c.post === post);
                    return (
                      <div key={post} className="flex flex-wrap gap-x-2 text-xs">
                        <dt className="font-medium text-muted-foreground">{at[0].post_label}:</dt>
                        <dd>{at.map((c) => c.institution_name).join(', ')}</dd>
                      </div>
                    );
                  })}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
