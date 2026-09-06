'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useYoYDrillAtDay } from '@/hooks/admission/use-yoy-trajectory';
import { formatDayNTick, formatIndianNumber } from './_helpers/chart-formatters';
import { cycleLabel } from './_helpers/verdict-math';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  year: number | null;
  dayN: number | null;
  institutionId?: string;
};

/**
 * Right-side Sheet for the click-point drill-down. Shows top 5 institutions
 * + top 5 programs contributing to the cumulative at (year, day_n).
 *
 * Stays out of the way of the chart (slides in from the right) so Director
 * can compare chart + drill simultaneously.
 */
export function YoYDrillSheet({ open, onOpenChange, year, dayN, institutionId }: Props) {
  const { data, isLoading } = useYoYDrillAtDay(
    open ? year : null,
    open ? dayN : null,
    institutionId,
  );

  const institutions = data?.filter((r) => r.kind === 'institution') ?? [];
  const programs = data?.filter((r) => r.kind === 'program') ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[420px] sm:w-[460px] overflow-y-auto"
        style={{
          backgroundColor: '#fafaf8',
          fontFamily: 'var(--font-ibm-plex-sans)',
          borderLeft: '1px solid #e7e2d8',
        }}
      >
        <SheetHeader className="pb-4 border-b" style={{ borderColor: '#e7e2d8' }}>
          <div
            className="text-[10px] uppercase tracking-[0.18em]"
            style={{ color: '#9a948a' }}
          >
            Drill-down · {year !== null ? cycleLabel(year) : '—'}
          </div>
          <SheetTitle
            style={{
              fontFamily: 'var(--font-dm-serif-display)',
              fontSize: '1.5rem',
              fontWeight: 400,
              color: '#2a2624',
            }}
          >
            Day {dayN !== null && dayN >= 0 ? '+' : ''}{dayN ?? '—'} · {dayN !== null ? formatDayNTick(dayN) : ''}
          </SheetTitle>
          <SheetDescription
            className="text-[12px]"
            style={{ color: '#6e6760' }}
          >
            Top contributors to the cumulative admitted count up to this day in the cycle.
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <DrillSkeleton />
        ) : (
          <div className="space-y-6 pt-4">
            <DrillSection title="Top institutions" rows={institutions} />
            <DrillSection title="Top programs" rows={programs} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DrillSection({
  title,
  rows,
}: {
  title: string;
  rows: { name: string; cumulative: number }[];
}) {
  const max = rows[0]?.cumulative ?? 1;

  return (
    <section>
      <div
        className="text-[10px] uppercase tracking-[0.16em] mb-2.5"
        style={{ color: '#9a948a' }}
      >
        {title}
      </div>
      <div className="space-y-1.5">
        {rows.length === 0 && (
          <div className="text-[12px]" style={{ color: '#9a948a' }}>
            No data for this day yet.
          </div>
        )}
        {rows.map((r, idx) => {
          const pct = max > 0 ? (r.cumulative / max) * 100 : 0;
          return (
            <div key={r.name} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3">
                <div
                  className="text-[12.5px] leading-tight"
                  style={{ color: '#2a2624' }}
                >
                  <span
                    className="mr-1.5 inline-block w-4 text-right tabular-nums"
                    style={{ color: '#b8b1a4', fontFamily: 'var(--font-ibm-plex-mono)' }}
                  >
                    {idx + 1}
                  </span>
                  {r.name}
                </div>
                <div
                  className="tabular-nums text-[12.5px] font-medium"
                  style={{ color: '#2a2624', fontFamily: 'var(--font-ibm-plex-mono)' }}
                >
                  {formatIndianNumber(r.cumulative)}
                </div>
              </div>
              <div className="ml-6 h-[3px] rounded-full" style={{ backgroundColor: '#ece8de' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: '#c8553d' }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DrillSkeleton() {
  return (
    <div className="space-y-6 pt-4">
      {[0, 1].map((s) => (
        <section key={s}>
          <div className="h-3 w-32 animate-pulse rounded bg-[#ece8de] mb-3" />
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-1">
                <div className="h-4 w-full animate-pulse rounded bg-[#ece8de]" />
                <div className="ml-6 h-[3px] w-2/3 animate-pulse rounded bg-[#ece8de]" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
