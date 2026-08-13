/**
 * Accreditation guide — the CAC group must reach a reader who holds
 * `accreditation.cac.view`, and nobody else.
 *
 * The Cluster Academic Council is the one entry in the accreditation row that is
 * NOT an outside regulator, and it had no guide section at all — CAC appeared
 * twice in the whole module, as one tip and one glossary row. This group is that
 * gap filled, and it is gated on its own key rather than on the lane's.
 *
 * The failure this guards is silent and specific. `withRequires()` stamps ONE
 * key across every section handed to it, so anyone who later "tidies" the four
 * calls in `accreditationLane()` into one will re-gate the CAC steps on
 * `accreditation.view` and the owner steps on `accreditation.cac.view`. Nothing
 * throws, the lane still renders, and the section simply stops reaching the
 * people it was written for. tsc cannot see it; the deep-link smoke gate cannot
 * see it; only this can.
 *
 * Assertions run against the COMPOSED registry and, for the last block, against
 * what `filterLaneSections` actually RETURNS for a given permission set —
 * because composition and filtering are where the gate is decided, not where it
 * is authored. Deliberately NOT a re-implementation of the gating rule: the test
 * calls the same filter the server calls and reads the result.
 */
import { describe, it, expect } from 'vitest';
import { accreditationGuide, composeLane } from '@/lib/guide/registry';
import { filterLaneSections } from '@/lib/guide/filter';
import { REQUIRES, cacSections } from '@/lib/accreditation/guide/content';

/** Every canonical lane the accreditation module fills. */
const LANES = ['coordinator', 'supervisor', 'module-admin', 'external'] as const;

const CAC_IDS = cacSections.map((s) => s.id);

const laneSections = (lane: (typeof LANES)[number]) =>
  ((accreditationGuide.lanes as any)[lane].sections ?? []) as Array<any>;

describe('CAC guide group — composition', () => {
  it('is contributed to every accreditation lane, not just one', () => {
    expect(CAC_IDS.length).toBeGreaterThan(0);
    for (const lane of LANES) {
      const ids = laneSections(lane).map((s) => s.id);
      for (const id of CAC_IDS) expect(ids).toContain(id);
    }
  });

  it('carries steps in every section (an empty group renders as nothing)', () => {
    for (const s of cacSections) expect(s.steps.length).toBeGreaterThan(0);
  });
});

describe('CAC guide group — gating', () => {
  it('is gated on the key that actually opens the council page', () => {
    expect(REQUIRES.cac).toBe('accreditation.cac.view');
    for (const lane of LANES) {
      for (const s of laneSections(lane).filter((x) => CAC_IDS.includes(x.id))) {
        expect(s.requires).toBe(REQUIRES.cac);
      }
    }
  });

  it('never borrows another group’s key — the re-stamp failure', () => {
    for (const lane of LANES) {
      for (const s of laneSections(lane).filter((x) => CAC_IDS.includes(x.id))) {
        expect(s.requires).not.toBe(REQUIRES.overview);
        expect(s.requires).not.toBe(REQUIRES.owner);
        expect(s.requires).not.toBe(REQUIRES.framework);
        expect(s.requires).not.toBe(REQUIRES.assign);
      }
    }
  });

  it('leaves the four pre-existing groups on their original gates', () => {
    // The other half of the same failure: merging the calls would move THESE.
    const others = laneSections('supervisor').filter((s) => !CAC_IDS.includes(s.id));
    expect(others.length).toBeGreaterThan(0);
    const seen = new Set(others.map((s) => s.requires));
    expect(seen.has(REQUIRES.cac)).toBe(false);
    for (const r of seen) {
      expect([
        REQUIRES.overview,
        REQUIRES.owner,
        REQUIRES.framework,
        REQUIRES.assign,
      ]).toContain(r);
    }
  });

  it('keeps cac a genuinely different key from every other group key', () => {
    const keys = Object.values(REQUIRES);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('CAC guide group — what the reader actually receives', () => {
  // composeLane namespaces section ids as "<module>:<id>".
  const NS = (id: string) => `accreditation:${id}`;
  const lane = composeLane('supervisor');

  const idsFor = (granted: string[]) =>
    filterLaneSections(lane, (key) => granted.includes(key)).sections.map((s) => s.id);

  it('is RETURNED to a viewer holding accreditation.cac.view', () => {
    const ids = idsFor([REQUIRES.cac]);
    for (const id of CAC_IDS) expect(ids).toContain(NS(id));
  });

  it('is WITHHELD from a viewer who holds every other accreditation key but not it', () => {
    const ids = idsFor([
      REQUIRES.overview,
      REQUIRES.owner,
      REQUIRES.framework,
      REQUIRES.assign,
    ]);
    for (const id of CAC_IDS) expect(ids).not.toContain(NS(id));
    // …and the rest of the accreditation guide still arrives, so this is a
    // section-level gate and not the lane collapsing.
    expect(ids.some((id) => id.startsWith('accreditation:'))).toBe(true);
  });

  it('is withheld from a viewer holding nothing at all', () => {
    const ids = idsFor([]);
    for (const id of CAC_IDS) expect(ids).not.toContain(NS(id));
  });
});

describe('CAC guide group — the honesty rules the module’s header sets', () => {
  const text = JSON.stringify(cacSections);
  const lower = text.toLowerCase();

  it('sends the reader to the council page and the owner desk', () => {
    const hrefs = cacSections.flatMap((s) =>
      s.steps.map((st) => st.link?.href).filter(Boolean),
    );
    expect(hrefs).toContain('/accreditation/cac');
    expect(hrefs).toContain('/accreditation/manage/owners');
    expect(hrefs).toContain('/accreditation/cac/brief');
  });

  it('says the owner desk is empty rather than implying a populated system', () => {
    expect(lower).toContain('empty today');
  });

  it('describes the confirm step that the live table actually has', () => {
    // accreditation_metric_owners.assignment_status ('pending'|'confirmed'|
    // 'declined') + acknowledged_at, added by migration 20260809100000.
    expect(lower).toContain('confirm');
    expect(lower).toContain('decline');
  });

  it('names who may assign an owner, as a prerequisite and not a soft tip', () => {
    const prereqs = cacSections
      .flatMap((s) => s.steps.map((st) => st.prerequisite))
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    expect(prereqs).toContain('accreditation.naac.narrative.manage');
    expect(prereqs).toContain('principal');
  });

  it('promises no "Fix this" button — the columns behind it are not in the database', () => {
    expect(lower).not.toContain('fix this');
  });

  it('bakes in no live count — those move nightly and a number here rots', () => {
    // Any standalone 2+ digit number in the copy would be a hard-coded reading.
    // Permission keys and route paths carry none, so this is safe to assert flat.
    const digits = text.match(/(?<![\w.])\d{2,}(?![\w.])/g) ?? [];
    expect(digits).toEqual([]);
  });

  it('reads "not captured yet" as a gap in collection, never as a zero', () => {
    expect(lower).toContain('not captured yet');
    expect(lower).toContain('nobody has collected this');
  });
});
