import { describe, it, expect } from 'vitest';
import * as readiness from '@/app/(routes)/accreditation/cac/_lib/ugc-readiness';
import {
  buildUgcReadiness,
  isSatisfied,
  isFixableByEntry,
  CAC_READINESS_PERMISSION,
  UGC_GUIDANCE,
  type ReadinessInput,
  type ReadinessRow,
} from '@/app/(routes)/accreditation/cac/_lib/ugc-readiness';

// ---------------------------------------------------------------------------
// The UGC readiness checklist is a screen about absences, which is the hardest
// kind of screen to get right. Four things can break it and not one of them
// throws:
//
//   1. A bare 0. It reads as a measured bad result and would libel a college
//      for a gap in the platform. Every empty figure must come back as the
//      REASON it is empty.
//   2. The two kinds of empty collapsing into one. "Nobody has typed this in"
//      and "no record anywhere can hold this" call for opposite responses, and
//      a screen that conflates them tells a reader to go and fill in a column
//      that does not exist.
//   3. A red row with no next click, which is a complaint rather than a
//      finding.
//   4. A count written into a sentence. Eleven of those had to be stripped out
//      of this module once already when the data moved and the prose did not.
//
// PRODUCTION, 2026-08-14 — the shape the checklist actually ships into. The
// governance half is empty and the behaviour half is not, and that asymmetry is
// the whole output of the file.
// ---------------------------------------------------------------------------

const PRODUCTION: ReadinessInput = {
  internalAgreements: 0, // the register can hold one now; nobody has filed one
  councilsConstituted: 0, // accreditation_committees holds none of type 'cluster'
  peerBookings: 97, // real, and happening
  hubBookings: 0,
  teachingAssignments: 70, // real, and happening
  teachingPeople: 13,
  publications: 0, // sh_publications is empty
};

/** Everything empty — the worst case the screen has to survive intact. */
const NOTHING: ReadinessInput = {
  internalAgreements: 0,
  councilsConstituted: 0,
  peerBookings: 0,
  hubBookings: 0,
  teachingAssignments: 0,
  teachingPeople: 0,
  publications: 0,
};

describe('buildUgcReadiness — no bare zero, ever', () => {
  it('returns a reason instead of a value for every empty figure', () => {
    const figures = buildUgcReadiness(NOTHING).flatMap((r) => r.figures);

    expect(figures.length).toBeGreaterThan(0);
    for (const f of figures) {
      expect(f.value).toBeNull();
      expect(f.reason.trim().length).toBeGreaterThan(0);
      // The reason must SAY something. "0" dressed as a string is the same
      // libel with a different type.
      expect(f.reason).not.toBe('0');
      expect(f.reason).not.toMatch(/\d/);
    }
  });

  it('never puts a zero in the payload at all', () => {
    expect(JSON.stringify(buildUgcReadiness(NOTHING))).not.toContain('"value":0');
  });

  it('prints a real count when there is one', () => {
    const rows = buildUgcReadiness(PRODUCTION);
    const teaching = rows.find((r) => r.id === 'shared-teaching')!;

    expect(teaching.figures[0].value).toBe(70);
    expect(teaching.figures[1].value).toBe(13);

    // The empty half of a mixed row still degrades to its reason rather than 0.
    const pooled = rows.find((r) => r.id === 'pooled-facilities')!;
    expect(pooled.figures[0].value).toBe(97);
    expect(pooled.figures[1].value).toBeNull();
    expect(pooled.figures[1].reason).toMatch(/nothing recorded/i);
  });
});

describe('buildUgcReadiness — a satisfied line and an unsatisfied one are distinguishable', () => {
  it('separates what JKKN already does from what it has never written down', () => {
    const rows = buildUgcReadiness(PRODUCTION);

    const behaviour = rows.filter(isSatisfied).map((r) => r.id);
    expect(behaviour).toContain('pooled-facilities');
    expect(behaviour).toContain('shared-teaching');

    const governance = rows.filter((r) => !isSatisfied(r)).map((r) => r.id);
    expect(governance).toContain('written-agreement');
    expect(governance).toContain('council-constituted');
    expect(governance).toContain('council-decisions');
    expect(governance).toContain('shared-research-agenda');
  });

  it('flips a line to satisfied the moment the underlying record appears', () => {
    const before = buildUgcReadiness(PRODUCTION).find(
      (r) => r.id === 'council-constituted',
    )!;
    const after = buildUgcReadiness({
      ...PRODUCTION,
      councilsConstituted: 1,
    }).find((r) => r.id === 'council-constituted')!;

    expect(isSatisfied(before)).toBe(false);
    expect(isSatisfied(after)).toBe(true);
    expect(before.state).not.toBe(after.state);
  });

  it('stops blaming the minutes line once a council exists', () => {
    // A line that cannot be true yet is not a failing of its own, and the two
    // states must not read the same.
    const blocked = buildUgcReadiness(PRODUCTION).find(
      (r) => r.id === 'council-decisions',
    )!;
    const unblocked = buildUgcReadiness({
      ...PRODUCTION,
      councilsConstituted: 2,
    }).find((r) => r.id === 'council-decisions')!;

    expect(blocked.state).toBe('blocked');
    expect(unblocked.state).toBe('elsewhere');
    expect(blocked.reading).not.toBe(unblocked.reading);
  });
});

