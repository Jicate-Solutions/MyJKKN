/**
 * Which outside body inspects which college.
 *
 * Director decision 3 turns on a distinction that is easy to state and easy to
 * lose in code: a zero is a claim about performance, "does not apply" is a claim
 * about jurisdiction, and "not established yet" is the admission that neither
 * has been settled. The tests below check that all three stay distinct and that
 * the module never upgrades an unknown into either kind of fact.
 *
 * They also pin two things that live outside this module and could drift into
 * disagreeing with it: the seeded config row, and the canonical list of ten body
 * codes the rest of the accreditation module already uses.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  DEFAULT_BODY_APPLICABILITY,
  APPLICABILITY_LABEL,
  BODY_APPLICABILITY_POLICY_KEY,
  bodiesInMap,
  describeAllBodies,
  describeBodyApplicability,
  findBodyRule,
  isInspectedAtAll,
  parseBodyApplicabilityConfig,
  resolveApplicability,
  type ApplicableInstitution,
  type BodyApplicabilityConfig,
} from '@/app/(routes)/accreditation/_lib/body-applicability';
import { BODY_ORDER } from '@/app/(routes)/accreditation/iqac/_lib/metric-framework';

// The eight colleges carrying an iqac_code, read live 2026-08-02.
const PHAR: ApplicableInstitution = { name: 'College of Pharmacy', iqac_code: 'PHAR' };
const DENT: ApplicableInstitution = { name: 'Dental College and Hospital', iqac_code: 'DENT' };
const NURS: ApplicableInstitution = { name: 'Nursing and Research', iqac_code: 'NURS' };
const EDUC: ApplicableInstitution = { name: 'College of Education', iqac_code: 'EDUC' };
const ENGG: ApplicableInstitution = { name: 'Engineering and Technology', iqac_code: 'ENGG' };
const ALHD: ApplicableInstitution = { name: 'Allied Health Sciences', iqac_code: 'ALHD' };
const ASAI: ApplicableInstitution = { name: 'Arts and Science Aided', iqac_code: 'ASAI' };
const ASSF: ApplicableInstitution = { name: 'Arts and Science Self', iqac_code: 'ASSF' };

const COLLEGES = [ALHD, ASAI, ASSF, DENT, EDUC, ENGG, NURS, PHAR];

// The six that carry no code: two schools, the main office, the incubation
// forum, a test tenant and an external company.
const UNCODED: ApplicableInstitution[] = [
  { name: 'JKKN Matric Higher Secondary School', iqac_code: null },
  { name: 'Nattraja Vidhyalya CBSE', iqac_code: null },
  { name: 'JKKN Main Office', iqac_code: null },
  { name: 'Nattraja Incubation Forum', iqac_code: null },
  { name: 'JKKN Testing Institution', iqac_code: null },
  { name: 'Jicate Solutions', iqac_code: '' },
];

describe('applies — the body does inspect this college', () => {
  it('a discipline council applies to the one college in its field', () => {
    expect(resolveApplicability(PHAR, 'PCI')).toBe('applies');
    expect(resolveApplicability(DENT, 'DCI')).toBe('applies');
    expect(resolveApplicability(NURS, 'INC')).toBe('applies');
    expect(resolveApplicability(EDUC, 'NCTE')).toBe('applies');
  });

  it('an institution-wide body reaches every college carrying a code', () => {
    for (const college of COLLEGES) {
      expect(resolveApplicability(college, 'NAAC')).toBe('applies');
      expect(resolveApplicability(college, 'UGC')).toBe('applies');
    }
  });

  it('a ninth college needs no edit — a new code inherits the institution-wide bodies', () => {
    const ninth: ApplicableInstitution = { name: 'A College Opened Tomorrow', iqac_code: 'NEWC' };
    expect(resolveApplicability(ninth, 'NAAC')).toBe('applies');
    // …but gains no discipline council and no unverified pairing by accident.
    expect(resolveApplicability(ninth, 'PCI')).toBe('does_not_apply');
    expect(resolveApplicability(ninth, 'NBA')).toBe('not_established');
  });

  it('NBA applies to the one college verified to hold accreditable technical programmes', () => {
    expect(resolveApplicability(ENGG, 'NBA')).toBe('applies');
    expect(resolveApplicability(ENGG, 'AICTE')).toBe('applies');
  });

  it('the sentence names the body and the college, and carries no number', () => {
    const { sentence, label, verdict } = describeBodyApplicability(PHAR, 'PCI');
    expect(verdict).toBe('applies');
    expect(label).toBe('Applies');
    expect(sentence).toBe('PCI inspects College of Pharmacy.');
    expect(sentence).not.toMatch(/\d/);
  });

  it('reads a lowercase or padded body code the same way', () => {
    expect(resolveApplicability(PHAR, ' pci ')).toBe('applies');
    expect(resolveApplicability({ name: 'College of Pharmacy', iqac_code: ' phar ' }, 'PCI')).toBe(
      'applies',
    );
  });
});

describe('does not apply — verified jurisdiction, never a zero', () => {
  it('a discipline council does not reach a college outside its field', () => {
    expect(resolveApplicability(DENT, 'PCI')).toBe('does_not_apply');
    expect(resolveApplicability(PHAR, 'DCI')).toBe('does_not_apply');
    expect(resolveApplicability(ENGG, 'INC')).toBe('does_not_apply');
    expect(resolveApplicability(NURS, 'NCTE')).toBe('does_not_apply');
  });

  it('every discipline council reaches exactly one of the eight colleges', () => {
    for (const bodyCode of ['PCI', 'DCI', 'INC', 'NCTE']) {
      const applying = COLLEGES.filter((c) => resolveApplicability(c, bodyCode) === 'applies');
      expect(applying).toHaveLength(1);
    }
  });

  it('an institution with no iqac_code is outside every one of the ten', () => {
    for (const inst of UNCODED) {
      for (const bodyCode of bodiesInMap()) {
        expect(resolveApplicability(inst, bodyCode)).toBe('does_not_apply');
      }
    }
  });

  it('agrees with the coarse any-body rule that decides it first', () => {
    // `isInspectedByAccreditationBodies()` in iqac/_lib/collect-once.ts asks the
    // same question of the same field. Where it says nobody inspects, no
    // per-body rule here may say otherwise — including for a body whose remit
    // would otherwise reach every institution.
    for (const inst of UNCODED) {
      expect(isInspectedAtAll(inst)).toBe(false);
      expect(resolveApplicability(inst, 'NAAC')).toBe('does_not_apply');
    }
    for (const college of COLLEGES) {
      expect(isInspectedAtAll(college)).toBe(true);
    }
  });

  it('says why, in words, and never with a number', () => {
    const outsideRemit = describeBodyApplicability(DENT, 'PCI');
    expect(outsideRemit.label).toBe('Does not apply');
    expect(outsideRemit.sentence).toBe('Does not apply — PCI inspects pharmacy education only.');
    expect(outsideRemit.sentence).not.toMatch(/\d/);

    const uninspected = describeBodyApplicability(UNCODED[0], 'NAAC');
    expect(uninspected.sentence).toBe(
      'Does not apply — no awarding body inspects JKKN Matric Higher Secondary School.',
    );
  });
});

describe('not established yet — the answer that refuses to guess', () => {
  it('a partial body reaches no verdict for a college it was not verified against', () => {
    for (const college of [DENT, NURS, EDUC, PHAR, ALHD, ASAI, ASSF]) {
      expect(resolveApplicability(college, 'NBA')).toBe('not_established');
      expect(resolveApplicability(college, 'AICTE')).toBe('not_established');
    }
  });

  it('a ranking exercise nobody has recorded entering is unknown for every college', () => {
    for (const college of COLLEGES) {
      expect(resolveApplicability(college, 'NIRF')).toBe('not_established');
      expect(resolveApplicability(college, 'QS')).toBe('not_established');
    }
  });

  it('a body the map has never heard of is unknown, never excused', () => {
    // A body added to the framework tomorrow must not silently read as "does
    // not apply" for all eight colleges.
    expect(resolveApplicability(ENGG, 'NEWBODY')).toBe('not_established');
    expect(resolveApplicability(ENGG, '')).toBe('not_established');
    expect(findBodyRule('NEWBODY')).toBeNull();
  });

  it('says it is unrecorded rather than implying a decision was taken', () => {
    const { label, sentence } = describeBodyApplicability(DENT, 'NBA');
    expect(label).toBe('Not established yet');
    expect(sentence).toContain('Not established yet');
    expect(sentence).toContain('has not been recorded');
    expect(sentence).not.toContain('Does not apply');
    expect(sentence).not.toMatch(/\d/);
  });

  it('an unknown body still gets a full sentence naming it', () => {
    const { sentence } = describeBodyApplicability(ENGG, 'NEWBODY');
    expect(sentence).toBe(
      'Not established yet — whether NEWBODY applies to Engineering and Technology has not been recorded.',
    );
  });
});

describe('never blank, never a number — the whole point of the decision', () => {
  it('every college × every body yields a label and a non-empty sentence', () => {
    for (const inst of [...COLLEGES, ...UNCODED]) {
      const statements = describeAllBodies(inst);
      expect(statements).toHaveLength(10);
      for (const s of statements) {
        expect(s.sentence.trim().length).toBeGreaterThan(0);
        expect(s.label).toBe(APPLICABILITY_LABEL[s.verdict]);
        expect(s.sentence).not.toMatch(/\d/);
      }
    }
  });

  it('survives a missing name without printing an empty gap', () => {
    const nameless: ApplicableInstitution = { name: '   ', iqac_code: 'ENGG' };
    expect(describeBodyApplicability(nameless, 'NAAC').sentence).toBe(
      'NAAC inspects this institution.',
    );
  });

  it('carries jurisdiction and nothing else — no score, total, weight or rank', () => {
    // Checked structurally rather than by searching the serialised text: a key
    // named `weightage` or `max_score` added to a rule tomorrow fails this,
    // whatever it happens to be called.
    expect(Object.keys(DEFAULT_BODY_APPLICABILITY).sort()).toEqual(['bodies', 'version']);
    for (const rule of DEFAULT_BODY_APPLICABILITY.bodies) {
      expect(Object.keys(rule).sort()).toEqual(['appliesTo', 'bodyCode', 'remit', 'remitNote']);
      for (const value of Object.values(rule)) {
        expect(typeof value).not.toBe('number');
      }
    }
  });
});

describe('the map is configuration, read at runtime', () => {
  it('names the policy key the migration seeds', () => {
    expect(BODY_APPLICABILITY_POLICY_KEY).toBe('accreditation.body_applicability.map');
  });

  it('an administrator can settle an unknown pairing without a deploy', () => {
    const revised: BodyApplicabilityConfig = {
      version: '2026-09-01',
      bodies: [{ bodyCode: 'NBA', remit: 'partial', appliesTo: ['ENGG', 'ALHD'], remitNote: 'x' }],
    };
    expect(resolveApplicability(ALHD, 'NBA')).toBe('not_established');
    expect(resolveApplicability(ALHD, 'NBA', revised)).toBe('applies');
  });

  it('falls back to the reviewed default when the row is missing or unusable', () => {
    for (const bad of [null, undefined, 42, 'nope', {}, { bodies: 'no' }, { bodies: [] }]) {
      expect(parseBodyApplicabilityConfig(bad)).toEqual(DEFAULT_BODY_APPLICABILITY);
    }
  });

  it('drops a malformed body entry instead of letting it poison the map', () => {
    const parsed = parseBodyApplicabilityConfig({
      version: '2026-09-01',
      bodies: [
        { bodyCode: 'NAAC', remit: 'institution_wide', appliesTo: [], remitNote: 'n' },
        { bodyCode: '', remit: 'discipline' },
        { bodyCode: 'PCI', remit: 'not_a_remit' },
        { bodyCode: 'DCI', remit: 'discipline', appliesTo: ['DENT', 7, ''], remitNote: 'd' },
      ],
    });
    expect(parsed.bodies.map((b) => b.bodyCode)).toEqual(['NAAC', 'DCI']);
    expect(parsed.bodies[1].appliesTo).toEqual(['DENT']);
    // A body dropped from the map becomes unknown, never excused.
    expect(resolveApplicability(PHAR, 'PCI', parsed)).toBe('not_established');
  });

  it('the seeded config row and the code fallback are the same map', () => {
    const sql = readFileSync(
      path.resolve(
        process.cwd(),
        'supabase/migrations/20260809100500_accreditation_body_applicability_policy.sql',
      ),
      'utf8',
    );
    const between = sql.split('BODY_APPLICABILITY_MAP_JSON_BEGIN')[1]?.split(
      'BODY_APPLICABILITY_MAP_JSON_END',
    )[0];
    expect(between, 'the JSON markers must both be present in the migration').toBeTruthy();

    const literal = between!.trim().replace(/::jsonb,?\s*(--.*)?$/, '').trim();
    expect(literal.startsWith("'") && literal.endsWith("'")).toBe(true);

    const seeded = JSON.parse(literal.slice(1, -1).replace(/''/g, "'"));
    expect(seeded).toEqual(DEFAULT_BODY_APPLICABILITY);
  });
});

describe('coherence with the ten bodies the rest of the module already knows', () => {
  it('speaks about exactly the canonical ten, and no others', () => {
    expect([...bodiesInMap()].sort()).toEqual([...BODY_ORDER].sort());
  });

  it('lists each body once', () => {
    const codes = bodiesInMap();
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('every rule carries the note its sentence depends on', () => {
    for (const rule of DEFAULT_BODY_APPLICABILITY.bodies) {
      expect(rule.remitNote.trim().length).toBeGreaterThan(0);
    }
  });

  it('every code named in appliesTo is one of the eight live colleges', () => {
    const live = new Set(COLLEGES.map((c) => c.iqac_code));
    for (const rule of DEFAULT_BODY_APPLICABILITY.bodies) {
      for (const code of rule.appliesTo) {
        expect(live.has(code)).toBe(true);
      }
    }
  });
});
