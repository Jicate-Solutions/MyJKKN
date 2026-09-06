import { describe, it, expect } from 'vitest';
import {
  perCollegeExchange,
  sizeStanding,
  concentration,
  type CacCollegeSize,
  type CacExchangeEdge,
} from '@/hooks/accreditation/use-cac-cluster';

// ---------------------------------------------------------------------------
// The council's decision was that give and receive are shown per college WITH
// size alongside, so that an imbalance reads as context rather than a failing.
// Three things can break that and none of them throws:
//
//   1. A college with no exchange vanishing from the roll-up. Anchoring on the
//      edges instead of on the colleges produces exactly that, and an absent
//      college reads as one outside the cluster rather than one that has not
//      started. This is the same defect the funnel view carried until
//      2026-08-14, where two colleges were missing entirely.
//   2. Hub traffic folded into peer totals. Every row inflates by an amount
//      that has nothing to do with collaboration between colleges.
//   3. A share printed against a cluster total of 0, which is not 0% — it is
//      unanswerable, and 0% is the bare zero this page forbids.
//
// Shapes mirror production on 2026-08-14: 8 assessed colleges, cross-campus
// teaching concentrated on Allied Health, which is one of the smallest.
// ---------------------------------------------------------------------------

const size = (
  id: string,
  name: string,
  iqac_code: string,
  active_learners: number,
): CacCollegeSize => ({
  institution_id: id,
  institution_name: name,
  iqac_code,
  active_learners,
});

const ALLIED = size('i-alhd', 'JKKN College of Allied Health Sciences', 'ALHD', 240);
const DENTAL = size('i-dent', 'JKKN Dental College and Hospital', 'DENT', 501);
const ARTS = size('i-assf', 'JKKN College of Arts and Science (Self)', 'ASSF', 1241);
// Real, and the reason the roll-up may not call anyone "the smallest college":
// Education has 40 learner rows and none of them active.
const EDUCATION = size('i-educ', 'JKKN College of Education', 'EDUC', 0);

const SIZES = [ARTS, DENTAL, ALLIED, EDUCATION];

const edge = (
  kind: CacExchangeEdge['exchange_kind'],
  relation: CacExchangeEdge['relation'],
  giver: CacCollegeSize | null,
  receiver: CacCollegeSize,
  units: number,
): CacExchangeEdge => ({
  exchange_kind: kind,
  relation,
  giver_institution_id: giver?.institution_id ?? null,
  giver_name: giver?.institution_name ?? 'JKKN Main Office',
  giver_iqac_code: giver?.iqac_code ?? null,
  receiver_institution_id: receiver.institution_id,
  receiver_name: receiver.institution_name,
  receiver_iqac_code: receiver.iqac_code,
  units,
  people: 1,
});

