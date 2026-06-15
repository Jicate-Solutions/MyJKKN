'use client';

/**
 * health/programs/page.tsx
 * JKKN Health — Wellness Programs (list)
 *
 * Lists the active wellness programs a student/staff member can join.
 * Each program is a short multi-day campaign (e.g. a 7-day yoga awareness
 * week). The card surfaces the program's theme, date range and day count,
 * and links into the day-by-day consume experience at /health/programs/[slug].
 *
 * NO heavy HealthConsentProvider here — awareness viewing is friction-free.
 * The full health-data consent is only needed on the core health pages
 * (dashboard/profile/assessments). A LIGHT, program-specific consent is asked
 * later on the detail page, only before we RECORD a person's participation.
 */

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CalendarDays, Sparkles, ChevronRight, Leaf } from 'lucide-react';
import { useActivePrograms } from '@/hooks/health/use-wellness-programs';
import type { HealthProgram } from '@/types/health-programs';

// ============================================================================
// Helpers
// ============================================================================

function formatRange(start: string | null, end: string | null): string | null {
  if (!start && !end) return null;
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  const s = start ? new Date(start).toLocaleDateString('en-IN', opts) : null;
  const e = end ? new Date(end).toLocaleDateString('en-IN', opts) : null;
  if (s && e) return `${s} – ${e}`;
  return s ?? e;
}

function STATUS_BADGE(status: HealthProgram['status']) {
  if (status === 'active') {
    return { label: 'Live now', cls: 'border-emerald-200 text-emerald-700 bg-emerald-50' };
  }
  // 'scheduled' is the only other status getActivePrograms returns
  return { label: 'Starting soon', cls: 'border-amber-200 text-amber-700 bg-amber-50' };
}

// ============================================================================
// Program card
// ============================================================================

function ProgramCard({ program }: { program: HealthProgram }) {
  const range = formatRange(program.start_date, program.end_date);
  const badge = STATUS_BADGE(program.status);

  return (
    <Link href={`/health/programs/${program.slug}`} className="block">
      <Card className="overflow-hidden border-emerald-100 transition-shadow hover:shadow-md active:scale-[0.99]">
        {/* Theme band — the program's identity strip */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20">
                <Leaf className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0">
                {program.theme && (
                  <p className="text-[11px] font-medium uppercase tracking-wider text-emerald-100 truncate">
                    {program.theme}
                  </p>
                )}
                <h2 className="text-base font-bold text-white leading-tight truncate">
                  {program.title}
                </h2>
              </div>
            </div>
            <Badge
              variant="outline"
              className="shrink-0 border-white/40 bg-white/15 text-white text-[11px] px-2 py-0"
            >
              {badge.label}
            </Badge>
          </div>
        </div>

        {/* Body */}
        <CardContent className="px-5 py-4">
          {program.description && (
            <p className="text-sm text-slate-600 leading-relaxed line-clamp-2">
              {program.description}
            </p>
          )}
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs text-slate-500">
              {range && (
                <span className="flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5 text-emerald-500" />
                  {range}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
                Daily
              </span>
            </div>
            <span className="flex items-center gap-1 text-sm font-medium text-emerald-700">
              Open
              <ChevronRight className="h-4 w-4" />
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ============================================================================
// States
// ============================================================================

function ProgramsSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2].map((i) => (
        <Skeleton key={i} className="h-40 w-full rounded-xl" />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="border-dashed border-emerald-200">
      <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 border border-emerald-100">
          <Leaf className="h-6 w-6 text-emerald-400" />
        </div>
        <p className="text-sm font-medium text-slate-500">No programs running yet</p>
        <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
          Wellness programs — short daily campaigns on yoga, mindfulness and
          well-being — will appear here when your institution launches one.
        </p>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Inner
// ============================================================================

function ProgramsInner() {
  const { data: programs, isLoading } = useActivePrograms();

  if (isLoading) return <ProgramsSkeleton />;

  if (!programs || programs.length === 0) return <EmptyState />;

  return (
    <div className="space-y-5">
      <div className="pt-1">
        <p className="text-sm text-slate-500 leading-relaxed">
          Short daily programs to build healthy habits — one quick step a day.
          Pick one and follow along.
        </p>
      </div>

      <div className="space-y-4">
        {programs.map((program) => (
          <ProgramCard key={program.id} program={program} />
        ))}
      </div>

      <div className="h-4" />
    </div>
  );
}

// ============================================================================
// Page
// ============================================================================

export default function WellnessProgramsPage() {
  return (
    <ContentLayout title="Wellness Programs">
      <ProgramsInner />
    </ContentLayout>
  );
}
