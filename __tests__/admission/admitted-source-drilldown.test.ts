// __tests__/admission/admitted-source-drilldown.test.ts
//
// Cover for the attribution semantics behind the Group Dashboard's "Admitted"
// KPI drill-down.
//
// The bug class this guards against: the dashboard KPI counts learners_profiles
// (1,515 for AY 2026) while the Source Analytics tab counts admission_leads
// (551). Clicking a KPI of 1,515 and landing on a list of 551 is the failure
// mode — 964 direct admissions with no lead row silently vanish through a LEFT
// JOIN. The drill-down is profile-anchored so its total equals the KPI, and the
// no-lead cohort is a first-class bucket rather than a dropped row.
//
// These are pure display/shape helpers — no React, no Supabase, no env. The
// SQL-level invariants (total == KPI, per-source sum == total, one row per
// profile) are asserted against the live RPC and recorded in
// docs/superpowers/specs/2026-08-13-admitted-source-drilldown-design.md §7.

import { describe, it, expect } from 'vitest';
import {
  SOURCE_COLORS,
  DIRECT_SOURCE_LABEL,
  formatSourceName,
  sourceLabel,
  sourceColor,
  orderSourceCounts,
} from '@/app/(routes)/admission/group-dashboard/_components/source-display';
import {
  DIRECT_SOURCE_KEY,
  type AdmittedSourceCount,
} from '@/types/admission-workflow-config';

describe('formatSourceName', () => {
  it('turns snake_case enum values into title case', () => {
    expect(formatSourceName('education_fair')).toBe('Education Fair');
    expect(formatSourceName('walk_in')).toBe('Walk In');
    expect(formatSourceName('website')).toBe('Website');
  });

  it('carries no opinion about the direct sentinel — that is sourceLabel’s job', () => {
    // Pure transform: it must NOT special-case the sentinel, otherwise the
    // Source Analytics tab (where null means something different) would
    // inherit the drill-down's semantics.
    expect(formatSourceName(DIRECT_SOURCE_KEY)).not.toBe(DIRECT_SOURCE_LABEL);
  });
});

describe('sourceLabel (drill-down semantics)', () => {
  it('labels a real source', () => {
    expect(sourceLabel('referral')).toBe('Referral');
    expect(sourceLabel('inbound_call')).toBe('Inbound Call');
  });

  it('treats null, undefined and the sentinel as the same no-lead cohort', () => {
    // The RPC returns NULL on a row and '__direct__' in the counts aggregate.
    // Callers hold whichever they got; both must render identically or the
    // chip and the table cell would disagree for the same 964 learners.
    expect(sourceLabel(null)).toBe(DIRECT_SOURCE_LABEL);
    expect(sourceLabel(undefined)).toBe(DIRECT_SOURCE_LABEL);
    expect(sourceLabel(DIRECT_SOURCE_KEY)).toBe(DIRECT_SOURCE_LABEL);
  });
});

describe('sourceColor', () => {
  it('maps every source present in the database to a non-fallback colour', () => {
    // These are the eleven distinct admission_leads.source values actually in
    // the database. inbound_call and whatsapp were previously unmapped and
    // rendered grey, making real channels look like "unknown".
    const inDatabase = [
      'walk_in', 'referral', 'website', 'other', 'education_fair',
      'inbound_call', 'newspaper', 'facebook_ads', 'whatsapp',
      'youtube_ads', 'social_media',
    ];
    for (const src of inDatabase) {
      expect(SOURCE_COLORS[src], `${src} must have an explicit colour`).toBeDefined();
    }
  });

  it('gives the direct bucket its own colour, distinct from "other"', () => {
    // "No attribution" must not be visually confusable with the real
    // catch-all channel named "other".
    expect(sourceColor(null)).toBe(SOURCE_COLORS[DIRECT_SOURCE_KEY]);
    expect(sourceColor(null)).not.toBe(SOURCE_COLORS.other);
  });

  it('falls back for an unknown source rather than returning undefined', () => {
    expect(sourceColor('some_future_channel')).toBe(SOURCE_COLORS.other);
  });
});

describe('orderSourceCounts', () => {
  const counts: AdmittedSourceCount[] = [
    { source: DIRECT_SOURCE_KEY, admits: 964 },
    { source: 'walk_in', admits: 314 },
    { source: 'website', admits: 6 },
    { source: 'referral', admits: 223 },
  ];

  it('sorts real sources by volume descending', () => {
    const ordered = orderSourceCounts(counts);
    expect(ordered.slice(0, 3).map((c) => c.source)).toEqual([
      'walk_in', 'referral', 'website',
    ]);
  });

  it('pins the direct bucket last even though it is the largest', () => {
    // This is the point of the function. Direct is 964 — the biggest number in
    // the set — but it is a residual, not a channel. Sorting purely by volume
    // would present "no attribution" as the top-performing source.
    const ordered = orderSourceCounts(counts);
    expect(ordered[ordered.length - 1].source).toBe(DIRECT_SOURCE_KEY);
  });

  it('preserves every bucket — nothing is filtered out', () => {
    const ordered = orderSourceCounts(counts);
    expect(ordered).toHaveLength(counts.length);
    expect(ordered.reduce((s, c) => s + c.admits, 0)).toBe(1507);
  });

  it('handles a cohort that is 100% direct (AY 2025 and earlier)', () => {
    // The leads pipeline only began feeding admissions in 2026, so for every
    // earlier cohort this is the entire result set. It must render, not error.
    const allDirect: AdmittedSourceCount[] = [
      { source: DIRECT_SOURCE_KEY, admits: 1647 },
    ];
    expect(orderSourceCounts(allDirect)).toEqual(allDirect);
  });

  it('handles an empty cohort', () => {
    expect(orderSourceCounts([])).toEqual([]);
  });

  it('does not mutate its input', () => {
    const input: AdmittedSourceCount[] = [
      { source: 'walk_in', admits: 1 },
      { source: 'referral', admits: 2 },
    ];
    const snapshot = [...input];
    orderSourceCounts(input);
    expect(input).toEqual(snapshot);
  });
});
