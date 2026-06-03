'use client';

import { useState } from 'react';
import {
  useYoYTrajectory,
  useYoYPerInstitutionTrajectory,
  useYoYPerCategoryTrajectory,
} from '@/hooks/admission/use-yoy-trajectory';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, Info } from 'lucide-react';
import { YoYVerdictBanner } from './yoy/yoy-verdict-banner';
import { YoYChartCanvas, type ViewMode, type HorizonMode } from './yoy/yoy-chart-canvas';
import { YoYToolbar } from './yoy/yoy-toolbar';
import { YoYDrillSheet } from './yoy/yoy-drill-sheet';
import { YoYExcludedCollapsible } from './yoy/yoy-excluded-collapsible';
import { YoYInstitutionPicker } from './yoy/yoy-institution-picker';
import { cycleLabel } from './yoy/_helpers/verdict-math';

type Props = {
  /**
   * Optional initial institution_id. When provided, the picker starts on
   * that institution. When omitted, the picker starts on "All institutions"
   * (group view).
   */
  institutionId?: string;
};

/**
 * Orchestrator for the Year-over-Year trajectory chart on the Seats sub-tab.
 *
 * Three zones (top to bottom):
 *   Zone 1 — Verdict banner: "Are we lagging?" answered first
 *   Zone 2 — Chart card: trajectory + toolbar
 *   Zone 3 — Excluded programs (collapsible)
 *
 * Click-point drill-down opens a right-side Sheet with top contributors.
 * Click-year-legend expands that year into 8 institutional sub-lines.
 * "Show by category" toggle redraws chart with program-category grouping.
 *
 * Director-locked editorial aesthetic — cream background, terracotta accent,
 * DM Serif Display + IBM Plex Sans/Mono typography. No purple gradients.
 */
