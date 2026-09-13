// Two live JKKN colleges share a display_name. This screen asks the user to
// rank which college yields a meeting slot, so identical rows are not cosmetic.
import { describe, it, expect } from 'vitest';

// The four vi.mock() calls that used to sit here are gone with the helper's
// move out of lib/services/meetings/: that path dragged in Resend, a browser
// Supabase client and the Google Calendar service at import time, and the
// module died before the first assertion without them. The helper now lives in
// lib/utils/institutions/ and imports nothing at all, so there is nothing left
// to stub. If this file ever needs a mock again, the helper has grown a
// dependency it should not have.
import {
  labelInstitutions,
  institutionLabelById,
} from '@/lib/utils/institutions/institution-labels';

// The real production rows, verified 2026-08-31.
const AIDED = { id: 'a33138b6', name: 'JKKN College of Arts and Science (Aided)', display_name: 'JKKN College of Arts and Science (Autonomous)' };
const SELF  = { id: 'b0b8a724', name: 'JKKN College of Arts and Science (Self)',  display_name: 'JKKN College of Arts and Science (Autonomous)' };
const DENTAL = { id: 'd1', name: 'JKKN Dental College', display_name: 'JKKN Dental College and Hospital' };

describe('labelInstitutions', () => {
  it('gives colliding display_names distinct labels', () => {
    const out = labelInstitutions([AIDED, SELF, DENTAL]);
    const aided = out.find((o) => o.id === 'a33138b6')!;
    const self = out.find((o) => o.id === 'b0b8a724')!;
    expect(aided.name).not.toBe(self.name);
    expect(aided.name).toContain('(Aided)');
    expect(self.name).toContain('(Self)');
  });

  it('would FAIL under the old display_name-always rule', () => {
    // Discrimination proof: the previous behaviour collapsed both to one label.
    const old = [AIDED, SELF].map((i) => i.display_name || i.name);
    expect(old[0]).toBe(old[1]); // the bug, reproduced
    const fixed = labelInstitutions([AIDED, SELF]).map((o) => o.name);
    expect(fixed[0]).not.toBe(fixed[1]); // the fix
  });

  it('keeps display_name where it is unique', () => {
    const out = labelInstitutions([AIDED, SELF, DENTAL]);
    expect(out.find((o) => o.id === 'd1')!.name).toBe('JKKN Dental College and Hospital');
  });

  it('falls back to name when display_name is missing', () => {
    const out = labelInstitutions([{ id: 'x', name: 'Only Name', display_name: null }]);
    expect(out[0].name).toBe('Only Name');
  });

  it('handles an empty list', () => {
    expect(labelInstitutions([])).toEqual([]);
  });

  it('disambiguates three-way collisions too', () => {
    const rows = ['A', 'B', 'C'].map((s) => ({ id: s, name: `Real ${s}`, display_name: 'Same Label' }));
    const names = labelInstitutions(rows).map((o) => o.name);
    expect(new Set(names).size).toBe(3);
  });
});

// ============================================================================
// institutionLabelById — the id-indexed form, added when the helper was
// promoted out of lib/services/meetings/ and applied to three screens that
// render a list they already hold: the /admin/loops cluster picker, that
// lens's member roster, and the BoS taxonomy list's institution column.
// ============================================================================
describe('institutionLabelById', () => {
  it('agrees with labelInstitutions, keyed by id', () => {
    const rows = [AIDED, SELF, DENTAL];
    const byId = institutionLabelById(rows);
    for (const o of labelInstitutions(rows)) {
      expect(byId.get(o.id)).toBe(o.name);
    }
  });

  it('separates the two colleges a cluster is summed over', () => {
    const byId = institutionLabelById([AIDED, SELF, DENTAL]);
    expect(byId.get('a33138b6')).not.toBe(byId.get('b0b8a724'));
    expect(byId.get('d1')).toBe('JKKN Dental College and Hospital');
  });

  // The trap the cluster lens's roster would fall into if it labelled the
  // SELECTED members instead of the full list: one of the pair on its own has
  // no collision to detect, so it would render "(Autonomous)" in the roster
  // while the checkbox that picked it read "(Aided)". Two names for one click.
  it('a subset of one loses the collision — so label the FULL list', () => {
    const subsetOnly = institutionLabelById([AIDED]).get('a33138b6');
    const fullList = institutionLabelById([AIDED, SELF]).get('a33138b6');
    expect(subsetOnly).toBe('JKKN College of Arts and Science (Autonomous)');
    expect(fullList).toBe('JKKN College of Arts and Science (Aided)');
    expect(subsetOnly).not.toBe(fullList); // why the call sites pass the whole list
  });

  it('prefers name over an empty-string display_name', () => {
    // `||` not `??`: an empty label is not a label. The BoS taxonomies route
    // previously used `??` here, which would have rendered a blank column.
    const byId = institutionLabelById([{ id: 'e', name: 'Real Name', display_name: '' }]);
    expect(byId.get('e')).toBe('Real Name');
  });

  it('returns an empty map for no rows', () => {
    expect(institutionLabelById([]).size).toBe(0);
  });
});

// ============================================================================
// The BoS taxonomy list deduplicates rows by `code::institution_name`. With
// both colleges labelled identically that key collapsed two DIFFERENT
// institutions' taxonomies into one row — and each row carries a delete
// button, so the survivor was unattributable and the other unreachable.
// This asserts the property the route now gives that key.
// ============================================================================
describe('taxonomy dedup key', () => {
  const dedupKey = (code: string, institutionName: string | undefined) =>
    `${code}::${institutionName ?? ''}`;

  it('collapsed two colleges into one row under the old label', () => {
    const oldLabel = (i: typeof AIDED) => i.display_name || i.name;
    expect(dedupKey('BLOOM', oldLabel(AIDED))).toBe(dedupKey('BLOOM', oldLabel(SELF)));
  });

  it('keeps them apart under the disambiguated label', () => {
    const byId = institutionLabelById([AIDED, SELF]);
    expect(dedupKey('BLOOM', byId.get(AIDED.id))).not.toBe(
      dedupKey('BLOOM', byId.get(SELF.id)),
    );
  });
});
