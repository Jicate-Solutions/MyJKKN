/**
 * Salary register — the arithmetic that decides what people are paid.
 *
 * THE EXPECTED FIGURES ARE NOT INVENTED. Every case in "matches the hand-kept
 * register" takes its inputs and its expected deduction from real rows of
 * "6. Salary Register EDITED (1).xlsx", and every deduction matches that file
 * to the paisa.
 *
 * The expected NET PAY is the computed figure, which for four of those rows is
 * deliberately NOT what the spreadsheet shows: PRISKALA's file value of 12954
 * is 13636 minus a hand-written 682 ("may month cpl issue one day salary
 * deducted"), and POOJA's 25454 is 27045 minus one day. Those are prior-month
 * recoveries, and they are the reason adjustment_amount exists — they are
 * applied on top of this function, not inside it.
 *
 * Run: npx vitest run __tests__/hr/salary-register-line.test.ts
 */

import { describe, expect, it } from 'vitest';
import {
  computeRegisterLine,
  registerBasisFor,
  ZERO_FIGURES,
  type AttendanceSummaryRow,
} from '@/lib/services/hr/payroll/salary-register-service';

type Summary = Parameters<typeof computeRegisterLine>[0]['summary'];

function summary(o: Partial<AttendanceSummaryRow>): Summary {
  return {
    present_days: 0,
    leave_days: 0,
    on_duty_days: 0,
    comp_off_days: 0,
    payable_days: 0,
    leave_by_type: {},
    ...o,
  } as Summary;
}

describe('computeRegisterLine — matches the hand-kept register', () => {
  // gross, basis, present, leave, onDuty, payable, expected deduction, expected net
  const CASES: Array<[string, number, number, number, number, number, number, number, number]> = [
    // MANIKANDAN P — 1 paid leave, 2 on duty, 1 day unpaid
    ['MANIKANDAN P', 15000, 22, 18, 1, 2, 21, 681.82, 14318],
    // PRISKALA M — 2 days unpaid
    ['PRISKALA M', 15000, 22, 19, 1, 0, 20, 1363.64, 13636],
    // SHANTHINI B — 6 days unpaid
    ['SHANTHINI B', 16000, 22, 15, 1, 0, 16, 4363.64, 11636],
    // POOJA S — 5 days unpaid on a higher salary
    ['POOJA S', 35000, 22, 16, 1, 0, 17, 7954.55, 27045],
    // HARINI E — half-days in play (1.5 paid leave, 15.5 worked)
    ['HARINI E', 15000, 22, 15.5, 1.5, 0, 17, 3409.09, 11591],
    // POOMIGA G — 3 days unpaid
    ['POOMIGA G', 15000, 22, 18, 1, 0, 19, 2045.45, 12955],
  ];

  it.each(CASES)(
    '%s',
    (_name, gross, basis, present, leave, onDuty, payable, expectedDeduction, expectedNet) => {
      const r = computeRegisterLine({
        monthlyGross: gross,
        workingDaysBasis: basis,
        summary: summary({
          present_days: present,
          leave_days: leave,
          on_duty_days: onDuty,
          payable_days: payable,
        }),
      });

      expect(r.unpaid_leave_deduction).toBe(expectedDeduction);
      expect(r.net_pay).toBe(expectedNet);
      expect(r.total_earnings).toBe(gross);
    },
  );

  it('satisfies the register identities on every one of those rows', () => {
    for (const [, gross, basis, present, leave, onDuty, payable] of CASES) {
      const r = computeRegisterLine({
        monthlyGross: gross,
        workingDaysBasis: basis,
        summary: summary({
          present_days: present,
          leave_days: leave,
          on_duty_days: onDuty,
          payable_days: payable,
        }),
      });

      expect(r.paid_days).toBe(r.business_working_days - r.unpaid_leave_days);
      expect(r.paid_days).toBe(r.worked_days + r.paid_leave_days + r.on_duty_days);
      expect(r.worked_days).toBe(
        r.business_working_days - r.paid_leave_days - r.unpaid_leave_days - r.on_duty_days,
      );
    }
  });
});

describe('computeRegisterLine — full month', () => {
  it('deducts nothing and pays the whole gross', () => {
    const r = computeRegisterLine({
      monthlyGross: 17700,
      workingDaysBasis: 22,
      summary: summary({ present_days: 20, leave_days: 1, on_duty_days: 1, payable_days: 22 }),
    });

    expect(r.unpaid_leave_days).toBe(0);
    expect(r.unpaid_leave_deduction).toBe(0);
    expect(r.net_pay).toBe(17700);
  });
});

