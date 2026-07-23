import { describe, it, expect } from 'vitest';
import { feeItemAppliesToYear } from '../fee-structure-service';

describe('feeItemAppliesToYear', () => {
  it('every_year always applies', () => {
    expect(feeItemAppliesToYear({ applies_to: 'every_year', applies_year_of_study: null }, 3)).toBe(true);
  });
  it('first_year_only applies only in year 1', () => {
    expect(feeItemAppliesToYear({ applies_to: 'first_year_only', applies_year_of_study: null }, 1)).toBe(true);
    expect(feeItemAppliesToYear({ applies_to: 'first_year_only', applies_year_of_study: null }, 2)).toBe(false);
  });
  it('specific_year matches the exact year', () => {
    expect(feeItemAppliesToYear({ applies_to: 'specific_year', applies_year_of_study: 2 }, 2)).toBe(true);
    expect(feeItemAppliesToYear({ applies_to: 'specific_year', applies_year_of_study: 2 }, 1)).toBe(false);
  });
});