describe('buildUgcReadiness — the two kinds of empty are not interchangeable', () => {
  // The distinction is enforced on the HELPER, not only on whichever rows
  // happen to carry each state today. `not-expressible` currently has no row —
  // the inter-college agreement was the last one, and the register gained a
  // column that holds it (migration 20260921040000). Asserting the helper keeps
  // rule 3 live for the next row that needs it, instead of quietly retiring the
  // distinction along with its last user.
  const asRow = (state: ReadinessRow['state']): ReadinessRow => ({
    id: 'probe',
    asks: 'A line of the guidance.',
    reading: 'A reading of it.',
    state,
    figures: [],
    fix: null,
  });

  it('keeps a gap somebody can type away separable from one they cannot', () => {
    expect(isFixableByEntry(asRow('awaiting-entry'))).toBe(true);
    expect(isFixableByEntry(asRow('blocked'))).toBe(true);
    expect(isFixableByEntry(asRow('not-expressible'))).toBe(false);
    expect(isFixableByEntry(asRow('in-place'))).toBe(false);
  });

  it('has no line left that no record anywhere can hold', () => {
    // What this change did, asserted as the fact it is. Every gap on the list
    // is now answerable by somebody entering data — so the screen never tells a
    // reader to go and type into a column that does not exist.
    for (const row of buildUgcReadiness(PRODUCTION)) {
      expect(row.state).not.toBe('not-expressible');
      if (!isSatisfied(row)) expect(isFixableByEntry(row)).toBe(true);
    }
    for (const row of buildUgcReadiness(NOTHING)) {
      expect(row.state).not.toBe('not-expressible');
    }
  });

  it('moved the inter-college agreement to the kind somebody typing fixes', () => {
    const agreement = buildUgcReadiness(PRODUCTION).find(
      (r) => r.id === 'written-agreement',
    )!;

    expect(isSatisfied(agreement)).toBe(false);
    expect(agreement.state).toBe('awaiting-entry');
    expect(isFixableByEntry(agreement)).toBe(true);
    // Still empty, and still says so as a reason rather than as a zero.
    expect(agreement.figures[0].value).toBeNull();
    expect(agreement.figures[0].reason).toMatch(/nothing recorded/i);
  });

  it('answers the agreement line to its own record and to nothing else', () => {
    // No volume of bookings, teaching, councils or papers stands in for an
    // agreement between two colleges — only an agreement does.
    const busy = buildUgcReadiness({
      internalAgreements: 0,
      councilsConstituted: 3,
      peerBookings: 400,
      hubBookings: 400,
      teachingAssignments: 400,
      teachingPeople: 90,
      publications: 40,
    }).find((r) => r.id === 'written-agreement')!;

    expect(busy.state).toBe('awaiting-entry');
    expect(isSatisfied(busy)).toBe(false);

    // And one filed agreement satisfies it with everything else at zero.
    const filed = buildUgcReadiness({ ...NOTHING, internalAgreements: 1 }).find(
      (r) => r.id === 'written-agreement',
    )!;

    expect(filed.state).toBe('in-place');
    expect(isSatisfied(filed)).toBe(true);
    expect(filed.figures[0].value).toBe(1);
  });
});

describe('buildUgcReadiness — a red line offers the route that fixes it', () => {
  it('gives the agreements register to the agreement line', () => {
    const agreement = buildUgcReadiness(PRODUCTION).find(
      (r) => r.id === 'written-agreement',
    )!;

    expect(agreement.fix).not.toBeNull();
    expect(agreement.fix!.href).toBe('/accreditation/manage/collaborations');
    expect(agreement.fix!.label.trim().length).toBeGreaterThan(0);
  });

  it('gives the committees hub to both council lines', () => {
    const rows = buildUgcReadiness(PRODUCTION);
    for (const id of ['council-constituted', 'council-decisions']) {
      const row = rows.find((r) => r.id === id)!;
      expect(row.fix?.href).toBe('/accreditation/naac/committees');
    }
  });

  it('leaves every unsatisfied line either routed or explained', () => {
    for (const row of buildUgcReadiness(NOTHING)) {
      if (isSatisfied(row)) continue;
      // A line with no single route that fixes it must at least say what is
      // true today, so the reader is never left with a bare red mark.
      expect(row.fix !== null || row.reading.trim().length > 0).toBe(true);
    }
  });

  it('never routes to a page that does not exist in this repo', () => {
    const KNOWN_ROUTES = new Set([
      '/accreditation/manage/collaborations',
      '/accreditation/naac/committees',
    ]);
    for (const row of buildUgcReadiness(PRODUCTION)) {
      if (row.fix) expect(KNOWN_ROUTES.has(row.fix.href)).toBe(true);
    }
  });
});

describe('buildUgcReadiness — no count is written into prose, and no score anywhere', () => {
  it('keeps digits out of every sentence on screen', () => {
    // The guard that stops a sentence going stale when the data moves. If a
    // figure belongs on screen it goes in `figures`, where it is derived.
    for (const row of buildUgcReadiness(PRODUCTION)) {
      expect(row.asks).not.toMatch(/\d/);
      expect(row.reading).not.toMatch(/\d/);
      for (const f of row.figures) expect(f.label).not.toMatch(/\d/);
    }
  });

  it('exports no helper that could produce a total or a proportion', () => {
    // A fraction turns a checklist into a rating, and a rating implies somebody
    // entitled to award one. On JKKN's own council nobody is. This asserts the
    // shape of the module, so adding such a helper fails here first.
    const exported = Object.keys(readiness).sort();
    expect(exported).toEqual([
      'CAC_READINESS_PERMISSION',
      'UGC_GUIDANCE',
      'buildUgcReadiness',
      'isFixableByEntry',
      'isSatisfied',
    ]);
  });

  it('carries the permission key and the guidance citation for the screen to name', () => {
    expect(CAC_READINESS_PERMISSION).toBe('accreditation.cac.readiness.view');
    expect(UGC_GUIDANCE.section).toBe('6.3');
    expect(UGC_GUIDANCE.issuer).toBe('University Grants Commission');
  });
});
