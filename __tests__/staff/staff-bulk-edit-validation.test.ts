import { describe, it, expect } from 'vitest';
import {
  normaliseBiometricCode,
  validateStaffBulkEditRow,
  type ValidationContext,
  type ParsedStaffRow
} from '@/lib/services/staff/staff-bulk-edit-validation';

const STAFF_ID = 'c6e43a58-477f-4c5a-bde8-68e4dd63ae7d';
const INST_ID = 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5';
const OTHER_STAFF_ID = '481e97c2-1f44-4efb-9338-7c057618ba1e';

function ctx(over: Partial<ValidationContext> = {}): ValidationContext {
  return {
    staffByEmail: new Map([
      ['abdulnazeer_m@jkkn.ac.in', {
        id: STAFF_ID,
        institution_id: INST_ID,
        institution_email: 'abdulnazeer_m@jkkn.ac.in',
        phone: '9876543210',
        gender: 'male',
        staff_id: 'COP083',
        email: 'nazeer@gmail.com',
        biometric_id: null,
        biometric_institution_id: null
      }]
    ]),
    departmentsByInstitution: new Map([[INST_ID, new Map([['pharmacy practice', 'dept-1']])]]),
    categoriesByName: new Map([['assistant professor', 'cat-1']]),
    institutionsByName: new Map([['jkkn dental college and hospital', INST_ID]]),
    emailOwner: new Map([['taken@jkkn.ac.in', OTHER_STAFF_ID]]),
    staffIdOwner: new Map([['cop999', OTHER_STAFF_ID]]),
    biometricOwner: new Map([[`${INST_ID}|2`, OTHER_STAFF_ID]]),
    ...over
  };
}

function row(cells: Record<string, string>, rowNumber = 2): ParsedStaffRow {
  return { rowNumber, institutionEmail: 'abdulnazeer_m@jkkn.ac.in', cells };
}

describe('normaliseBiometricCode', () => {
  it('collapses leading zeros like fn_norm_biometric_code', () => {
    expect(normaliseBiometricCode('00002')).toBe('2');
    expect(normaliseBiometricCode('002')).toBe('2');
    expect(normaliseBiometricCode('2')).toBe('2');
  });
  it('uppercases a non-numeric code', () => {
    expect(normaliseBiometricCode(' cas140 ')).toBe('CAS140');
  });
  it('treats blank as absent', () => {
    expect(normaliseBiometricCode('   ')).toBeNull();
    expect(normaliseBiometricCode(null)).toBeNull();
  });
  it('does not numerically collapse a 19-digit code', () => {
    const long = '1'.repeat(19);
    expect(normaliseBiometricCode(long)).toBe(long);
  });
});

describe('validateStaffBulkEditRow', () => {
  it('accepts a clean phone change and produces one update', () => {
    const r = validateStaffBulkEditRow(row({ Phone: '9000000001' }), ctx(), new Set());
    expect(r.issues).toEqual([]);
    expect(r.updates).toEqual({ phone: '9000000001' });
  });

  it('treats a blank cell as no change', () => {
    const r = validateStaffBulkEditRow(row({ Phone: '   ' }), ctx(), new Set());
    expect(r.issues).toEqual([]);
    expect(r.updates).toEqual({});
  });

  it('ignores a value identical to the stored one', () => {
    const r = validateStaffBulkEditRow(row({ Phone: '9876543210' }), ctx(), new Set());
    expect(r.updates).toEqual({});
  });

  it('lowercases an enum given in the wrong case', () => {
    const r = validateStaffBulkEditRow(row({ Gender: ' Female ' }), ctx(), new Set());
    expect(r.issues).toEqual([]);
    expect(r.updates).toEqual({ gender: 'female' });
  });

  it('rejects a value outside the vocabulary as a format issue', () => {
    const r = validateStaffBulkEditRow(row({ Gender: 'unknown' }), ctx(), new Set());
    expect(r.issues[0]).toMatchObject({ field: 'Gender', kind: 'format' });
  });

  it('rejects a malformed email as a format issue', () => {
    const r = validateStaffBulkEditRow(row({ 'Personal Email': 'not-an-email' }), ctx(), new Set());
    expect(r.issues[0]).toMatchObject({ field: 'Personal Email', kind: 'format' });
  });

  it('rejects a pincode that is not 6 digits', () => {
    const r = validateStaffBulkEditRow(row({ Pincode: '1234' }), ctx(), new Set());
    expect(r.issues[0]).toMatchObject({ field: 'Pincode', kind: 'format' });
  });

  it('reports an unmatched institution email as a record issue', () => {
    const r = validateStaffBulkEditRow(
      { rowNumber: 2, institutionEmail: 'ghost@jkkn.ac.in', cells: { Phone: '9000000001' } },
      ctx(),
      new Set()
    );
    expect(r.issues[0]).toMatchObject({ kind: 'record' });
    expect(r.issues[0].message).toMatch(/not found/i);
  });

  it('reports a duplicate institution email within the file', () => {
    const seen = new Set(['abdulnazeer_m@jkkn.ac.in']);
    const r = validateStaffBulkEditRow(row({ Phone: '9000000001' }), ctx(), seen);
    expect(r.issues[0]).toMatchObject({ kind: 'record' });
    expect(r.issues[0].message).toMatch(/more than once/i);
  });

  it('rejects a personal email already owned by someone else', () => {
    const r = validateStaffBulkEditRow(row({ 'Personal Email': 'taken@jkkn.ac.in' }), ctx(), new Set());
    expect(r.issues[0]).toMatchObject({ field: 'Personal Email', kind: 'record' });
  });

  it('rejects a staff id already owned by someone else', () => {
    const r = validateStaffBulkEditRow(row({ 'Staff ID (new)': 'COP999' }), ctx(), new Set());
    expect(r.issues[0]).toMatchObject({ field: 'Staff ID (new)', kind: 'record' });
  });

  it('resolves a department name within the institution', () => {
    const r = validateStaffBulkEditRow(row({ Department: ' Pharmacy Practice ' }), ctx(), new Set());
    expect(r.issues).toEqual([]);
    expect(r.updates).toEqual({ department_id: 'dept-1' });
  });

  it('reports an unknown department as a record issue', () => {
    const r = validateStaffBulkEditRow(row({ Department: 'Astrology' }), ctx(), new Set());
    expect(r.issues[0]).toMatchObject({ field: 'Department', kind: 'record' });
  });

  it('rejects a biometric code with no machine (staff_biometric_scope_chk)', () => {
    const r = validateStaffBulkEditRow(row({ 'Biometric Code': '00002' }), ctx(), new Set());
    expect(r.issues[0]).toMatchObject({ field: 'Biometric Code', kind: 'format' });
  });

  it('rejects a biometric code already held on that machine, comparing normalised', () => {
    const r = validateStaffBulkEditRow(
      row({ 'Biometric Code': '002', 'Biometric Machine': 'JKKN Dental College and Hospital' }),
      ctx(),
      new Set()
    );
    expect(r.issues[0]).toMatchObject({ field: 'Biometric Code', kind: 'record' });
  });

  it('accepts a free biometric code with its machine', () => {
    const r = validateStaffBulkEditRow(
      row({ 'Biometric Code': '00007', 'Biometric Machine': 'JKKN Dental College and Hospital' }),
      ctx(),
      new Set()
    );
    expect(r.issues).toEqual([]);
    expect(r.updates).toEqual({ biometric_id: '00007', biometric_institution_id: INST_ID });
  });

  it('reports an unknown machine as a record issue', () => {
    const r = validateStaffBulkEditRow(
      row({ 'Biometric Code': '7', 'Biometric Machine': 'Hogwarts' }),
      ctx(),
      new Set()
    );
    expect(r.issues.some(i => i.field === 'Biometric Machine' && i.kind === 'record')).toBe(true);
  });

  it('never writes through a locked column', () => {
    const r = validateStaffBulkEditRow(
      row({ Institution: 'Some Other College', Name: 'Hacked', 'Staff ID (current)': 'XXX' }),
      ctx(),
      new Set()
    );
    expect(r.updates).toEqual({});
    expect(r.issues).toEqual([]);
  });
});

