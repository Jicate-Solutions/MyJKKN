import { describe, it, expect } from 'vitest';
import {
  reachComparison,
  communityVolume,
  beneficiaryAsymmetry,
  aggregateColleges,
  collegesByName,
  READABLE_INITIATIVES,
  type CommunityClusterTotals,
  type CommunityCollegeRow,
} from '@/app/(routes)/accreditation/cac/_lib/community-collaboration';

// ---------------------------------------------------------------------------
// THE DEFECT THESE TESTS EXIST FOR.
//
// The panel shipped declaring column names the functions do not return, and
// nothing threw. A missing key on a payload typed through `any` reads
// `undefined`, `undefined` funnels through the module's `num()` guard to 0, and
// 0 renders as "nothing recorded yet" — so the no-bare-zero REASON printed over
// data that was sitting right there. Green tests, green types, a screen that
// lied, and no way to notice until a college recorded an initiative.
//
// Worst of it was the per-college table. `fn_community_college_totals()` returns
// one row per (college, INITIATIVE) and the panel read it as one row per college,
// so all four of its numeric columns — initiatives, shared, people reached,
// hours — resolved to `undefined` on every row, and the asymmetry paragraph
// underneath, computed from those, could only ever reach "not readable". The
// cluster row cost two more: it was declared `total_beneficiaries`/`total_hours`
// against a function that then returned `beneficiaries`/`hours`, which the
// sibling lane has since renamed to match (substrate 2a4d5fd2ac).
//
// So every fixture below is keyed from the RETURNS TABLE clauses verbatim
// (supabase/migrations/20261226113000_community_engagement_joint_departments.sql):
//
//   fn_community_cluster_totals() -> initiatives integer,
//     total_beneficiaries bigint, total_hours numeric, joint_initiatives integer,
//     solo_initiatives integer, avg_reach_joint numeric, avg_reach_solo numeric
//
//   fn_community_college_totals() -> institution_id uuid, institution_name text,
//     engagement_id uuid, title text, engagement_date date,
//     beneficiaries_count integer, hours_contributed numeric,
//     is_shared boolean, shared_with integer
//
// A fixture that stops matching those two lines is the warning; do not repair
// it by widening the module's guards.
// ---------------------------------------------------------------------------

const cluster = (
  over: Partial<CommunityClusterTotals> = {},
): CommunityClusterTotals => ({
  initiatives: 0,
  total_beneficiaries: 0,
  total_hours: 0,
  joint_initiatives: 0,
  solo_initiatives: 0,
  avg_reach_joint: null,
  avg_reach_solo: null,
  ...over,
});

const row = (over: Partial<CommunityCollegeRow> = {}): CommunityCollegeRow => ({
  institution_id: 'inst-a',
  institution_name: 'Allied Health Sciences',
  engagement_id: 'eng-1',
  title: 'Village eye camp',
  engagement_date: '2026-09-01',
  beneficiaries_count: 100,
  hours_contributed: 12,
  is_shared: false,
  shared_with: 0,
  ...over,
});

describe('the cluster row is read off the columns the function returns', () => {
  it('reads people reached and hours, rather than reporting an empty register over them', () => {
    const volume = communityVolume(
      cluster({
        initiatives: 4,
        total_beneficiaries: 1200,
        total_hours: 96,
        solo_initiatives: 4,
      }),
    );

    expect(volume.map((v) => v.value)).toEqual([1200, 96]);
  });

  it('still gives the empty reason when the register really is empty', () => {
    const volume = communityVolume(cluster());

    expect(volume.map((v) => v.value)).toEqual([0, 0]);
    expect(volume.map((v) => v.empty)).toEqual([
      'nothing recorded yet',
      'nothing recorded yet',
    ]);
  });

  it('separates a counted nobody from an unfilled register', () => {
    const volume = communityVolume(cluster({ initiatives: 2, solo_initiatives: 2 }));

    expect(volume.map((v) => v.empty)).toEqual([
      'no one counted as reached',
      'no hours recorded against it',
    ]);
  });

  it('carries the averages the function returns into the headline', () => {
    const reach = reachComparison(
      cluster({
        initiatives: 9,
        joint_initiatives: 4,
        solo_initiatives: 5,
        avg_reach_joint: 250,
        avg_reach_solo: 100,
      }),
    );

    expect(reach.joint.value).toBe(250);
    expect(reach.solo.value).toBe(100);
    expect(reach.verdict).toBe('joint-reaches-further');
    expect(reach.differencePct).toBe(150);
  });

  it('treats the function’s deliberate NULL average as unrecorded, not as reaching nobody', () => {
    const reach = reachComparison(
      cluster({ initiatives: 3, solo_initiatives: 3, avg_reach_solo: 80 }),
    );

    expect(reach.joint.value).toBe(0);
    expect(reach.joint.empty).toBe('nothing recorded yet');
    expect(reach.verdict).toBe('only-solo-recorded');
    expect(reach.differencePct).toBeNull();
  });

  it('draws no percentage over a denominator too thin to be a pattern', () => {
    const reach = reachComparison(
      cluster({
        initiatives: 5,
        joint_initiatives: READABLE_INITIATIVES - 1,
        solo_initiatives: 3,
        avg_reach_joint: 900,
        avg_reach_solo: 100,
      }),
    );

    expect(reach.thinSides).toEqual(['joint']);
    expect(reach.differencePct).toBeNull();
  });
});

