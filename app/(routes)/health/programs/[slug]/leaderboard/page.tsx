'use client';

/**
 * health/programs/[slug]/leaderboard/page.tsx
 * JKKN Health — Wellness Programs: COMPETITIVE section-level completion leaderboard.
 *
 * Sections (NOT individuals) ranked by what share of their participating members
 * finished every published day of the program. Privacy-guarded:
 *   • No student names. No "who didn't participate". Aggregate counts only.
 *   • Small sections are hidden (director-set min size) so a tiny section can't
 *     be de-anonymised by inference.
 *   • Aggregate data only → NOT wrapped in HealthConsentProvider (no personal
 *     health data is shown here).
 *
 * The entry LINK to this page is added by a sibling lane (the consume page);
 * this lane builds only the page itself.
 */

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  Trophy,
  ShieldCheck,
  Medal,
  Users,
  Leaf,
  Info,
} from 'lucide-react';
import { useProgram } from '@/hooks/health/use-wellness-programs';
import { useSectionLeaderboard } from '@/hooks/health/use-wellness-leaderboard';
import type { SectionLeaderboardRow } from '@/lib/services/health/wellness-leaderboard-service';

// ============================================================================
// Rank medal — top-3 get colour, the rest a plain number.
// ============================================================================

function RankBadge({ rank }: { rank: number }) {
  const palette =
    rank === 1
      ? 'bg-amber-100 text-amber-700 border-amber-300'
      : rank === 2
      ? 'bg-slate-100 text-slate-600 border-slate-300'
      : rank === 3
      ? 'bg-orange-100 text-orange-700 border-orange-300'
      : 'bg-white text-slate-500 border-slate-200';
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold tabular-nums ${palette}`}
      aria-label={`Rank ${rank}`}
    >
      {rank <= 3 ? <Medal className="h-4 w-4" /> : rank}
    </span>
  );
}

// ============================================================================
// One ranked section bar.
// ============================================================================

function SectionBar({
  row,
  isYours,
  isLeader,
}: {
  row: SectionLeaderboardRow;
  isYours: boolean;
  isLeader: boolean;
}) {
  const barColor = isYours
    ? 'bg-teal-500'
    : isLeader
    ? 'bg-emerald-500'
    : 'bg-emerald-400/70';

  return (
    <div
      className={`rounded-2xl border-2 px-4 py-3 transition-all ${
        isYours
          ? 'border-teal-300 bg-teal-50/70 ring-1 ring-teal-200'
          : 'border-slate-100 bg-white hover:border-emerald-200'
      }`}
    >
      <div className="flex items-center gap-3">
        <RankBadge rank={row.rank} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-semibold text-slate-800">
              {row.section_label}
              {isYours && (
                <span className="ml-2 rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-teal-700">
                  Your section
                </span>
              )}
            </p>
            <span className="shrink-0 text-base font-extrabold tabular-nums text-emerald-700">
              {row.completion_pct}%
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all duration-700 ${barColor}`}
              style={{ width: `${Math.min(row.completion_pct, 100)}%` }}
            />
          </div>
          <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
            <Users className="h-3 w-3" />
            {row.members} participating member{row.members !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Skeleton
// ============================================================================

function LeaderboardSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-16 w-full rounded-2xl" />
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-2xl" />
      ))}
    </div>
  );
}

// ============================================================================
// Inner
// ============================================================================

function LeaderboardInner({ slug }: { slug: string }) {
  const { data: program, isLoading: programLoading } = useProgram(slug);
  const {
    data: board,
    isLoading: boardLoading,
    isError,
  } = useSectionLeaderboard(program?.id);

  const sections = board?.sections ?? [];
  const topPct = sections.length > 0 ? sections[0].completion_pct : 0;

  const minSize = board?.min_section_size ?? 10;

  const yourSectionId = board?.your_section_id ?? null;
  const yourRow = useMemo(
    () => sections.find((s) => s.section_id === yourSectionId) ?? null,
    [sections, yourSectionId]
  );

  if (programLoading) return <LeaderboardSkeleton />;

  if (!program) {
    return (
      <Card className="border-dashed border-slate-200">
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <Leaf className="h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">Program not found</p>
          <p className="text-xs text-slate-400">
            This program may have ended or the link is incorrect.
          </p>
          <Link href="/health/programs" className="mt-2">
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-1 h-3.5 w-3.5" />
              Back to programs
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Back link */}
      <Link
        href={`/health/programs/${slug}`}
        className="inline-flex items-center gap-1 text-sm text-slate-500 transition-colors hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to program
      </Link>

      {/* Header */}
      <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-teal-50/60 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-emerald-200 bg-white">
            <Trophy className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-tight text-slate-800">
              Section Leaderboard
            </h1>
            <p className="truncate text-xs text-slate-500">{program.title}</p>
          </div>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          Sections ranked by completion. Small sections are hidden to protect
          privacy.
        </p>
      </div>

      {/* Your-section callout (if the viewer's section is on the board) */}
      {yourRow && (
        <Card className="border-teal-200 bg-teal-50/60">
          <CardContent className="flex items-center gap-3 py-3 px-4">
            <Medal className="h-5 w-5 shrink-0 text-teal-600" />
            <p className="text-sm text-slate-700">
              Your section{' '}
              <span className="font-semibold text-teal-700">
                {yourRow.section_label}
              </span>{' '}
              is ranked{' '}
              <span className="font-semibold text-teal-700">#{yourRow.rank}</span>{' '}
              at{' '}
              <span className="font-semibold text-teal-700">
                {yourRow.completion_pct}%
              </span>
              .
            </p>
          </CardContent>
        </Card>
      )}

      {/* Board */}
      {boardLoading ? (
        <LeaderboardSkeleton />
      ) : isError ? (
        <Card className="border-dashed border-slate-200">
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Info className="h-7 w-7 text-slate-300" />
            <p className="text-sm font-medium text-slate-500">
              Leaderboard unavailable
            </p>
            <p className="max-w-xs text-xs text-slate-400">
              You may not have access to this leaderboard, or it could not be
              loaded right now.
            </p>
          </CardContent>
        </Card>
      ) : sections.length === 0 ? (
        <Card className="border-dashed border-emerald-200 bg-emerald-50/40">
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <ShieldCheck className="h-8 w-8 text-emerald-400" />
            <p className="text-sm font-medium text-slate-600">
              No sections to show yet
            </p>
            <p className="max-w-xs text-xs text-slate-500">
              A section needs at least {minSize} participating members before it
              appears here. Check back as more people join in.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {sections.map((row) => (
            <SectionBar
              key={row.section_id}
              row={row}
              isYours={row.section_id === yourSectionId}
              isLeader={row.completion_pct === topPct && topPct > 0}
            />
          ))}
        </div>
      )}

      {/* Privacy footnote */}
      <div className="flex items-start gap-2 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
        <p className="text-[11px] leading-relaxed text-slate-500">
          This board ranks sections, never individuals. It never shows who did or
          did not take part. Sections with fewer than {minSize} participating
          members are hidden so no one can be identified.
        </p>
      </div>

      <div className="h-4" />
    </div>
  );
}

// ============================================================================
// Page
// ============================================================================

export default function WellnessSectionLeaderboardPage() {
  const params = useParams<{ slug: string }>();
  const slug = typeof params?.slug === 'string' ? params.slug : '';

  return (
    <ContentLayout title="Section Leaderboard">
      <LeaderboardInner slug={slug} />
    </ContentLayout>
  );
}
