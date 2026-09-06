'use client';

/**
 * AI Agency — recognition work-signal (PR: aipulse-agency faculty work-signal, S3).
 *
 * A self-contained client island that reads the VIEWER'S OWN Agency Index from
 * `GET /api/pde/agency` (self-only — the route 403s any learnerId ≠ user.id, and
 * we never pass one, so it defaults to the caller). Faculty are "senior learners":
 * this surfaces their own AI agency as RECOGNITION, not appraisal or ranking.
 *
 * Design notes:
 *  - Reads self-only. It deliberately does NOT reuse the cohort-distribution hook
 *    (`fn_pde_agency_distribution_for_facilitator`), which is a different concern
 *    (the students a facilitator teaches). This tile is the viewer's own signal.
 *  - Copy follows the operating-MODE framing (Dweck / CARE-Recognition) used in
 *    app/(routes)/pde/faculty/dashboard/_components/agency-distribution.tsx —
 *    a level is a mode you are working in, not an identity or a rank.
 *  - EMPTY STATE, not zero. The API returns `has_data:false` when the learner has
 *    produced nothing measurable yet (e.g. before the policy bridge is enabled).
 *    That is the correct resting state — an absent score is never rendered as 0.
 *  - Embeds inside both server strips (faculty/principal) and the client strip
 *    (hod), plus a `callout` variant above the faculty cohort distribution.
 */

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { AgencyLevel } from '@/types/pde';

// Operating-mode labels — recognition copy, never a ranking. Mirrors the
// AGENCY_LEVELS labels in agency-distribution.tsx.
const LEVEL_LABEL: Record<AgencyLevel, string> = {
  dependent: 'Dependent mode',
  directed: 'Directed mode',
  independent: 'Independent mode',
  self_directed: 'Self-Directed mode',
  principal: 'Principal mode',
};

// Response contract of GET /api/pde/agency (see route.ts): `data` is either a
// snapshot row, an `{ overall, level }` object, or null; `has_data` distinguishes
// "nothing measurable yet" (false) from a genuine score of 0.
type AgencyApiResponse = {
  data: { overall?: number; level?: AgencyLevel } | null;
  has_data?: boolean;
};

type AgencyState = {
  loading: boolean;
  overall: number | null;
  level: AgencyLevel | null;
};

function useOwnAgency(): AgencyState {
  const [state, setState] = useState<AgencyState>({
    loading: true,
    overall: null,
    level: null,
  });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/pde/agency')
      .then((r) => (r.ok ? r.json() : null))
      .then((body: AgencyApiResponse | null) => {
        if (cancelled) return;
        // Absent score → empty state, never 0. has_data:false OR data:null both
        // mean "nothing measurable yet".
        const hasData = !!body && body.has_data !== false && body.data != null;
        setState({
          loading: false,
          overall:
            hasData && typeof body!.data!.overall === 'number'
              ? body!.data!.overall!
              : null,
          level: hasData && body!.data!.level ? body!.data!.level! : null,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setState({ loading: false, overall: null, level: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

type Variant = 'tile' | 'callout';

/**
 * @param variant `tile` (default) for the hero-strip KPI grid; `callout` for the
 *                horizontal banner above the faculty cohort distribution.
 */
export function AgencyRecognitionTile({
  variant = 'tile',
}: {
  variant?: Variant;
}) {
  const { loading, overall, level } = useOwnAgency();

  if (variant === 'callout') {
    return (
      <div className='rounded-lg border border-indigo-200 dark:border-indigo-900 bg-indigo-50/60 dark:bg-indigo-950/30 px-4 py-3 flex items-center gap-3'>
        <Sparkles
          className='h-5 w-5 text-indigo-600 dark:text-indigo-300 shrink-0'
          aria-hidden
        />
        <div className='min-w-0'>
          <div className='text-sm font-medium text-indigo-900 dark:text-indigo-100'>
            Your AI Agency{level ? `: ${LEVEL_LABEL[level]}` : ''}
          </div>
          <div className='text-xs text-indigo-700/80 dark:text-indigo-300/80'>
            {loading
              ? 'Loading your recognition signal…'
              : level
                ? overall != null
                  ? `Agency index ${overall} — recognition, not a ranking.`
                  : 'Recognition, not a ranking.'
                : 'Your own AI agency appears here once you have activity — separate from the cohort view below.'}
          </div>
        </div>
      </div>
    );
  }

  // Tile variant — parallels the hero-strip KPI cards (rounded-2xl border, p-5,
  // backdrop-blur). A single indigo recognition accent (not the red/amber/green
  // performance bands) keeps it glanceable RECOGNITION, not a ranking ladder.
  return (
    <div className='rounded-2xl border border-indigo-400/40 bg-indigo-50/60 dark:bg-indigo-950/30 text-indigo-950 dark:text-indigo-100 p-5 backdrop-blur-sm transition-all duration-200'>
      <div className='flex items-center gap-2 text-[11px] uppercase tracking-wider opacity-70'>
        <Sparkles className='h-3.5 w-3.5' aria-hidden />
        AI Agency
      </div>
      {loading ? (
        <div className='mt-3 h-8 w-1/2 rounded bg-current/10 animate-pulse' />
      ) : level ? (
        <>
          <div className='mt-3 text-2xl font-semibold leading-tight'>
            {LEVEL_LABEL[level]}
          </div>
          <div className='mt-1 text-xs opacity-70'>
            {overall != null ? `Agency index ${overall}` : 'Recognition signal'}
          </div>
        </>
      ) : (
        <>
          <div className='mt-3 text-2xl font-semibold tabular-nums opacity-60'>
            --
          </div>
          <div className='mt-1 text-xs opacity-70'>
            Your AI agency will appear as you work with AI tools
          </div>
        </>
      )}
    </div>
  );
}
