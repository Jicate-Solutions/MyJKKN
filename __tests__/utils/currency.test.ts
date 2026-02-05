/**
 * Tests for Currency Utility Functions
 *
 * These tests verify that our paisa-based currency system
 * maintains exact precision and prevents floating-point errors.
 */

import {
  rupeesToPaisa,
  paisaToRupees,
  formatPaisaAsCurrency,
  addPaisa,
  subtractPaisa,
  multiplyPaisa,
  percentageOfPaisa,
  parseRupeesInputToPaisa,
  isValidPaisa,
  isPaisaAmount,
  brandAsPaisa,
  PAISA,
  CurrencyError,
  safePaisaToRupees,
  safeRupeesToPaisa,
} from '@/lib/utils/currency';

describe('Currency Conversion', () => {
  describe('rupeesToPaisa', () => {
    it('should convert whole rupees to paisa', () => {
      expect(rupeesToPaisa(1)).toBe(100);
      expect(rupeesToPaisa(100)).toBe(10000);
      expect(rupeesToPaisa(1000)).toBe(100000);
    });

    it('should convert decimal rupees to paisa', () => {
      expect(rupeesToPaisa(0.50)).toBe(50);
      expect(rupeesToPaisa(1.50)).toBe(150);
      expect(rupeesToPaisa(100.50)).toBe(10050);
    });

    it('should handle the problematic case from the bug', () => {
      // The original bug: ₹100.10 + ₹200.20 = ₹300.2999999999
      const visibleRupees = 100.10;
      const hiddenRupees = 200.20;

      const visiblePaisa = rupeesToPaisa(visibleRupees);
      const hiddenPaisa = rupeesToPaisa(hiddenRupees);

      expect(visiblePaisa).toBe(10010);
      expect(hiddenPaisa).toBe(20020);
      expect(visiblePaisa + hiddenPaisa).toBe(30030); // Exact!
    });

    it('should round to nearest paisa', () => {
      // Note: JavaScript's Math.round uses "round half up" for positive numbers
      // 1.005 * 100 = 100.5, which rounds to 100 (banker's rounding in some JS engines)
      expect(rupeesToPaisa(1.005)).toBe(100); // Rounds down due to float precision
      expect(rupeesToPaisa(1.004)).toBe(100); // Rounds down
      expect(rupeesToPaisa(1.006)).toBe(101); // Rounds up
    });

    it('should handle zero', () => {
      expect(rupeesToPaisa(0)).toBe(0);
    });
  });

  describe('paisaToRupees', () => {
    it('should convert paisa to rupees', () => {
      expect(paisaToRupees(100)).toBe(1);
      expect(paisaToRupees(10000)).toBe(100);
      expect(paisaToRupees(100000)).toBe(1000);
    });

    it('should convert decimal paisa to rupees', () => {
      expect(paisaToRupees(50)).toBe(0.50);
      expect(paisaToRupees(150)).toBe(1.50);
      expect(paisaToRupees(10050)).toBe(100.50);
    });

    it('should handle zero', () => {
      expect(paisaToRupees(0)).toBe(0);
    });

    it('should be inverse of rupeesToPaisa', () => {
      const amounts = [1, 10, 100, 1000, 0.50, 1.50, 100.50];
      amounts.forEach((amount) => {
        expect(paisaToRupees(rupeesToPaisa(amount))).toBeCloseTo(amount, 2);
      });
    });
  });
});

describe('Currency Formatting', () => {
  describe('formatPaisaAsCurrency', () => {
    it('should format paisa as INR currency', () => {
      expect(formatPaisaAsCurrency(10050)).toMatch(/100\.50/);
      expect(formatPaisaAsCurrency(100)).toMatch(/1\.00/);
      expect(formatPaisaAsCurrency(0)).toMatch(/0\.00/);
    });

    it('should handle large amounts', () => {
      // 100000000 paisa = ₹1,000,000.00 (10 lakhs)
      const formatted = formatPaisaAsCurrency(100000000);
      expect(formatted).toMatch(/10,00,000\.00/);
    });
  });
});

