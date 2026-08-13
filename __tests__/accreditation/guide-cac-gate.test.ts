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

  // ── The state-claim ban ──────────────────────────────────────────────────
  // This test used to be `expect(lower).toContain('empty today')`, pinning a
  // sentence that told the reader the owner desk was empty. That was true when
  // it was written and false eleven days later — owner rows exist now — and the
  // pin is what made the lie load-bearing instead of merely stale. A claim about
  // how full a table is has exactly the shelf life of a hard-coded count, which
  // the group's own header already forbids. So the assertion is inverted: no
  // state claim in either direction, at any row count.
  it('makes no claim about how full the owner desk is — that is what rotted', () => {
    for (const phrase of [
      'empty today',
      'mostly empty',
      'nobody has been named',
      'no one has been named',
      'not been named against anything',
      'currently unowned',
      'no owners yet',
      'already owned',
      'every metric now has',
    ]) {
      expect(lower).not.toContain(phrase);
    }
  });

  it('still teaches what an unowned metric MEANS, having stopped counting them', () => {
    // Dropping the state claim must not drop the teaching with it: the reader
    // still has to know that a blank is work with no one attached, not a fault.
    expect(lower).toContain('no name against it');
    expect(lower).toContain('belongs to nobody');
  });

  it('teaches body-level ownership as the ordinary case, per-metric as the escalation', () => {
    // Director, 2026-08-13 (R3). Every owner row live that day was body-level
    // (metric_code NULL). A reader must not leave believing the framework has to
    // be filled in one question at a time.
    expect(lower).toContain('whole awarding body');
    expect(lower).toContain('normal way');
    expect(lower).toContain('only when'); // the per-metric row, framed as conditional
    // Order carries the meaning — the default is taught before the exception.
    const actions = cacSections.flatMap((s) => s.steps.map((st) => st.action.toLowerCase()));
    const bodyFirst = actions.findIndex((a) => a.includes('whole awarding body'));
    const metricAfter = actions.findIndex((a) => a.includes('single metric'));
    expect(bodyFirst).toBeGreaterThanOrEqual(0);
    expect(metricAfter).toBeGreaterThan(bodyFirst);
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

  it('says the key can arrive by HANDOVER, not only by role', () => {
    // user_has_permission() has FOUR paths; the fourth is fn_handover_grants_key
    // (migration 20260811100100). On 2026-08-13 the only person actually working
    // this desk held the key that way and held no role carrying it — so a guide
    // that describes roles alone tells a Principal they are locked out when they
    // are one Director handover away. Director 2026-08-13 (R1) excludes
    // principals from the role grant deliberately, which makes this load-bearing.
    const prereqs = cacSections
      .flatMap((s) => s.steps.map((st) => `${st.prerequisite ?? ''} ${st.tip ?? ''}`))
      .join(' ')
      .toLowerCase();
    expect(prereqs).toContain('handover');
    expect(prereqs).toContain('director');
    // …and it must not tell the reader they can grant it to themselves.
    expect(prereqs).toContain('nobody can grant it to themselves');
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