describe('computeRegisterLine — a mid-month joiner is pro-rated', () => {
  /**
   * THE REGRESSION THIS GUARDS. Sourcing unpaid days from the summary's
   * lop_days paid a mid-month joiner a FULL month: they have no attendance
   * records before their start date, so those days are not "loss of pay" — they
   * simply do not exist, and lop_days is 0.
   */
  it('pays 10 of 22 days for someone who started mid-month', () => {
    const r = computeRegisterLine({
      monthlyGross: 22000,
      workingDaysBasis: 22,
      // Present for all 10 working days they existed for. lop_days would be 0.
      summary: summary({ present_days: 10, payable_days: 10 }),
    });

    expect(r.unpaid_leave_days).toBe(12);
    expect(r.unpaid_leave_deduction).toBe(12000);
    expect(r.net_pay).toBe(10000);
  });
});

describe('computeRegisterLine — column placement', () => {
  it('moves OD- and CD-typed leave into the On Duty column', () => {
    const r = computeRegisterLine({
      monthlyGross: 20000,
      workingDaysBasis: 20,
      summary: summary({
        present_days: 15,
        // 3 leave days, of which 2 are really duty (1 OD + 1 CD).
        leave_days: 3,
        leave_by_type: { CL: 1, OD: 1, CD: 1 },
        on_duty_days: 2,
        payable_days: 20,
      }),
    });

    expect(r.paid_leave_days).toBe(1); // only the CL
    expect(r.on_duty_days).toBe(4); // 2 status + 2 leave-typed
    // Reclassifying between two PAID columns must not move money.
    expect(r.net_pay).toBe(20000);
  });

  it('counts comp-off as paid leave', () => {
    const r = computeRegisterLine({
      monthlyGross: 20000,
      workingDaysBasis: 20,
      summary: summary({ present_days: 17, comp_off_days: 3, payable_days: 20 }),
    });

    expect(r.paid_leave_days).toBe(3);
    expect(r.unpaid_leave_days).toBe(0);
    expect(r.net_pay).toBe(20000);
  });

  it('leaves "Clinical" leave in the paid-leave column', () => {
    const r = computeRegisterLine({
      monthlyGross: 20000,
      workingDaysBasis: 20,
      summary: summary({
        present_days: 18,
        leave_days: 2,
        leave_by_type: { Clinical: 2 },
        payable_days: 20,
      }),
    });

    expect(r.paid_leave_days).toBe(2);
    expect(r.on_duty_days).toBe(0);
  });
});

describe('computeRegisterLine — cross-institution edge cases', () => {
  it('never pays more than a full month when the work calendar is longer', () => {
    // Works a 6-day week (26 payable days) but is paid by a 5-day-week
    // institution whose month is 22 days.
    const r = computeRegisterLine({
      monthlyGross: 22000,
      workingDaysBasis: 22,
      summary: summary({ present_days: 26, payable_days: 26 }),
    });

    expect(r.paid_days).toBe(22);
    expect(r.unpaid_leave_days).toBe(0);
    expect(r.net_pay).toBe(22000);
  });

  it('does not divide by zero when a closed month reports no working days', () => {
    const r = computeRegisterLine({
      monthlyGross: 20000,
      workingDaysBasis: 0,
      summary: summary({ present_days: 0, payable_days: 0 }),
    });

    expect(Number.isFinite(r.unpaid_leave_deduction)).toBe(true);
    expect(r.unpaid_leave_deduction).toBe(0);
    expect(r.net_pay).toBe(20000);
  });
});

describe('ZERO_FIGURES — the excluded-row shape', () => {
  /**
   * THE BUG THIS LOCKS DOWN. A batch insert goes to PostgREST as ONE request,
   * and PostgREST sends an explicit NULL for any key an object in the batch
   * omits. An explicit NULL does not fall back to the column DEFAULT, so an
   * excluded row missing `business_working_days` failed the whole insert with
   * "violates not-null constraint" — and only ever on a register that had at
   * least one exclusion.
   *
   * If a new figure is added to computeRegisterLine and not to ZERO_FIGURES,
   * this fails here instead of in production on the first institution with a
   * salary gap.
   */
  it('covers exactly the keys a computed line produces', () => {
    const computed = computeRegisterLine({
      monthlyGross: 15000,
      workingDaysBasis: 22,
      summary: summary({ present_days: 20, payable_days: 22 }),
    });

    expect(Object.keys(ZERO_FIGURES).sort()).toEqual(Object.keys(computed).sort());
  });

  it('is all zeroes, so an excluded row carries no money', () => {
    for (const [key, value] of Object.entries(ZERO_FIGURES)) {
      expect(value, key).toBe(0);
    }
  });
});