describe('Currency Arithmetic', () => {
  describe('addPaisa', () => {
    it('should add multiple paisa amounts', () => {
      expect(addPaisa(100, 200, 300)).toBe(600);
      expect(addPaisa(10010, 20020)).toBe(30030);
    });

    it('should handle single amount', () => {
      expect(addPaisa(100)).toBe(100);
    });

    it('should handle no amounts', () => {
      expect(addPaisa()).toBe(0);
    });

    it('should maintain exact precision', () => {
      // The bug test case
      const visible = 10010; // ₹100.10
      const hidden = 20020; // ₹200.20
      const total = addPaisa(visible, hidden);

      expect(total).toBe(30030); // Exactly ₹300.30, not 300.2999999999
    });
  });

  describe('subtractPaisa', () => {
    it('should subtract paisa amounts', () => {
      expect(subtractPaisa(1000, 500)).toBe(500);
      expect(subtractPaisa(30030, 10010)).toBe(20020);
    });

    it('should handle zero', () => {
      expect(subtractPaisa(1000, 0)).toBe(1000);
      expect(subtractPaisa(1000, 1000)).toBe(0);
    });
  });

  describe('multiplyPaisa', () => {
    it('should multiply paisa by integer', () => {
      expect(multiplyPaisa(100, 2)).toBe(200);
      expect(multiplyPaisa(10050, 3)).toBe(30150);
    });

    it('should multiply paisa by decimal', () => {
      expect(multiplyPaisa(10000, 0.5)).toBe(5000);
      expect(multiplyPaisa(10050, 0.5)).toBe(5025);
    });

    it('should round result', () => {
      expect(multiplyPaisa(100, 1.5)).toBe(150);
    });
  });

  describe('percentageOfPaisa', () => {
    it('should calculate percentage', () => {
      expect(percentageOfPaisa(10000, 10)).toBe(1000); // 10% of ₹100
      expect(percentageOfPaisa(10000, 50)).toBe(5000); // 50% of ₹100
    });

    it('should round result', () => {
      expect(percentageOfPaisa(10050, 5)).toBe(503); // 5% of ₹100.50
    });

    it('should handle zero', () => {
      expect(percentageOfPaisa(10000, 0)).toBe(0);
      expect(percentageOfPaisa(0, 10)).toBe(0);
    });
  });
});

describe('Input Parsing', () => {
  describe('parseRupeesInputToPaisa', () => {
    it('should parse valid rupees strings', () => {
      expect(parseRupeesInputToPaisa('100')).toBe(10000);
      expect(parseRupeesInputToPaisa('100.50')).toBe(10050);
      expect(parseRupeesInputToPaisa('0.50')).toBe(50);
      expect(parseRupeesInputToPaisa('.50')).toBe(50);
    });

    it('should remove currency symbols', () => {
      expect(parseRupeesInputToPaisa('₹100')).toBe(10000);
      expect(parseRupeesInputToPaisa('₹ 100.50')).toBe(10050);
    });

    it('should handle comma separators', () => {
      expect(parseRupeesInputToPaisa('1,000')).toBe(100000);
      expect(parseRupeesInputToPaisa('10,000.50')).toBe(1000050);
    });

    it('should return null for invalid input', () => {
      expect(parseRupeesInputToPaisa('abc')).toBeNull();
      expect(parseRupeesInputToPaisa('')).toBeNull();
      expect(parseRupeesInputToPaisa('-100')).toBeNull();
    });
  });
});

describe('Validation', () => {
  describe('isValidPaisa', () => {
    it('should validate positive paisa amounts', () => {
      expect(isValidPaisa(0)).toBe(true);
      expect(isValidPaisa(100)).toBe(true);
      expect(isValidPaisa(10050)).toBe(true);
    });

    it('should reject invalid amounts', () => {
      expect(isValidPaisa(-100)).toBe(false);
      expect(isValidPaisa(NaN)).toBe(false);
      expect(isValidPaisa(Infinity)).toBe(false);
    });
  });

  describe('isPaisaAmount', () => {
    it('should check if value is paisa amount', () => {
      expect(isPaisaAmount(100)).toBe(true);
      expect(isPaisaAmount(0)).toBe(true);
      expect(isPaisaAmount(-100)).toBe(false);
      expect(isPaisaAmount('100')).toBe(false);
      expect(isPaisaAmount(null)).toBe(false);
      expect(isPaisaAmount(undefined)).toBe(false);
    });
  });

  describe('brandAsPaisa', () => {
    it('should brand valid paisa amounts', () => {
      expect(brandAsPaisa(100)).toBe(100);
      expect(brandAsPaisa(0)).toBe(0);
    });

    it('should throw on invalid amounts', () => {
      expect(() => brandAsPaisa(-100)).toThrow(Error);
      expect(() => brandAsPaisa(NaN)).toThrow(Error);
    });
  });
});

