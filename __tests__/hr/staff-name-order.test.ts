/**
 * Salary register S.No order — alphabetical by name, titles ignored.
 *
 * The same key is mirrored in SQL (migration
 * 20271007140000_hr_salary_register_serial_by_name), so these cases pin the
 * behaviour both sides must share.
 *
 * Run: npx vitest run __tests__/hr/staff-name-order.test.ts
 */

import { describe, expect, it } from 'vitest';
import { compareStaffByName, staffNameSortKey } from '@/lib/hr/payroll/staff-name-order';

const person = (staff_name: string, employee_code: string | null = null, staff_id = staff_name) => ({
  staff_name,
  employee_code,
  staff_id,
});

const order = (names: ReturnType<typeof person>[]) =>
  [...names].sort(compareStaffByName).map((p) => p.staff_name);

describe('staffNameSortKey', () => {
  it.each([
    ['DR. ARUN M S', 'ARUN M S'],
    ['MRS. DEVI P', 'DEVI P'],
    ['MR. VENKATESWARAN V', 'VENKATESWARAN V'],
    ['MISS. THENMOZHI V', 'THENMOZHI V'],
    ['Dr Kishor Kumar V', 'KISHOR KUMAR V'],
    ['PROF. DR. SEKAR V', 'SEKAR V'],
    ['DEVI.P', 'DEVI P'],
    ['  GIRIDHARAN  P ', 'GIRIDHARAN P'],
  ])('%s -> %s', (name, key) => {
    expect(staffNameSortKey(name)).toBe(key);
  });

  it('keeps letters that merely look like a title', () => {
    expect(staffNameSortKey('MSARAVANAN K')).toBe('MSARAVANAN K');
    expect(staffNameSortKey('DRAVID R')).toBe('DRAVID R');
    expect(staffNameSortKey('MISSAL A')).toBe('MISSAL A');
  });

  it('keeps a name that is nothing but a title', () => {
    expect(staffNameSortKey('DR.')).toBe('DR');
  });
});

describe('compareStaffByName', () => {
  it('orders by name with titles ignored', () => {
    expect(
      order([
        person('MR. VENKATESWARAN V', 'COP005'),
        person('DR. SEKAR V', 'COP003'),
        person('MISS. THENMOZHI V', 'COP007'),
        person('DR. KISHOR KUMAR V', 'COP006'),
        person('MRS. DEVI P', 'COP004'),
        person('DR. ARUN M S', 'COP008'),
      ]),
    ).toEqual([
      'DR. ARUN M S',
      'MRS. DEVI P',
      'DR. KISHOR KUMAR V',
      'DR. SEKAR V',
      'MISS. THENMOZHI V',
      'MR. VENKATESWARAN V',
    ]);
  });

  it('breaks a name tie on the full name, then employee code with missing codes last', () => {
    expect(order([person('DR. ARUN K'), person('ARUN K')])).toEqual(['ARUN K', 'DR. ARUN K']);

    const a = person('RAVI S', 'COP020', 'id-a');
    const b = person('RAVI S', 'COP010', 'id-b');
    const c = person('RAVI S', null, 'id-c');
    expect([c, a, b].sort(compareStaffByName).map((p) => p.staff_id)).toEqual(['id-b', 'id-a', 'id-c']);
  });

  it('is case-insensitive', () => {
    expect(order([person('banu R'), person('ANITHA S')])).toEqual(['ANITHA S', 'banu R']);
  });
});
