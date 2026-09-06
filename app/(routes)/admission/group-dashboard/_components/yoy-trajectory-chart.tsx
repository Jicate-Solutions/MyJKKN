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
import { YoYHealthStoplight } from './yoy/yoy-health-stoplight';
import { YoYDaysToCatchUp } from './yoy/yoy-days-to-catchup';
import { YoYDepositsWorklist } from './yoy/yoy-deposits-worklist';
import { YoYCounselorGrid } from './yoy/yoy-counselor-grid';
import { YoYFirstTouchSLA } from './yoy/yoy-first-touch-sla';
import { cycleLabel } from './yoy/_helpers/verdict-math';

type Props = {
  /**
   * Optional initial institution_id. When provided, the picker starts on
   * that institution. When omitted, the picker starts on "All institutions"
   * (group view).
   */
  institutionId?: string;
  /**
   * Optional — the academic-year (start year, e.g. 2026 = 2026-27 cycle)
   * selected by the Director in the page-level AY dropdown. Threaded into
   * the verdict banner so it can disambiguate the case where the user picks
   * an AY that the verdict math doesn't anchor on (because the verdict
   * always picks the latest cycle WITH meaningful trajectory data, not the
   * dropdown selection). See `yoy-verdict-banner.tsx` Props.selectedAY.
   */
  selectedAY?: number | null;
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
export function YoYTrajectoryChart({ institutionId, selectedAY }: Props) {
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
      {/* Zone 0: Institution picker — visible at the top so scope is always obvious */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2
            className="text-[18px] tracking-tight"
            style={{
              fontFamily: 'var(--font-dm-serif-display)',
              color: '#2a2624',
              fontWeight: 400,
            }}
          >
            Year over Year
          </h2>
          <p
            className="text-[11px]"
            style={{ color: '#9a948a', fontFamily: 'var(--font-ibm-plex-sans)' }}
          >
            Decision-driver view · pick an institution to scope every panel below
          </p>
        </div>
        <YoYInstitutionPicker
          selectedInstitutionId={selectedInstitutionId}
          onChange={(id) => {
            setSelectedInstitutionId(id);
            setExpandedYear(null);
          }}
        />
      </div>

      {/* Zone 1: Verdict banner — primary answer (4 cards: vs prior years × 2 + projection + week-pace) */}
      <YoYVerdictBanner
        trajectory={data?.trajectory ?? []}
        isLoading={trajectory.isLoading}
        selectedAY={selectedAY}
      />

      {/* Zone 1.5: 8-College Health Stoplight — which Principals to call today */}
      <YoYHealthStoplight institutionId={effectiveInstitutionId} />

      {/* Zone 1.6: Days-to-Catch-Up Countdown — at this pace, will each college reach LY total? */}
      <YoYDaysToCatchUp institutionId={effectiveInstitutionId} />

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

      {/* Zone 2.5: Excluded programs (always render — component handles empty state) */}
      <YoYExcludedCollapsible excludedCourses={data?.excludedCourses ?? []} />

      {/* Zone 3: Actionable insights panels — workflow-recommended (rank 2/3/4) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <YoYDepositsWorklist institutionId={effectiveInstitutionId} />
        <YoYFirstTouchSLA institutionId={effectiveInstitutionId} />
      </div>
      <YoYCounselorGrid institutionId={effectiveInstitutionId} />

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