describe('perCollegeExchange', () => {
  it('lists every assessed college, including ones that exchanged nothing', () => {
    const rows = perCollegeExchange([edge('teaching', 'peer', DENTAL, ALLIED, 53)], SIZES);

    expect(rows).toHaveLength(SIZES.length);
    expect(rows.map((r) => r.iqac_code).sort()).toEqual(['ALHD', 'ASSF', 'DENT', 'EDUC']);

    // The college on no edge at all is present and reads as zero exchange,
    // rather than being absent from the table.
    const education = rows.find((r) => r.iqac_code === 'EDUC');
    expect(education).toBeDefined();
    expect(education?.teaching_given).toBe(0);
    expect(education?.teaching_received).toBe(0);
  });

  it('credits give and receive to the two different colleges on one edge', () => {
    const rows = perCollegeExchange([edge('teaching', 'peer', DENTAL, ALLIED, 53)], SIZES);

    expect(rows.find((r) => r.iqac_code === 'DENT')?.teaching_given).toBe(53);
    expect(rows.find((r) => r.iqac_code === 'DENT')?.teaching_received).toBe(0);
    expect(rows.find((r) => r.iqac_code === 'ALHD')?.teaching_received).toBe(53);
    expect(rows.find((r) => r.iqac_code === 'ALHD')?.teaching_given).toBe(0);
  });

  it('keeps teaching and bookings in separate columns', () => {
    const rows = perCollegeExchange(
      [
        edge('teaching', 'peer', DENTAL, ALLIED, 53),
        edge('booking', 'peer', DENTAL, ALLIED, 4),
      ],
      SIZES,
    );

    const allied = rows.find((r) => r.iqac_code === 'ALHD');
    expect(allied?.teaching_received).toBe(53);
    expect(allied?.bookings_received).toBe(4);
  });

  it('excludes hub traffic, which is shared infrastructure and not collaboration', () => {
    const rows = perCollegeExchange(
      [
        edge('booking', 'peer', DENTAL, ALLIED, 4),
        // Main Office -> Allied. Real, counted elsewhere, and NOT two colleges
        // choosing to work together.
        edge('booking', 'hub', null, ALLIED, 77),
      ],
      SIZES,
    );

    expect(rows.find((r) => r.iqac_code === 'ALHD')?.bookings_received).toBe(4);
  });

  it('orders by size and not by exchange volume, so it is not a league table', () => {
    // Allied receives the most of anyone and is nearly the smallest. Ordering by
    // exchange would put it first and publish a ranking of collaboration.
    const rows = perCollegeExchange([edge('teaching', 'peer', DENTAL, ALLIED, 53)], SIZES);

    expect(rows.map((r) => r.iqac_code)).toEqual(['ASSF', 'DENT', 'ALHD', 'EDUC']);
  });

  it('returns the colleges unchanged when there are no edges at all', () => {
    const rows = perCollegeExchange([], SIZES);

    expect(rows).toHaveLength(SIZES.length);
    expect(rows.every((r) => r.teaching_given === 0 && r.bookings_received === 0)).toBe(true);
  });

  it('ignores an edge naming an institution that is not an assessed college', () => {
    const outsider = size('i-ghost', 'Somewhere else', 'GHST', 10);
    const rows = perCollegeExchange(
      [edge('teaching', 'peer', outsider, ALLIED, 9)],
      SIZES,
    );

    expect(rows).toHaveLength(SIZES.length);
    expect(rows.some((r) => r.iqac_code === 'GHST')).toBe(false);
    // The receiving side is a college, so its side of the edge still counts.
    expect(rows.find((r) => r.iqac_code === 'ALHD')?.teaching_received).toBe(9);
  });
});

describe('sizeStanding', () => {
  it('states a share of cluster learners for the college found by id', () => {
    const standing = sizeStanding(SIZES, ALLIED.institution_id);

    expect(standing).not.toBeNull();
    expect(standing?.activeLearners).toBe(240);
    expect(standing?.clusterLearners).toBe(1982);
    expect(standing?.sharePct).toBe(12);
  });

  it('falls back to the name when the edge carried no institution id', () => {
    const standing = sizeStanding(SIZES, null, ALLIED.institution_name);

    expect(standing?.activeLearners).toBe(240);
  });

  it('prefers the id over the name when both are supplied', () => {
    const standing = sizeStanding(SIZES, DENTAL.institution_id, ALLIED.institution_name);

    expect(standing?.activeLearners).toBe(501);
  });

  it('returns null rather than 0% when the cluster has no active learners', () => {
    // A share of nothing is unanswerable, not zero. Printing 0% here would be
    // the bare zero the page forbids, and it would read as a measured result.
    expect(sizeStanding([EDUCATION], EDUCATION.institution_id)).toBeNull();
  });

  it('returns null when the college is not among the sizes', () => {
    expect(sizeStanding(SIZES, 'i-nobody', 'Nobody')).toBeNull();
    expect(sizeStanding([], ALLIED.institution_id)).toBeNull();
  });

  it('reports a real 0 as 0 learners once the cluster total is non-zero', () => {
    // Distinct from the case above: here the share IS answerable and the answer
    // is 0%, which the caller renders as a reason rather than a figure.
    const standing = sizeStanding(SIZES, EDUCATION.institution_id);

    expect(standing?.activeLearners).toBe(0);
    expect(standing?.sharePct).toBe(0);
  });
});

describe('concentration carries the institution id', () => {
  it('lets the caller join to sizes by id rather than by display name', () => {
    const top = concentration(
      [
        edge('teaching', 'peer', DENTAL, ALLIED, 53),
        edge('teaching', 'peer', ARTS, ALLIED, 12),
        edge('teaching', 'peer', ALLIED, DENTAL, 5),
      ],
      'teaching',
    );

    expect(top?.institutionId).toBe(ALLIED.institution_id);
    expect(top?.units).toBe(65);
    expect(top?.sources).toBe(2);
    expect(top?.sharePct).toBe(93);
  });

  it('is null when nothing of that kind has been recorded', () => {
    expect(concentration([edge('booking', 'peer', DENTAL, ALLIED, 4)], 'teaching')).toBeNull();
  });
});