describe('computeRegisterLine — EPF and ESI', () => {
  /**
   * DEDUCTED IN FULL, NEVER PRO-RATED. These are stored as a flat monthly rupee
   * figure per employee, so the number recorded is the number withheld — unlike
   * the unpaid-leave deduction beside it, which is day-rated by definition.
   */
  it('withholds the whole amount in a month with unpaid days', () => {
    const r = computeRegisterLine({
      monthlyGross: 26500,
      workingDaysBasis: 22,
      epfAmount: 1800,
      esiAmount: 165,
      // 16 paid days of 22 — six unpaid.
      summary: summary({ present_days: 16, payable_days: 16 }),
    });

    expect(r.unpaid_leave_days).toBe(6);
    expect(r.unpaid_leave_deduction).toBe(7227.27);
    // Not 1800 x 16/22. The stored figure is the withheld figure.
    expect(r.epf_deduction).toBe(1800);
    expect(r.esi_deduction).toBe(165);
    expect(r.total_deductions).toBe(9192.27);
    expect(r.net_pay).toBe(Math.round(26500 - 9192.27));
  });

  it('withholds nothing when no amounts are supplied', () => {
    const r = computeRegisterLine({
      monthlyGross: 26500,
      workingDaysBasis: 22,
      summary: summary({ present_days: 22, payable_days: 22 }),
    });

    expect(r.epf_deduction).toBe(0);
    expect(r.esi_deduction).toBe(0);
    // Unchanged from before the feature: total_deductions is the unpaid figure alone.
    expect(r.total_deductions).toBe(r.unpaid_leave_deduction);
    expect(r.net_pay).toBe(26500);
  });

  it('carries the pair into total_deductions on a full month', () => {
    const r = computeRegisterLine({
      monthlyGross: 30000,
      workingDaysBasis: 22,
      epfAmount: 1800,
      esiAmount: 225,
      summary: summary({ present_days: 22, payable_days: 22 }),
    });

    expect(r.unpaid_leave_deduction).toBe(0);
    expect(r.total_deductions).toBe(2025);
    expect(r.net_pay).toBe(27975);
    // The earnings side is untouched by a deduction.
    expect(r.total_earnings).toBe(30000);
  });

  /**
   * THE FLOOR. "Full amount always" and "zero paid days" together would net a
   * NEGATIVE figure — the register asking the employee to pay the institution.
   * The pair is capped at what survives the unpaid-leave deduction, EPF first.
   */
  it('never nets below zero when nothing was earned', () => {
    const r = computeRegisterLine({
      monthlyGross: 26500,
      workingDaysBasis: 22,
      epfAmount: 1800,
      esiAmount: 165,
      summary: summary({ present_days: 0, payable_days: 0 }),
    });

    expect(r.unpaid_leave_days).toBe(22);
    expect(r.unpaid_leave_deduction).toBe(26500);
    expect(r.epf_deduction).toBe(0);
    expect(r.esi_deduction).toBe(0);
    expect(r.net_pay).toBe(0);
  });

  it('takes EPF first when only part of the pair fits', () => {
    const r = computeRegisterLine({
      monthlyGross: 2200,
      workingDaysBasis: 22,
      epfAmount: 1800,
      esiAmount: 165,
      // 10 paid days of 22 leaves exactly 1000 to deduct from.
      summary: summary({ present_days: 10, payable_days: 10 }),
    });

    expect(r.unpaid_leave_deduction).toBe(1200);
    expect(r.epf_deduction).toBe(1000);
    expect(r.esi_deduction).toBe(0);
    expect(r.net_pay).toBe(0);
  });

  it('leaves the day-count identities untouched', () => {
    const r = computeRegisterLine({
      monthlyGross: 26500,
      workingDaysBasis: 22,
      epfAmount: 1800,
      esiAmount: 165,
      summary: summary({ present_days: 16, leave_days: 2, on_duty_days: 1, payable_days: 19 }),
    });

    expect(r.paid_days).toBe(r.business_working_days - r.unpaid_leave_days);
    expect(r.paid_days).toBe(r.worked_days + r.paid_leave_days + r.on_duty_days);
  });
});