// ── Biometric pair: cases beyond the brief's 22 ─────────────────────────────────────────
//
// The brief validated "Biometric Code" and "Biometric Machine" as two independent columns.
// That misses two real cases once you consider the pair is coupled by BOTH a DB CHECK
// (staff_biometric_scope_chk: code needs a machine) and a UNIQUE index (staff_biometric_uq:
// machine + normalised code). These tests pin down the fix in
// lib/services/staff/staff-bulk-edit-validation.ts.
describe('validateStaffBulkEditRow — biometric pair, machine already on file', () => {
  const SECOND_INST_ID = '9a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9';

  function ctxWithExistingBiometric(over: Partial<ValidationContext> = {}): ValidationContext {
    return ctx({
      staffByEmail: new Map([
        ['abdulnazeer_m@jkkn.ac.in', {
          id: STAFF_ID,
          institution_id: INST_ID,
          institution_email: 'abdulnazeer_m@jkkn.ac.in',
          phone: '9876543210',
          gender: 'male',
          staff_id: 'COP083',
          email: 'nazeer@gmail.com',
          // this person already has a machine on file — the brief's per-column check
          // did not consult this before flagging any code-only edit as "needs a machine"
          biometric_id: '9',
          biometric_institution_id: INST_ID
        }]
      ]),
      institutionsByName: new Map([
        ['jkkn dental college and hospital', INST_ID],
        ['jkkn engineering college', SECOND_INST_ID]
      ]),
      ...over
    });
  }

  it('changes only the code, leaving Biometric Machine blank, using the machine already on file (no false pair-format issue)', () => {
    const r = validateStaffBulkEditRow(row({ 'Biometric Code': '00007' }), ctxWithExistingBiometric(), new Set());
    expect(r.issues).toEqual([]);
    expect(r.updates).toEqual({ biometric_id: '00007' });
  });

  it('still catches a clash on the existing code when only Biometric Machine changes and the code cell is left blank', () => {
    const c = ctxWithExistingBiometric({
      // someone else already holds code "9" on the machine this row is moving to
      biometricOwner: new Map([[`${SECOND_INST_ID}|9`, OTHER_STAFF_ID]])
    });
    const r = validateStaffBulkEditRow(row({ 'Biometric Machine': 'JKKN Engineering College' }), c, new Set());
    expect(r.issues[0]).toMatchObject({ field: 'Biometric Code', kind: 'record' });
    expect(r.updates).toEqual({});
  });

  it('moves only the machine when the destination has no clash, keeping the existing code implicitly', () => {
    const r = validateStaffBulkEditRow(
      row({ 'Biometric Machine': 'JKKN Engineering College' }),
      ctxWithExistingBiometric(),
      new Set()
    );
    expect(r.issues).toEqual([]);
    expect(r.updates).toEqual({ biometric_institution_id: SECOND_INST_ID });
  });
});
