/**
 * The register pays the pay IN FORCE ON THE 1st of its month (Director,
 * 1 Oct 2026): "the payslip for a month uses the pay in force on the 1st of
 * that month; a raise from 17 Oct shows from the November payslip".
 *
 * Until 2026-10-09 the register asked hr_staff_salaries_in_force for the
 * month's LAST day, so a raise from the 17th was paid for the whole month.
 *
 * The database function is not changed: it takes the date as an argument.
 * This stand-in implements its walk (20271006100000: back along superseded_by
 * past rows that start after the date; a row with no start is in force) over
 * an in-memory table, and records every date the register asks for.
 *
 * Run: npx vitest run __tests__/hr/salary-register-pay-on-the-1st.test.ts
 */
import { describe, expect, it } from 'vitest';

import {
  SalaryRegisterService,
  registerMonthStart,
} from '@/lib/services/hr/payroll/salary-register-service';

type Sal = {
  id: string;
  staff_id: string;
  monthly_gross: number;
  effective_from: string | null;
  superseded_by: string | null;
};

/** hr_staff_salaries_in_force(p_staff_ids, p_on), as 20271006100000 defines it. */
function inForce(rows: Sal[], ids: string[], on: string) {
  const out: Array<Record<string, unknown>> = [];
  for (const staff of ids) {
    let cur = rows.find((r) => r.staff_id === staff && r.superseded_by === null);
    let depth = 0;
    while (cur && cur.effective_from !== null && cur.effective_from > on && depth < 100) {
      const id: string = cur.id;
      cur = rows.find((r) => r.superseded_by === id);
      depth += 1;
    }
    if (cur && (cur.effective_from === null || cur.effective_from <= on)) {
      out.push({
        id: cur.id,
        staff_id: cur.staff_id,
        monthly_gross: String(cur.monthly_gross),
        effective_from: cur.effective_from,
        eligible_for_pf: false,
        epf_amount: null,
        eligible_for_esi: false,
        esi_amount: null,
        allowance_amount: null,
      });
    }
  }
  return out;
}

function client(rows: Sal[]) {
  const asked: string[] = [];
  const supabase: any = {
    from: () => {
      // hr_tds_slabs: one band, nil tax, so the read is not "denied".
      const chain: any = {
        select: () => chain,
        order: () => chain,
        eq: () => chain,
        is: () => chain,
        then: (res: any, rej: any) =>
          Promise.resolve({
            data: [{ id: 'b1', min_monthly_gross: 0, max_monthly_gross: null, monthly_tds: 0 }],
            error: null,
          }).then(res, rej),
      };
      return chain;
    },
    rpc: async (name: string, args: any) => {
      if (name === 'hr_staff_salaries_in_force') {
        asked.push(args.p_on);
        return { data: inForce(rows, args.p_staff_ids, args.p_on), error: null };
      }
      return { data: true, error: null };
    },
  };
  return { supabase, asked };
}

const pay = async (rows: Sal[], ids: string[], year: number, month: number) => {
  const { supabase, asked } = client(rows);
  const { salaryByStaff } = await (SalaryRegisterService as any).loadPayInForce(
    supabase,
    ids,
    year,
    month,
  );
  return { salaryByStaff: salaryByStaff as Map<string, number>, asked };
};

// Staff A: 30000 from 1 Sep, raised to 35000 from 17 Oct.
const RAISE_FROM_17TH: Sal[] = [
  { id: 'a1', staff_id: 'A', monthly_gross: 30000, effective_from: '2026-09-01', superseded_by: 'a2' },
  { id: 'a2', staff_id: 'A', monthly_gross: 35000, effective_from: '2026-10-17', superseded_by: null },
];
// Staff B: 40000 from 1 Sep, raised to 44000 from 1 Oct.
const RAISE_FROM_1ST: Sal[] = [
  { id: 'b1', staff_id: 'B', monthly_gross: 40000, effective_from: '2026-09-01', superseded_by: 'b2' },
  { id: 'b2', staff_id: 'B', monthly_gross: 44000, effective_from: '2026-10-01', superseded_by: null },
];

describe('the register month date', () => {
  it('is the 1st of the month', () => {
    expect(registerMonthStart(2026, 10)).toBe('2026-10-01');
    expect(registerMonthStart(2026, 1)).toBe('2026-01-01');
    expect(registerMonthStart(2026, 12)).toBe('2026-12-01');
  });
});

describe('the register pays the pay in force on the 1st', () => {
  it('a raise from the 17th is NOT in that month’s register', async () => {
    const { salaryByStaff, asked } = await pay(RAISE_FROM_17TH, ['A'], 2026, 10);
    expect(salaryByStaff.get('A')).toBe(30000);
    expect(asked).toEqual(['2026-10-01']);
  });

  it('a raise from the 17th IS in the next month’s register', async () => {
    const { salaryByStaff } = await pay(RAISE_FROM_17TH, ['A'], 2026, 11);
    expect(salaryByStaff.get('A')).toBe(35000);
  });

  it('a raise from the 1st IS in that month’s register', async () => {
    const { salaryByStaff } = await pay(RAISE_FROM_1ST, ['B'], 2026, 10);
    expect(salaryByStaff.get('B')).toBe(44000);
  });

  it('a salary with no start date is paid every month', async () => {
    const rows: Sal[] = [
      { id: 'c1', staff_id: 'C', monthly_gross: 20000, effective_from: null, superseded_by: null },
    ];
    const { salaryByStaff, asked } = await pay(rows, ['C'], 2026, 10);
    expect(salaryByStaff.get('C')).toBe(20000);
    expect(asked).toEqual(['2026-10-01']);
  });
});

describe('a new joiner whose first pay starts mid-month', () => {
  const JOINER: Sal[] = [
    { id: 'd1', staff_id: 'D', monthly_gross: 18000, effective_from: '2026-10-17', superseded_by: null },
  ];

  it('is not dropped: nothing is in force on the 1st, so the month’s last day is read for them alone', async () => {
    const { salaryByStaff, asked } = await pay(JOINER.concat(RAISE_FROM_17TH), ['A', 'D'], 2026, 10);
    expect(salaryByStaff.get('D')).toBe(18000);
    // A is still paid the old rate: the second read is for D only.
    expect(salaryByStaff.get('A')).toBe(30000);
    expect(asked).toEqual(['2026-10-01', '2026-10-31']);
  });

  it('someone with no salary at all stays out of the pay map', async () => {
    const { salaryByStaff } = await pay(RAISE_FROM_17TH, ['A', 'E'], 2026, 10);
    expect(salaryByStaff.has('E')).toBe(false);
  });
});