describe('Safe Conversions', () => {
  describe('safePaisaToRupees', () => {
    it('should convert valid paisa', () => {
      expect(safePaisaToRupees(10050)).toBe(100.50);
    });

    it('should throw on invalid paisa', () => {
      expect(() => safePaisaToRupees(-100)).toThrow(CurrencyError);
      expect(() => safePaisaToRupees(NaN)).toThrow(CurrencyError);
    });
  });

  describe('safeRupeesToPaisa', () => {
    it('should convert valid rupees', () => {
      expect(safeRupeesToPaisa(100.50)).toBe(10050);
    });

    it('should throw on invalid rupees', () => {
      expect(() => safeRupeesToPaisa(-100)).toThrow(CurrencyError);
      expect(() => safeRupeesToPaisa(NaN)).toThrow(CurrencyError);
    });
  });
});

describe('Constants', () => {
  it('should provide common paisa values', () => {
    expect(PAISA.ZERO).toBe(0);
    expect(PAISA.ONE_RUPEE).toBe(100);
    expect(PAISA.TEN_RUPEES).toBe(1000);
    expect(PAISA.HUNDRED_RUPEES).toBe(10000);
    expect(PAISA.THOUSAND_RUPEES).toBe(100000);
  });
});

describe('Real-World COPQ Scenarios', () => {
  it('should handle bill miscalculation incident', () => {
    // Scenario: Bill was ₹1000, but charged ₹1100 due to miscalculation
    const correctAmount = rupeesToPaisa(1000);
    const chargedAmount = rupeesToPaisa(1100);
    const visibleCost = subtractPaisa(chargedAmount, correctAmount);

    expect(visibleCost).toBe(10000); // ₹100 overcharged
    expect(formatPaisaAsCurrency(visibleCost)).toMatch(/100\.00/);
  });

  it('should handle late fee waiver incident', () => {
    // Scenario: Late fee of ₹500 waived, 2 staff hours at ₹200/hr
    const visibleCost = rupeesToPaisa(500);
    const hiddenCost = rupeesToPaisa(2 * 200);
    const totalCost = addPaisa(visibleCost, hiddenCost);

    expect(visibleCost).toBe(50000);
    expect(hiddenCost).toBe(40000);
    expect(totalCost).toBe(90000); // ₹900 total COPQ
  });

  it('should handle incorrect discount application', () => {
    // Scenario: 10% discount incorrectly applied to ₹5000 bill
    const billAmount = rupeesToPaisa(5000);
    const incorrectDiscount = percentageOfPaisa(billAmount, 10);

    expect(incorrectDiscount).toBe(50000); // ₹500 incorrect discount
  });

  it('should aggregate multiple incidents correctly', () => {
    // Scenario: Monthly COPQ summary
    const incidents = [
      { visible: 50000, hidden: 40000 }, // ₹500 + ₹400
      { visible: 30000, hidden: 20000 }, // ₹300 + ₹200
      { visible: 10010, hidden: 20020 }, // ₹100.10 + ₹200.20 (bug case)
    ];

    const totalVisible = addPaisa(
      ...incidents.map((i) => i.visible)
    );
    const totalHidden = addPaisa(
      ...incidents.map((i) => i.hidden)
    );
    const totalCOPQ = addPaisa(totalVisible, totalHidden);

    expect(totalVisible).toBe(90010); // ₹900.10
    expect(totalHidden).toBe(80020); // ₹800.20
    expect(totalCOPQ).toBe(170030); // ₹1700.30 (exact!)
  });
});

describe('Precision Comparison', () => {
  it('should demonstrate DECIMAL precision loss vs BIGINT', () => {
    // Simulating the DECIMAL approach (using float)
    const decimalResult = 100.10 + 200.20;
    expect(decimalResult).not.toBe(300.30); // Floating-point error!

    // Our BIGINT paisa approach
    const paisaResult = addPaisa(10010, 20020);
    expect(paisaResult).toBe(30030); // Exact!
    expect(paisaToRupees(paisaResult)).toBe(300.30); // Converts perfectly
  });

  it('should handle edge cases that break DECIMAL', () => {
    // These are known problematic cases for floating-point
    const testCases = [
      { a: 0.1, b: 0.2, expected: 0.3 },
      { a: 100.10, b: 200.20, expected: 300.30 },
      { a: 1.005, b: 2.005, expected: 3.01 },
    ];

    testCases.forEach(({ a, b, expected }) => {
      const aPaisa = rupeesToPaisa(a);
      const bPaisa = rupeesToPaisa(b);
      const resultPaisa = addPaisa(aPaisa, bPaisa);
      const resultRupees = paisaToRupees(resultPaisa);

      expect(resultRupees).toBeCloseTo(expected, 2);
    });
  });
});
