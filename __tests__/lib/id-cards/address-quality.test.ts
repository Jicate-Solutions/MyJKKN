// __tests__/lib/id-cards/address-quality.test.ts
//
// One test per detector in lib/id-cards/address-quality.ts. Each fixture is
// shaped on a defect measured on production 2026-08-14 across 4,825 active
// learners, and each case asserts BOTH directions: the broken record trips the
// rule, and a clean record of the same shape does not. Without the paired
// negative control a rule that returns true for everything would pass.
//
// The fixtures are real-SHAPED, not real: the defect pattern is reproduced
// exactly, the street names, PIN codes and the phone number are invented. A
// learner's actual home address is personal data and does not belong in a
// source file.
//
// The last block is a drift guard. It reads the renderer's own source and fails
// if the address join order or either character cut changes, because this
// module copies both (render-data.ts cannot be imported into a browser bundle).

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  assessAddress,
  detectAddressIssues,
  joinPrintableAddress,
  needsHumanDecision,
  ADDRESS_ISSUE_META,
  PRINTABLE_ADDRESS_DEFAULT_BACK_MAX,
  PRINTABLE_ADDRESS_CUSTOM_BACK_MAX,
  type AddressParts,
} from '@/lib/id-cards/address-quality';

/** A clean record: nothing repeated, nothing pasted, short enough to print. */
const CLEAN: AddressParts = {
  street: '12 Bharathi Street',
  taluk: 'Kumarapalayam',
  district: 'Namakkal',
  state: 'Tamil Nadu',
  pinCode: '638183',
};

describe('joinPrintableAddress', () => {
  it('joins the five columns in the card back order, dropping blanks', () => {
    expect(joinPrintableAddress(CLEAN)).toBe(
      '12 Bharathi Street, Kumarapalayam, Namakkal, Tamil Nadu, 638183'
    );
    expect(joinPrintableAddress({ street: ' 12 Bharathi Street ', pinCode: '638183' })).toBe(
      '12 Bharathi Street, 638183'
    );
    expect(joinPrintableAddress({})).toBe('');
    expect(joinPrintableAddress({ street: null, taluk: undefined })).toBe('');
  });
});

describe('the clean control', () => {
  it('raises nothing at all', () => {
    const result = assessAddress(CLEAN);
    expect(result.issues).toEqual([]);
    expect(result.severity).toBeNull();
    expect(result.score).toBe(0);
    expect(needsHumanDecision(result)).toBe(false);
  });
});

describe('pin_conflict', () => {
  // Shaped on the record that started this work: the street text carried one
  // PIN and the PIN column carried a different one. A machine cannot know which
  // is right, which is exactly why nothing here auto-corrects.
  it('fires when the street PIN and the PIN column disagree', () => {
    const result = assessAddress({
      street: 'No 65, MC Road, Mangalapuram, Ambur, 635814',
      taluk: 'Dharmapuri',
      district: 'Dharmapuri',
      state: 'Tamil Nadu',
      pinCode: '636701',
    });
    expect(result.issues).toContain('pin_conflict');
    expect(result.conflictingPinCodes.sort()).toEqual(['635814', '636701']);
    expect(needsHumanDecision(result)).toBe(true);
  });

  it('does not fire when the street repeats the SAME PIN as the column', () => {
    const result = assessAddress({ ...CLEAN, street: '12 Bharathi Street, 638183' });
    expect(result.issues).not.toContain('pin_conflict');
    // It is still a duplication, just not a contradiction.
    expect(result.duplicatedParts).toContain('PIN code');
  });

  it('ignores a house number that is not six digits', () => {
    expect(detectAddressIssues({ ...CLEAN, street: 'Door 4512 Bharathi Street' })).not.toContain(
      'pin_conflict'
    );
  });
});

describe('contact_number', () => {
  it('fires on a ten-digit mobile buried in the street text', () => {
    const result = assessAddress({ ...CLEAN, street: '12 Bharathi Street MOBILE: 9000000001' });
    expect(result.issues).toContain('contact_number');
  });

  it('fires on a mobile written with the 91 country code', () => {
    expect(detectAddressIssues({ ...CLEAN, street: '12 Bharathi Street 919000000001' })).toContain(
      'contact_number'
    );
  });

  it('fires on a labelled number even when the digits are formatted oddly', () => {
    expect(detectAddressIssues({ ...CLEAN, street: '12 Bharathi Street, Ph: 04288-201234' })).toContain(
      'contact_number'
    );
  });

  it('does not fire on a PIN code or a door number', () => {
    expect(detectAddressIssues(CLEAN)).not.toContain('contact_number');
    expect(detectAddressIssues({ ...CLEAN, street: 'Plot 1234567, Bharathi Street' })).not.toContain(
      'contact_number'
    );
  });
});

describe('address_missing', () => {
  it('fires when every column is blank or whitespace', () => {
    const result = assessAddress({ street: '  ', taluk: '', district: null, state: undefined, pinCode: '' });
    expect(result.issues).toContain('address_missing');
    expect(result.joined).toBe('');
    expect(needsHumanDecision(result)).toBe(true);
  });

  it('does not fire when only the street is blank', () => {
    expect(detectAddressIssues({ ...CLEAN, street: '' })).not.toContain('address_missing');
  });
});