describe('computeRegisterLine — allowance', () => {
  /**
   * THE ALLOWANCE IS PRO-RATED, unlike the flat statutory amounts beside it.
   * The day rate divides gross + allowance, so an absent day costs a slice of
   * both — which is the one behaviour that separates it from EPF/ESI/TDS.
   */
  it('pro-rates with the gross in a short month', () => {
    const r = computeRegisterLine({
      monthlyGross: 26500,
      allowance: 3000,
      workingDaysBasis: 22,
      summary: summary({ present_days: 16, payable_days: 16 }),
    });

    expect(r.total_earnings).toBe(29500);
    // 29,500 / 22 x 6 = 8,045.45 — NOT 26,500 / 22 x 6 = 7,227.27.
    expect(r.unpaid_leave_deduction).toBe(8045.45);
    expect(r.net_pay).toBe(Math.round(29500 - 8045.45));
  });

  it('separates basic pay from actual gross once an allowance exists', () => {
    const r = computeRegisterLine({
      monthlyGross: 26500,
      allowance: 3000,
      workingDaysBasis: 22,
      summary: summary({ present_days: 22, payable_days: 22 }),
    });

    // Before the allowance these two carried the same figure by definition.
    expect(r.basic_pay).toBe(26500);
    expect(r.allowance).toBe(3000);
    expect(r.actual_gross).toBe(29500);
    expect(r.net_pay).toBe(29500);
  });

  it('behaves exactly as before when there is no allowance', () => {
    const r = computeRegisterLine({
      monthlyGross: 26500,
      workingDaysBasis: 22,
      summary: summary({ present_days: 16, payable_days: 16 }),
    });

    expect(r.allowance).toBe(0);
    expect(r.unpaid_leave_deduction).toBe(7227.27);
    expect(r.basic_pay).toBe(r.actual_gross);
  });
});

describe('computeRegisterLine — TDS', () => {
  /**
   * THE RULE THE WHOLE FEATURE TURNS ON: TDS is computed on the monthly gross
   * ALONE. The caller resolves it from the bands against the gross, so an
   * allowance can never push somebody into a tax band or raise what they owe.
   */
  it('does not grow when an allowance is added', () => {
    const withoutAllowance = computeRegisterLine({
      monthlyGross: 150000,
      tdsAmount: 7500, // 5% of 150000
      workingDaysBasis: 22,
      summary: summary({ present_days: 22, payable_days: 22 }),
    });
    const withAllowance = computeRegisterLine({
      monthlyGross: 150000,
      allowance: 20000,
      tdsAmount: 7500, // resolved on the GROSS, so unchanged
      workingDaysBasis: 22,
      summary: summary({ present_days: 22, payable_days: 22 }),
    });

    expect(withoutAllowance.tds_deduction).toBe(7500);
    expect(withAllowance.tds_deduction).toBe(7500);
    // The allowance raises earnings and net pay, and nothing else.
    expect(withAllowance.total_earnings).toBe(170000);
    expect(withAllowance.net_pay).toBe(170000 - 7500);
  });

  it('withholds the full amount in a month with unpaid days', () => {
    const r = computeRegisterLine({
      monthlyGross: 150000,
      tdsAmount: 7500,
      workingDaysBasis: 22,
      summary: summary({ present_days: 16, payable_days: 16 }),
    });

    expect(r.unpaid_leave_deduction).toBe(40909.09);
    // Flat, not 7500 x 16/22.
    expect(r.tds_deduction).toBe(7500);
    expect(r.total_deductions).toBe(48409.09);
  });

  it('carries EPF, ESI and TDS together into total_deductions', () => {
    const r = computeRegisterLine({
      monthlyGross: 150000,
      allowance: 5000,
      epfAmount: 1800,
      esiAmount: 0,
      tdsAmount: 7500,
      workingDaysBasis: 22,
      summary: summary({ present_days: 22, payable_days: 22 }),
    });

    expect(r.total_earnings).toBe(155000);
    expect(r.total_deductions).toBe(9300);
    expect(r.net_pay).toBe(145700);
  });

  /**
   * THE CAP ORDER. EPF first, then ESI, then TDS — so a month with almost
   * nothing left drops the tax rather than the provident fund, and net_pay
   * still floors at zero instead of asking the employee to pay the institution.
   */
  it('drops TDS before EPF when there is not enough to go round', () => {
    const r = computeRegisterLine({
      monthlyGross: 22000,
      epfAmount: 1800,
      esiAmount: 165,
      tdsAmount: 1100,
      workingDaysBasis: 22,
      // 20 unpaid days of 22 leaves exactly 2,000 to deduct from.
      summary: summary({ present_days: 2, payable_days: 2 }),
    });

    expect(r.unpaid_leave_deduction).toBe(20000);
    expect(r.epf_deduction).toBe(1800);
    expect(r.esi_deduction).toBe(165);
    expect(r.tds_deduction).toBe(35); // all that was left
    expect(r.net_pay).toBe(0);
  });

  it('never nets below zero when nothing was earned', () => {
    const r = computeRegisterLine({
      monthlyGross: 150000,
      allowance: 10000,
      epfAmount: 1800,
      esiAmount: 165,
      tdsAmount: 7500,
      workingDaysBasis: 22,
      summary: summary({ present_days: 0, payable_days: 0 }),
    });

    expect(r.epf_deduction).toBe(0);
    expect(r.esi_deduction).toBe(0);
    expect(r.tds_deduction).toBe(0);
    expect(r.net_pay).toBe(0);
  });

  it('leaves the day-count identities untouched', () => {
    const r = computeRegisterLine({
      monthlyGross: 150000,
      allowance: 8000,
      tdsAmount: 7500,
      workingDaysBasis: 22,
      summary: summary({ present_days: 16, leave_days: 2, on_duty_days: 1, payable_days: 19 }),
    });

    expect(r.paid_days).toBe(r.business_working_days - r.unpaid_leave_days);
    expect(r.paid_days).toBe(r.worked_days + r.paid_leave_days + r.on_duty_days);
  });
});