export function YoYTrajectoryChart({ institutionId }: Props) {
  // Director-locked 2026-06-03: institution picker REPLACES the prior
  // "Group / My institution" toggle. Lets the user pick ANY accessible
  // institution and scopes EVERY view — trajectory, drill sheet, excluded
  // panel, verdict banner, and the forthcoming actionable-insights cards —
  // to that selection. null = "All institutions" group view.
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string | null>(
    institutionId ?? null,
  );
  // Default to full-horizon so historical years' complete curves are visible.
  // Director-flagged 2026-06-03: in fair-race default he couldn't see the
  // June 2025+ admissions on the 2025-26 line because they're past day +63
  // (the current cycle's progress). Full-horizon shows everything; counselors
  // can switch to fair-race when they explicitly want the "same point" view.
  const [horizonMode, setHorizonMode] = useState<HorizonMode>('full-horizon');
  const [viewMode, setViewMode] = useState<ViewMode>('institution');
  const [expandedYear, setExpandedYear] = useState<number | null>(null);
  const [drillPoint, setDrillPoint] = useState<{ year: number; dayN: number } | null>(null);

  const effectiveInstitutionId = selectedInstitutionId ?? undefined;
  const trajectory = useYoYTrajectory(effectiveInstitutionId);

  const perInstitution = useYoYPerInstitutionTrajectory(expandedYear, effectiveInstitutionId);
  const perCategory = useYoYPerCategoryTrajectory(effectiveInstitutionId);

  if (trajectory.error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Could not load YoY trajectory</AlertTitle>
        <AlertDescription>{(trajectory.error as Error).message}</AlertDescription>
      </Alert>
    );
  }

  if (!trajectory.isLoading && !trajectory.data?.trajectory.length) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Not enough cycle data yet</AlertTitle>
        <AlertDescription>
          The YoY chart needs admission data in at least 2 cycles. Once 2026-27
          accumulates more learners that match historical years, the chart will
          populate.
        </AlertDescription>
      </Alert>
    );
  }

  const data = trajectory.data;

  return (
    <div className="space-y-4">
      {/* Zone 1: Verdict banner — primary answer */}
      <YoYVerdictBanner
        trajectory={data?.trajectory ?? []}
        isLoading={trajectory.isLoading}
      />

      {/* Zone 2: Chart card */}
      <div
        className="rounded-lg border overflow-hidden"
        style={{
          backgroundColor: '#fafaf8',
          borderColor: '#e7e2d8',
          fontFamily: 'var(--font-ibm-plex-sans)',
        }}
      >
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b"
          style={{ borderColor: '#e7e2d8' }}
        >
          <div>
            <h3
              className="text-[15px] tracking-tight"
              style={{
                fontFamily: 'var(--font-dm-serif-display)',
                color: '#2a2624',
                fontWeight: 400,
              }}
            >
              Year over Year trajectory
            </h3>
            <p className="text-[11.5px]" style={{ color: '#6e6760' }}>
              Cumulative admitted vs. days since April 1 of each cohort's class-start year
              {viewMode === 'category' && ' · grouped by program category'}
              {expandedYear !== null && ` · ${cycleLabel(expandedYear)} expanded`}
              {horizonMode === 'fair-race' && ' · historical lines clipped at current day for fair comparison'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <YoYInstitutionPicker
              selectedInstitutionId={selectedInstitutionId}
              onChange={(id) => {
                setSelectedInstitutionId(id);
                setExpandedYear(null); // reset expansion when scope changes
              }}
            />
            <YoYToolbar
              horizonMode={horizonMode}
              viewMode={viewMode}
              expandedYear={expandedYear}
              onHorizonChange={setHorizonMode}
              onViewModeChange={(v) => {
                setViewMode(v);
                if (v === 'category') setExpandedYear(null);
              }}
              onCollapseExpansion={() => setExpandedYear(null)}
            />
          </div>
        </div>

        <div className="px-4 py-4">
          {trajectory.isLoading ? (
            <ChartSkeleton />
          ) : (
            <YoYChartCanvas
              trajectory={data?.trajectory ?? []}
              perInstitution={perInstitution.data ?? null}
              perCategory={perCategory.data ?? null}
              expandedYear={expandedYear}
              viewMode={viewMode}
              horizonMode={horizonMode}
              onPointClick={(year, dayN) => setDrillPoint({ year, dayN })}
            />
          )}
        </div>

        {/* Mini legend — clickable year chips for expand interaction */}
        {viewMode === 'institution' && !trajectory.isLoading && data && (
          <div
            className="flex flex-wrap items-center gap-1.5 px-5 py-3 border-t text-[11px]"
            style={{
              borderColor: '#e7e2d8',
              backgroundColor: '#f4efe3',
              fontFamily: 'var(--font-ibm-plex-mono)',
            }}
          >
            <span style={{ color: '#9a948a' }}>Click a year to drill:</span>
            {Array.from(new Set(data.trajectory.map((r) => r.year)))
              .sort((a, b) => a - b)
              .map((y) => {
                const isExpanded = expandedYear === y;
                return (
                  <button
                    key={y}
                    type="button"
                    onClick={() => setExpandedYear(isExpanded ? null : y)}
                    className="rounded-md border px-2 py-0.5 transition"
                    style={{
                      borderColor: isExpanded ? '#c8553d' : '#d8d3c8',
                      backgroundColor: isExpanded ? 'rgba(200, 85, 61, 0.08)' : 'transparent',
                      color: isExpanded ? '#a8453c' : '#2a2624',
                      fontWeight: isExpanded ? 600 : 400,
                    }}
                  >
                    {cycleLabel(y)}
                  </button>
                );
              })}
          </div>
        )}
      </div>

      {/* Zone 3: Excluded programs (collapsed by default) */}
      {data?.excludedCourses && data.excludedCourses.length > 0 && (
        <YoYExcludedCollapsible excludedCourses={data.excludedCourses} />
      )}

      {/* Drill-down Sheet */}
      <YoYDrillSheet
        open={drillPoint !== null}
        onOpenChange={(o) => { if (!o) setDrillPoint(null); }}
        year={drillPoint?.year ?? null}
        dayN={drillPoint?.dayN ?? null}
        institutionId={effectiveInstitutionId}
      />
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="space-y-3 py-6">
      <div className="h-3 w-2/3 animate-pulse rounded bg-[#ece8de]" />
      <div className="h-[340px] animate-pulse rounded bg-[#ece8de]" />
    </div>
  );
}