describe('placeholder_text', () => {
  it('fires on the *** filler measured across three colleges', () => {
    const result = assessAddress({ ...CLEAN, street: '***', taluk: '***', district: '***' });
    expect(result.issues).toContain('placeholder_text');
  });

  it.each(['NA', 'n.a.', 'Nil', '-', 'XXXX', 'null'])('fires on the filler %s', (filler) => {
    expect(detectAddressIssues({ ...CLEAN, taluk: filler })).toContain('placeholder_text');
  });

  it('does not fire on a short but genuine value', () => {
    expect(detectAddressIssues({ ...CLEAN, taluk: 'Erode' })).not.toContain('placeholder_text');
  });
});

describe('ekyc_labels', () => {
  it('fires on a pasted Aadhaar block with VTC / PO / DISTRICT labels', () => {
    const result = assessAddress({
      street:
        'No 2/124, Koothadiyur, VTC: Bhavani, PO: Sembulichampalayam, DISTRICT: Erode, STATE: Tamil Nadu, PIN CODE: 638501',
      taluk: 'Bhavani',
      district: 'Erode',
      state: 'Tamil Nadu',
      pinCode: '638501',
    });
    expect(result.issues).toContain('ekyc_labels');
    expect(needsHumanDecision(result)).toBe(true);
  });

  it('does not fire on a street that merely names a district', () => {
    expect(detectAddressIssues({ ...CLEAN, street: 'Erode Main Road' })).not.toContain('ekyc_labels');
  });
});

describe('junk_characters', () => {
  it('fires on line breaks pasted into the street', () => {
    expect(
      detectAddressIssues({ ...CLEAN, street: '4/358,\nAadhidravidar Street,\nKaliyanoor (PO)' })
    ).toContain('junk_characters');
  });

  it('fires on a literal backslash-n that survived an import', () => {
    expect(detectAddressIssues({ ...CLEAN, taluk: 'Ve \\n nganur Post' })).toContain('junk_characters');
  });

  it('fires on a stray quote mark left by a spreadsheet', () => {
    expect(detectAddressIssues({ ...CLEAN, street: '128/10, Kavery Nagar"' })).toContain(
      'junk_characters'
    );
  });

  it('fires on the invisible spaces a paste from Word leaves behind', () => {
    // Built with fromCharCode rather than pasted: an invisible literal in a
    // fixture silently decays into a plain space during an edit, and the test
    // then passes while asserting nothing. That happened once writing this file.
    const nonBreaking = String.fromCharCode(0x00a0);
    const zeroWidth = String.fromCharCode(0x200b);
    expect(detectAddressIssues({ ...CLEAN, street: `12 Bharathi${nonBreaking}Street` })).toContain(
      'junk_characters'
    );
    expect(detectAddressIssues({ ...CLEAN, street: `12 Bharathi${zeroWidth}Street` })).toContain(
      'junk_characters'
    );
  });

  it('does not fire on ordinary punctuation', () => {
    expect(detectAddressIssues({ ...CLEAN, street: "12, St. Mary's Street (North)" })).not.toContain(
      'junk_characters'
    );
  });
});

describe('machine_code_value', () => {
  it('fires on an internal code stored where a readable name belongs', () => {
    const result = assessAddress({
      street: 'Annai Sathya Nagar',
      taluk: 'erode_taluk',
      district: 'namakkal',
      state: 'tamil_nadu',
      pinCode: '638183',
    });
    expect(result.issues).toContain('machine_code_value');
  });

  it('does not fire on a lowercase but readable name', () => {
    expect(detectAddressIssues({ ...CLEAN, district: 'namakkal' })).not.toContain(
      'machine_code_value'
    );
  });
});

describe('duplicated_part', () => {
  it('fires when the street already carries the district and taluk', () => {
    const result = assessAddress({
      street: '34 H2, Somasundara Puram 2nd Street, Bhavani, Namakkal',
      taluk: 'Namakkal',
      district: 'Namakkal',
      state: 'Tamil Nadu',
      pinCode: '638301',
    });
    expect(result.issues).toContain('duplicated_part');
    expect(result.duplicatedParts).toContain('district');
  });

  it('sees the district even when a digit is glued to it', () => {
    const result = assessAddress({ ...CLEAN, street: '11/16 Kattusothan Valavu, Namakkal-638183' });
    expect(result.duplicatedParts).toContain('district');
    expect(result.duplicatedParts).toContain('PIN code');
  });

  it('does not fire when the street shares only a fragment of the name', () => {
    // "Nama" is a prefix of "Namakkal" but not the whole word.
    expect(assessAddress({ ...CLEAN, street: 'Nama Nagar' }).duplicatedParts).toEqual([]);
  });

  it('never matches on a part shorter than four characters', () => {
    expect(assessAddress({ ...CLEAN, taluk: 'Ooty', district: 'Ute' }).duplicatedParts).toEqual([]);
  });
});