describe('initiative rows fold into one line per college', () => {
  it('counts initiatives, sums the full reach, and sums this college’s own hours', () => {
    const folded = aggregateColleges([
      row({ engagement_id: 'eng-1', beneficiaries_count: 100, hours_contributed: 12 }),
      row({
        engagement_id: 'eng-2',
        beneficiaries_count: 400,
        hours_contributed: 30,
        is_shared: true,
        shared_with: 2,
      }),
    ]);

    expect(folded).toHaveLength(1);
    expect(folded[0]).toMatchObject({
      institution_id: 'inst-a',
      institution_name: 'Allied Health Sciences',
      initiatives: 2,
      shared_initiatives: 1,
      beneficiaries: 500,
      hours: 42,
    });
  });

  it('keeps colleges apart and counts a shared initiative in full for each of them', () => {
    const folded = aggregateColleges([
      row({
        institution_id: 'inst-a',
        institution_name: 'Allied Health Sciences',
        engagement_id: 'eng-9',
        beneficiaries_count: 400,
        hours_contributed: 20,
        is_shared: true,
        shared_with: 1,
      }),
      row({
        institution_id: 'inst-b',
        institution_name: 'Dental College',
        engagement_id: 'eng-9',
        beneficiaries_count: 400,
        hours_contributed: 35,
        is_shared: true,
        shared_with: 1,
      }),
    ]);

    expect(folded.map((c) => c.beneficiaries)).toEqual([400, 400]);
    expect(folded.map((c) => c.hours)).toEqual([20, 35]);
  });

  it('does not silently drop a row the function could not name', () => {
    const folded = aggregateColleges([
      row({ institution_id: null, institution_name: null, beneficiaries_count: 70 }),
    ]);

    expect(folded).toHaveLength(1);
    expect(folded[0].beneficiaries).toBe(70);
  });

  it('reads a missing figure as unrecorded while the initiative still counts', () => {
    const folded = aggregateColleges([
      row({ beneficiaries_count: null, hours_contributed: null }),
    ]);

    expect(folded[0]).toMatchObject({ initiatives: 1, beneficiaries: 0, hours: 0 });
  });

  it('orders by name, so no figure can float a college to the top', () => {
    const ordered = collegesByName(
      aggregateColleges([
        row({ institution_id: 'inst-z', institution_name: 'Pharmacy', beneficiaries_count: 5000 }),
        row({ institution_id: 'inst-a', institution_name: 'Allied Health Sciences' }),
      ]),
    );

    expect(ordered.map((c) => c.institution_name)).toEqual([
      'Allied Health Sciences',
      'Pharmacy',
    ]);
  });
});

describe('the asymmetry sentence is computed from the folded column', () => {
  it('names the expected shape when shared work makes the column exceed the cluster', () => {
    const rows = aggregateColleges([
      row({
        institution_id: 'inst-a',
        institution_name: 'Allied Health Sciences',
        engagement_id: 'eng-9',
        beneficiaries_count: 400,
        is_shared: true,
        shared_with: 1,
      }),
      row({
        institution_id: 'inst-b',
        institution_name: 'Dental College',
        engagement_id: 'eng-9',
        beneficiaries_count: 400,
        is_shared: true,
        shared_with: 1,
      }),
    ]);

    const asymmetry = beneficiaryAsymmetry(
      cluster({ initiatives: 1, total_beneficiaries: 400, joint_initiatives: 1 }),
      rows,
    );

    expect(asymmetry).toMatchObject({
      shape: 'colleges-exceed-cluster',
      collegesSum: 800,
      clusterTotal: 400,
      gap: 400,
      collegesSharing: 2,
    });
  });

  it('reads the two as agreeing when nothing has been recorded as shared', () => {
    const asymmetry = beneficiaryAsymmetry(
      cluster({ initiatives: 1, total_beneficiaries: 100, solo_initiatives: 1 }),
      aggregateColleges([row({ beneficiaries_count: 100 })]),
    );

    expect(asymmetry.shape).toBe('equal');
    expect(asymmetry.collegesSharing).toBe(0);
  });

  it('is unreadable, not equal, when both sides hold nothing', () => {
    expect(beneficiaryAsymmetry(cluster(), []).shape).toBe('not-readable');
  });
});
