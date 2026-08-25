import { describe, it, expect } from 'vitest';
import { linesNotAlreadyInNote } from '@/app/api/contacts/card-scan/save/route';

// ---------------------------------------------------------------------------
// Networker's PATCH /api/contacts/ingest APPENDS what it is sent:
//   patch.notes = `${existing.notes}\n\n${body.notes.trim()}`
// …so that handwritten scribbles accumulate across cards. The save route
// rebuilds the WHOLE extra-lines block on every scan, so without filtering, a
// second card from the same person re-sends lines the note already carries.
//
// The fixture below is the REAL production note as it stood on 2026-08-06:
// contact b1fc9329 (N.THIRUKKUMARAN) had been enriched twice and carried
// "Who: Industry partner" twice. Copied verbatim rather than invented, so the
// test is anchored to the defect that actually happened.
// ---------------------------------------------------------------------------
const PRODUCTION_NOTE_AFTER_FIRST_SCAN = [
  '[Scanned in MyJKKN by director@jkkn.ac.in on 2026-08-05]',
  '',
  'Also on: 91-421-6613666',
  'Who: Industry partner',
].join('\n');

describe('linesNotAlreadyInNote', () => {
  it('sends nothing when a re-scan repeats lines the note already carries', () => {
    const secondScan = ['Also on: 91-421-6613666', 'Who: Industry partner'];

    expect(linesNotAlreadyInNote(secondScan, PRODUCTION_NOTE_AFTER_FIRST_SCAN)).toEqual([]);
  });

  it('keeps the genuinely new line and drops only the repeat', () => {
    const secondScan = [
      'Also on: 91-421-6613666', // already there
      'Also at: thirukkumaran@essteeexports.com', // new — a second email on the new card
      'Who: Industry partner', // already there
    ];

    expect(linesNotAlreadyInNote(secondScan, PRODUCTION_NOTE_AFTER_FIRST_SCAN)).toEqual([
      'Also at: thirukkumaran@essteeexports.com',
    ]);
  });

  it('passes everything through for a contact whose note is empty', () => {
    const lines = ['Also on: 91-421-6613666', 'Who: Industry partner'];

    expect(linesNotAlreadyInNote(lines, null)).toEqual(lines);
    expect(linesNotAlreadyInNote(lines, '')).toEqual(lines);
  });

  it('treats a multi-line handwritten note as one entry, not four', () => {
    // A handwritten note is pushed as a SINGLE extraLines entry that happens to
    // contain newlines. Comparing whole strings would re-append it every time,
    // because the stored note has it split across lines.
    const handwritten = 'Met at the Coimbatore expo.\nWants a quote for 200 units.';
    const note = ['Who: Supplier', ...handwritten.split('\n')].join('\n');

    expect(linesNotAlreadyInNote([handwritten], note)).toEqual([]);
    expect(linesNotAlreadyInNote([handwritten, 'Who: Supplier'], note)).toEqual([]);
  });

  it('does not let one phone number suppress a longer one containing it', () => {
    // A substring test would wrongly drop the second line here. Comparison is
    // line-exact for exactly this reason.
    const note = 'Also on: 6613666';

    expect(linesNotAlreadyInNote(['Also on: 91-421-6613666'], note)).toEqual([
      'Also on: 91-421-6613666',
    ]);
  });

  it('ignores blank-line and whitespace differences between the two sides', () => {
    const note = '\n\n  Who: Industry partner  \n\n';

    expect(linesNotAlreadyInNote(['Who: Industry partner'], note)).toEqual([]);
  });
});