/**
 * Work patterns (2026-09-04): a person on a 3-day or 5-day week at a 6-day
 * institution is paid on THEIR scheduled days. The basis choice is a pure
 * function so it can be pinned here; the arithmetic on top is unchanged.
 */
describe('registerBasisFor — a work pattern replaces the institution basis', () => {
  it("uses the pattern member's own scheduled days", () => {
    expect(registerBasisFor({ work_pattern_id: 'p1', scheduled_days: 13 }, 26)).toBe(13);
  });

  it('keeps the period basis for everyone without a pattern', () => {
    expect(registerBasisFor({ work_pattern_id: null, scheduled_days: 13 }, 26)).toBe(26);
    expect(registerBasisFor({ work_pattern_id: null, scheduled_days: null }, 26)).toBe(26);
  });

  it('falls back to the period basis when the pattern month has no scheduled days recorded', () => {
    // A month closed before the column existed, or a pattern week of all-off
    // days: dividing by zero is never the answer.
    expect(registerBasisFor({ work_pattern_id: 'p1', scheduled_days: null }, 26)).toBe(26);
    expect(registerBasisFor({ work_pattern_id: 'p1', scheduled_days: 0 }, 26)).toBe(26);
  });

  it('prices a 3-day week person against 13 scheduled days, not 26', () => {
    // 26,000 gross over 13 scheduled days = 2,000/day. Worked 12 -> 1 unpaid.
    const r = computeRegisterLine({
      monthlyGross: 26000,
      workingDaysBasis: registerBasisFor({ work_pattern_id: 'p1', scheduled_days: 13 }, 26),
      summary: summary({ present_days: 12, payable_days: 12 }),
    });
    expect(r.business_working_days).toBe(13);
    expect(r.unpaid_leave_days).toBe(1);
    expect(r.unpaid_leave_deduction).toBe(2000);
    expect(r.net_pay).toBe(24000);
  });

  it('still charges a mid-month joiner on a pattern for the scheduled days before they joined', () => {
    // scheduled_days is the FULL month's expectation, never clamped to the
    // joining date — the same rule the institution basis follows.
    const r = computeRegisterLine({
      monthlyGross: 26000,
      workingDaysBasis: registerBasisFor({ work_pattern_id: 'p1', scheduled_days: 13 }, 26),
      summary: summary({ present_days: 6, payable_days: 6 }),
    });
    expect(r.unpaid_leave_days).toBe(7);
    expect(r.unpaid_leave_deduction).toBe(14000);
    expect(r.net_pay).toBe(12000);
  });
});
