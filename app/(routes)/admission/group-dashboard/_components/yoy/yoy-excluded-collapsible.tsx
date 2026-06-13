'use client';

import { useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import type { YoYExcludedCourse } from '@/lib/services/admission/yoy-trajectory-service';

type Props = {
  excludedCourses: YoYExcludedCourse[];
};

/**
 * Zone 3: collapsible panel listing the programs filtered out of the
 * trajectory (single-year only, or tracked outside MyJKKN like BDS via TN MCC).
 *
 * Default collapsed. Header shows the count badge. Director doesn't see the
 * list unless he asks. Reduces noise when the chart is the focus.
 */
export function YoYExcludedCollapsible({ excludedCourses }: Props) {
  const [open, setOpen] = useState(false);

  // Render even when empty — Director-flagged 2026-06-03 07:22 IST: the panel
  // silently disappearing when scope filter returned 0 excluded looked like a
  // regression. Empty state shows "all clear" so the user never wonders where
  // the section went.
  if (!excludedCourses.length) {
    return (
      <div
        className="rounded-lg border px-5 py-3.5 flex items-center justify-between"
        style={{
          backgroundColor: '#fafaf8',
          borderColor: '#e7e2d8',
          fontFamily: 'var(--font-ibm-plex-sans)',
        }}
      >
        <div className="flex items-baseline gap-3">
          <span className="text-[13px] font-medium" style={{ color: '#2a2624' }}>
            All programs in trajectory
          </span>
          <span className="text-[11.5px]" style={{ color: '#9a948a' }}>
            no excluded programs for this scope
          </span>
        </div>
        <span
          className="text-[10px] uppercase tracking-[0.18em]"
          style={{ color: '#5a7548' }}
        >
          ✓ Clear
        </span>
      </div>
    );
  }

  const grouped = groupByInstitution(excludedCourses);
  const count = excludedCourses.length;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className="rounded-lg border"
        style={{
          backgroundColor: '#fafaf8',
          borderColor: '#e7e2d8',
          fontFamily: 'var(--font-ibm-plex-sans)',
        }}
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between px-5 py-3.5 transition-colors hover:bg-[#f4efe3]"
          >
            <div className="flex items-baseline gap-3">
              <ChevronDown
                size={14}
                className="transition-transform"
                style={{
                  color: '#6e6760',
                  transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
                }}
              />
              <span
                className="text-[13px] font-medium tracking-tight"
                style={{ color: '#2a2624' }}
              >
                {count} programs not in trajectory
              </span>
              <span className="text-[11.5px]" style={{ color: '#9a948a' }}>
                tracked outside MyJKKN or single-year-only
              </span>
            </div>
            <span
              className="text-[10px] uppercase tracking-[0.18em]"
              style={{ color: '#9a948a' }}
            >
              {open ? 'Hide' : 'Show'}
            </span>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div
            className="border-t px-5 py-4 space-y-4"
            style={{ borderColor: '#e7e2d8' }}
          >
            <p className="text-[12px]" style={{ color: '#6e6760' }}>
              These programs are filtered from the chart because they don't have
              admission data across enough cycles. Some (like BDS) are tracked
              externally via TN MCC counselling. Will self-resolve as cycle data
              accumulates.
            </p>
            {grouped.map(({ institutionName, items }) => (
              <div key={institutionName}>
                <div
                  className="text-[11px] font-medium mb-1.5"
                  style={{ color: '#2a2624' }}
                >
                  {institutionName}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((it) => (
                    <span
                      key={it.programId}
                      className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px]"
                      style={{
                        borderColor: '#e0dccf',
                        backgroundColor: '#f4efe3',
                        color: '#2a2624',
                        fontFamily: 'var(--font-ibm-plex-mono)',
                      }}
                      title={`${it.exclusionReason.replace(/_/g, ' ')} · years: ${it.yearsWithData.join(', ')}`}
                    >
                      <span style={{ color: '#6e6760' }}>{it.programName}</span>
                      <span style={{ color: '#a8453c' }}>
                        {it.yearsWithData.map((y) => String(y).slice(-2)).join('/')}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function groupByInstitution(
  courses: YoYExcludedCourse[],
): { institutionName: string; items: YoYExcludedCourse[] }[] {
  const map = new Map<string, YoYExcludedCourse[]>();
  for (const c of courses) {
    const arr = map.get(c.institutionName) ?? [];
    arr.push(c);
    map.set(c.institutionName, arr);
  }
  return Array.from(map.entries())
    .map(([institutionName, items]) => ({
      institutionName,
      items: items.sort((a, b) => a.programName.localeCompare(b.programName)),
    }))
    .sort((a, b) => a.institutionName.localeCompare(b.institutionName));
}
