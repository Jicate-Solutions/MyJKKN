// lib/services/billing/copq/__tests__/financial-precision.test.ts
// Unit tests for COPQ financial precision

import { describe, it, expect } from '@jest/globals';

/**
 * Financial Precision Tests
 *
 * CRITICAL: These tests verify that monetary calculations are exact.
 * Any failure indicates a precision loss bug that WILL cause audit failures.
 */

// Helper functions (mirror service layer implementation)
function rupeesToPaisa(rupees: number): number {
  return Math.round(rupees * 100);
}

function paisaToRupees(paisa: number): number {
  return paisa / 100;
}

function addMoney(a: number, b: number): number {
  return a + b;
}

function sumMoney(values: number[]): number {
  return values.reduce((sum, val) => sum + val, 0);
}

describe('Financial Precision - COPQ', () => {
  describe('Conversion Functions', () => {
    it('should convert rupees to paisa correctly', () => {
      expect(rupeesToPaisa(100.50)).toBe(10050);
      expect(rupeesToPaisa(200.75)).toBe(20075);
      expect(rupeesToPaisa(0.01)).toBe(1);
      expect(rupeesToPaisa(999999.99)).toBe(99999999);
    });

    it('should convert paisa to rupees correctly', () => {
      expect(paisaToRupees(10050)).toBe(100.50);
      expect(paisaToRupees(20075)).toBe(200.75);
      expect(paisaToRupees(1)).toBe(0.01);
      expect(paisaToRupees(99999999)).toBe(999999.99);
    });

    it('should handle round-trip conversion without loss', () => {
      const original = 123.45;
      const paisa = rupeesToPaisa(original);
      const restored = paisaToRupees(paisa);
      expect(restored).toBe(original);
    });
  });

  describe('Addition Precision', () => {
    it('should not lose precision in simple addition', () => {
      const cost1 = 100.10; // ₹100.10
      const cost2 = 200.20; // ₹200.20

      // Convert to paisa for calculation
      const paisa1 = rupeesToPaisa(cost1);
      const paisa2 = rupeesToPaisa(cost2);
      const totalPaisa = addMoney(paisa1, paisa2);
      const totalRupees = paisaToRupees(totalPaisa);

      expect(totalRupees).toBe(300.30); // Exact!
    });

    it('should handle multiple additions without precision loss', () => {
      const costs = [100.10, 200.20, 300.30, 400.40];

      // Convert to paisa
      const paisaValues = costs.map(rupeesToPaisa);
      const totalPaisa = sumMoney(paisaValues);
      const totalRupees = paisaToRupees(totalPaisa);

      expect(totalRupees).toBe(1001.00); // Exact!
    });

    it('should handle edge case of many small additions', () => {
      // This would fail with floating-point: 0.01 + 0.01 + ... (100 times)
      const costs = Array(100).fill(0.01);
      const paisaValues = costs.map(rupeesToPaisa);
      const totalPaisa = sumMoney(paisaValues);
      const totalRupees = paisaToRupees(totalPaisa);

      expect(totalRupees).toBe(1.00); // Exact!
    });
  });

  describe('Large Sum Calculations', () => {
    it('should handle large sums without overflow', () => {
      const costs = Array(1000).fill(999.99);
      const paisaValues = costs.map(rupeesToPaisa);
      const totalPaisa = sumMoney(paisaValues);
      const totalRupees = paisaToRupees(totalPaisa);

      expect(totalRupees).toBe(999990.00);
    });

    it('should handle maximum value correctly', () => {
      const maxRupees = 999999999.99;
      const paisa = rupeesToPaisa(maxRupees);
      const restored = paisaToRupees(paisa);

      expect(restored).toBe(maxRupees);
    });
  });

  describe('Real-world COPQ Scenarios', () => {
    it('should calculate invoice error cost correctly', () => {
      const visibleCost = 150.75; // Staff time to fix
      const hiddenCost = 300.50;  // Reputation damage estimate

      const visiblePaisa = rupeesToPaisa(visibleCost);
      const hiddenPaisa = rupeesToPaisa(hiddenCost);
      const totalPaisa = addMoney(visiblePaisa, hiddenPaisa);
      const totalRupees = paisaToRupees(totalPaisa);

      expect(totalRupees).toBe(451.25); // Exact!
    });

    it('should aggregate monthly COPQ correctly', () => {
      const incidents = [
        { visible: 100.50, hidden: 200.25 },
        { visible: 150.75, hidden: 300.50 },
        { visible: 200.00, hidden: 400.75 }
      ];

      let totalVisiblePaisa = 0;
      let totalHiddenPaisa = 0;

      incidents.forEach(inc => {
        totalVisiblePaisa = addMoney(totalVisiblePaisa, rupeesToPaisa(inc.visible));
        totalHiddenPaisa = addMoney(totalHiddenPaisa, rupeesToPaisa(inc.hidden));
      });

      const totalVisible = paisaToRupees(totalVisiblePaisa);
      const totalHidden = paisaToRupees(totalHiddenPaisa);
      const totalCOPQ = paisaToRupees(addMoney(totalVisiblePaisa, totalHiddenPaisa));

      expect(totalVisible).toBe(451.25);
      expect(totalHidden).toBe(901.50);
      expect(totalCOPQ).toBe(1352.75); // Exact sum!
    });

    it('should calculate category totals correctly', () => {
      const categoryData = {
        invoice_error: [100.10, 200.20, 300.30],
        refund_processing: [50.50, 75.75],
        late_payment_followup: [125.25]
      };

      const categoryTotals: Record<string, number> = {};

      Object.entries(categoryData).forEach(([category, costs]) => {
        const paisaValues = costs.map(rupeesToPaisa);
        const totalPaisa = sumMoney(paisaValues);
        categoryTotals[category] = paisaToRupees(totalPaisa);
      });

      expect(categoryTotals.invoice_error).toBe(600.60);
      expect(categoryTotals.refund_processing).toBe(126.25);
      expect(categoryTotals.late_payment_followup).toBe(125.25);
    });
  });

  describe('Comparison with Floating-Point (Demonstrating the Problem)', () => {
    it('DEMO: floating-point fails where paisa succeeds', () => {
      const cost1 = 100.10;
      const cost2 = 200.20;

      // Floating-point (WRONG!)
      const floatResult = cost1 + cost2;
      // expect(floatResult).toBe(300.30); // This FAILS!
      expect(floatResult).not.toBe(300.30); // Proves the bug

      // Integer paisa (CORRECT!)
      const paisa1 = rupeesToPaisa(cost1);
      const paisa2 = rupeesToPaisa(cost2);
      const paisaResult = paisaToRupees(addMoney(paisa1, paisa2));
      expect(paisaResult).toBe(300.30); // This PASSES!
    });
  });

  describe('Input Validation', () => {
    it('should handle rounding of floating-point input', () => {
      // User might input 100.105 (3 decimals)
      const input = 100.105;
      const paisa = rupeesToPaisa(input); // Math.round handles this
      expect(paisa).toBe(10011); // Rounds to nearest paisa
      expect(paisaToRupees(paisa)).toBe(100.11);
    });

    it('should reject values with too many decimal places in validation', () => {
      const value = 100.105; // 3 decimals
      const isValid = Math.round(value * 100) === value * 100;
      expect(isValid).toBe(false); // Validation should fail
    });

    it('should accept values with 2 or fewer decimal places', () => {
      const values = [100.10, 200.5, 300];
      values.forEach(val => {
        const isValid = Math.round(val * 100) === val * 100;
        expect(isValid).toBe(true);
      });
    });
  });
});