describe('over_printable_length', () => {
  it('fires past the tighter default-back cut and flags both limits', () => {
    const long = assessAddress({
      street: 'No 2/124, Koothadiyur, A. Sempulichampalayam, Bhavani Taluk, Sembulichampalayam Post',
      taluk: 'Bhavani',
      district: 'Erode',
      state: 'Tamil Nadu',
      pinCode: '638501',
    });
    expect(long.length).toBeGreaterThan(PRINTABLE_ADDRESS_CUSTOM_BACK_MAX);
    expect(long.issues).toContain('over_printable_length');
    expect(long.overDefaultBack).toBe(true);
    expect(long.overCustomBack).toBe(true);
  });

  it('reports but does NOT raise an issue for the tighter default-back cut', () => {
    // 86.9% of active learners are over 60 characters, because a correctly
    // entered address simply is. Raising an issue on that would bury the
    // records a person actually has to fix, so the band between the two limits
    // is reported as a flag and nothing more.
    const result = assessAddress(CLEAN);
    expect(result.length).toBeGreaterThan(PRINTABLE_ADDRESS_DEFAULT_BACK_MAX);
    expect(result.length).toBeLessThanOrEqual(PRINTABLE_ADDRESS_CUSTOM_BACK_MAX);
    expect(result.overDefaultBack).toBe(true);
    expect(result.overCustomBack).toBe(false);
    expect(result.issues).not.toContain('over_printable_length');
    expect(result.severity).toBeNull();
  });

  it('does not fire on a short address', () => {
    expect(detectAddressIssues({ street: '12 Bharathi Street', pinCode: '638183' })).not.toContain(
      'over_printable_length'
    );
  });
});

describe('truncated_end', () => {
  it('fires when the street was saved half-finished', () => {
    expect(
      detectAddressIssues({ ...CLEAN, street: '26, Nandhavanam St, Tiruchengode, Mallasamuthiram,' })
    ).toContain('truncated_end');
  });

  it('does not fire on a street that ends in a word or a bracket', () => {
    expect(detectAddressIssues({ ...CLEAN, street: '4/110 Chittoor (Edappadi)' })).not.toContain(
      'truncated_end'
    );
  });
});

describe('ranking', () => {
  it('puts the worst record first and reports its worst severity', () => {
    const conflicted = assessAddress({
      street: 'No 65, MC Road, Ambur, 635814 MOBILE: 9000000001',
      taluk: 'Dharmapuri',
      district: 'Dharmapuri',
      state: 'Tamil Nadu',
      pinCode: '636701',
    });
    const merelyLong = assessAddress({
      street: 'No 2/124, Koothadiyur, A. Sempulichampalayam, Bhavani Taluk, Sembulichampalayam Post',
      taluk: 'Bhavani',
      district: 'Erode',
      state: 'Tamil Nadu',
      pinCode: '638501',
    });
    expect(conflicted.score).toBeGreaterThan(merelyLong.score);
    expect(conflicted.severity).toBe('critical');
    expect(merelyLong.severity).toBe('medium');
    expect(needsHumanDecision(merelyLong)).toBe(false);
    // Issues come back worst-first so a badge row reads top-down.
    expect(conflicted.issues[0]).toBe('pin_conflict');
  });

  it('gives every issue code a label, a reason and a fix', () => {
    for (const [code, meta] of Object.entries(ADDRESS_ISSUE_META)) {
      expect(meta.label.length, code).toBeGreaterThan(0);
      expect(meta.why.length, code).toBeGreaterThan(20);
      expect(meta.fix.length, code).toBeGreaterThan(20);
      expect(meta.weight, code).toBeGreaterThan(0);
    }
  });
});

describe('drift guard against the renderer', () => {
  const read = (relative: string) =>
    fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

  it('still joins the same five columns in the same order as render-data.ts', () => {
    const source = read('lib/id-cards/render-data.ts');
    const block = source.slice(source.indexOf('address ='), source.indexOf('contactPhone ='));
    expect(block.length).toBeGreaterThan(0);
    const order = [
      'permanent_address_street',
      'permanent_address_taluk',
      'permanent_address_district',
      'permanent_address_state',
      'permanent_address_pin_code',
    ];
    let cursor = -1;
    for (const column of order) {
      const at = block.indexOf(column);
      expect(at, `${column} missing from the renderer join`).toBeGreaterThan(cursor);
      cursor = at;
    }
    expect(block).toContain(".join(', ')");
  });

  it('still cuts the address at the two widths this module warns on', () => {
    const source = read('lib/id-cards/render-card.tsx');
    // The default back's ADDRESS row goes through backInfoRow.
    expect(source).toContain(`truncateForCard(value, ${PRINTABLE_ADDRESS_DEFAULT_BACK_MAX})`);
    // A template-designed back places it as a free overlay element.
    expect(source).toContain(`truncateForCard(value, ${PRINTABLE_ADDRESS_CUSTOM_BACK_MAX})`);
  });
});
