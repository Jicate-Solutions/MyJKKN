import { describe, it, expect } from 'vitest';
import {
  summariseEvidenceScope,
  summariseEvidenceScopes,
  summariseReportedVsActual,
} from '@/app/(routes)/accreditation/_lib/evidence-scope';

// ---------------------------------------------------------------------------
// These assert what a reader SEES, not how the number was computed. Re-deriving
// the arithmetic here would only prove this file agrees with itself — the exact
// failure this project has recorded twice (40 green tests over a live bug).
//
// Shape mirrors what fn_accreditation_evidence_scope actually returns: bigint
// columns, which PostgREST hands back as strings often enough that trusting the
// declared type is how a total silently becomes string concatenation.
// ---------------------------------------------------------------------------

describe('summariseEvidenceScope', () => {
  it('says nothing is shared when every item belongs to one college', () => {
    const s = summariseEvidenceScope({
      metric_code: 'RPC_PU',
      college_total: 84,
      cluster_total: 84,
      shared_count: 0,
    });
    expect(s.clusterTotal).toBe(84);
    expect(s.isShared).toBe(false);
    expect(s.sentence).toBe('84 across the cluster, none shared between colleges.');
  });

  it('states both totals and the overlap when a paper is co-authored', () => {
    // Decision 10: both colleges see it, the cluster counts it once. 84 distinct
    // papers, 6 of them held by two colleges each, so the colleges between them
    // report 90.
    const s = summariseEvidenceScope({
      metric_code: 'RPC_PU',
      college_total: 90,
      cluster_total: 84,
      shared_count: 6,
    });
    expect(s.isShared).toBe(true);
    expect(s.sentence).toContain('84 across the cluster');
    expect(s.sentence).toContain('Colleges report 90 between them');
    expect(s.sentence).toContain('6 items are held by more than one college');
  });

  it('uses singular wording for a single shared item', () => {
    const s = summariseEvidenceScope({
      metric_code: 'RPC_IP',
      college_total: 12,
      cluster_total: 11,
      shared_count: 1,
    });
    expect(s.sentence).toContain('1 item is held by more than one college');
    expect(s.sentence).toContain('counts it once');
  });

  it('reads as a gap, never as a zero score, when nothing is captured', () => {
    // Decision 2: a body wanting data we do not collect shows the GAP. "0" on an
    // accreditation screen reads as a measured zero, which is a different claim.
    const s = summariseEvidenceScope({
      metric_code: 'PR_PEER',
      college_total: 0,
      cluster_total: 0,
      shared_count: 0,
    });
    expect(s.sentence).toBe('Not captured yet.');
    expect(s.sentence).not.toMatch(/\b0\b/);
  });

  it('survives bigint columns arriving as strings', () => {
    const s = summariseEvidenceScope({
      metric_code: 'RPC_PU',
      college_total: '90' as unknown as number,
      cluster_total: '84' as unknown as number,
      shared_count: '6' as unknown as number,
    });
    expect(s.collegeTotal).toBe(90);
    expect(s.clusterTotal).toBe(84);
    // If the strings had been concatenated rather than added, this reads '9084'.
    expect(s.sentence).toContain('Colleges report 90 between them');
  });

  it('floors a malformed or negative count at zero rather than rendering it', () => {
    const s = summariseEvidenceScope({
      metric_code: 'X',
      college_total: -3 as unknown as number,
      cluster_total: null as unknown as number,
      shared_count: 'nonsense' as unknown as number,
    });
    expect(s.collegeTotal).toBe(0);
    expect(s.clusterTotal).toBe(0);
    expect(s.sentence).toBe('Not captured yet.');
  });
});

describe('summariseEvidenceScopes', () => {
  it('separates answerable metrics from gaps and never emits a score', () => {
    const out = summariseEvidenceScopes([
      { metric_code: 'RPC_PU', college_total: 90, cluster_total: 84, shared_count: 6 },
      { metric_code: 'RPC_IP', college_total: 11, cluster_total: 11, shared_count: 0 },
      { metric_code: 'PR_PEER', college_total: 0, cluster_total: 0, shared_count: 0 },
    ]);
    expect(out.metricsWithEvidence).toBe(2);
    expect(out.metricsNotCaptured).toBe(1);
    expect(out.sharedItems).toBe(6);
    // No grade, no total, no ranking — matching the CAC dashboard's stance.
    expect(Object.keys(out)).not.toContain('score');
    expect(Object.keys(out)).not.toContain('grade');
    expect(Object.keys(out)).not.toContain('percentage');
  });
});

describe('summariseReportedVsActual', () => {
  it('keeps the filed figure alongside the current one when they agree', () => {
    const s = summariseReportedVsActual({
      metric_code: '3.4.3',
      reported: 61,
      actual: 61,
      drift: 0,
    });
    expect(s.status).toBe('unchanged');
    expect(s.sentence).toBe('Reported 61, and still 61 today.');
  });

  it('reports growth without calling the filed figure wrong', () => {
    // Decision 7: a number filed with a body is a historical fact. Drift is
    // information, not an error to be corrected away.
    const s = summariseReportedVsActual({
      metric_code: '3.4.3',
      reported: 61,
      actual: 84,
      drift: 23,
    });
    expect(s.status).toBe('grown');
    expect(s.sentence).toBe('Reported 61; 84 today (23 more since filing).');
    expect(s.sentence).not.toMatch(/wrong|error|incorrect|mismatch/i);
  });

  it('reports a fall in plain words rather than a negative number', () => {
    const s = summariseReportedVsActual({
      metric_code: '3.4.3',
      reported: 84,
      actual: 61,
      drift: -23,
    });
    expect(s.status).toBe('fallen');
    expect(s.sentence).toBe('Reported 84; 61 today (23 fewer since filing).');
    expect(s.sentence).not.toContain('-23');
  });

  it('distinguishes "never reported" from "reported as zero"', () => {
    // These are different claims to an assessor, and collapsing them is how a
    // gap gets read as a measured zero.
    const never = summariseReportedVsActual({
      metric_code: 'PR_PEER',
      reported: null,
      actual: 0,
      drift: null,
    });
    const asZero = summariseReportedVsActual({
      metric_code: 'PR_PEER',
      reported: 0,
      actual: 0,
      drift: 0,
    });
    expect(never.status).toBe('unreported');
    expect(never.sentence).toContain('Not part of the filed submission');
    expect(asZero.status).toBe('unchanged');
    expect(asZero.sentence).toBe('Reported 0, and still 0 today.');
    expect(never.sentence).not.toBe(asZero.sentence);
  });

  it('survives numeric columns arriving as strings', () => {
    const s = summariseReportedVsActual({
      metric_code: '3.4.3',
      reported: '61',
      actual: '84',
      drift: '23',
    });
    expect(s.reported).toBe(61);
    expect(s.actual).toBe(84);
    expect(s.drift).toBe(23);
  });
});
