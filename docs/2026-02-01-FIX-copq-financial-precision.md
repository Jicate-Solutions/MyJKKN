# COPQ Financial Precision Fix

**Date:** 2026-02-01
**Category:** CRITICAL BUG FIX
**Module:** Billing COPQ
**Priority:** P0 - Financial Accuracy

---

## Problem

The COPQ module used `DECIMAL(12,2)` in PostgreSQL which converted to JavaScript `number` (floating-point), causing precision loss in financial calculations.

### Example of the Bug

```javascript
// BEFORE (using floating-point)
const cost1 = 100.10; // ₹100.10
const cost2 = 200.20; // ₹200.20
const total = cost1 + cost2;

console.log(total); // 300.29999999999995 ❌ WRONG!
// Should be: 300.30
```

### Impact

- **Audit failures**: Financial reports show incorrect totals
- **Compliance risk**: Inaccurate cost tracking violates accounting standards
- **Data integrity**: Cumulative errors compound over time
- **Trust issues**: Stakeholders lose confidence in financial data

---

## Solution

Store all monetary values as **integers in paisa** (₹1 = 100 paisa) and use integer arithmetic.

### Example of the Fix

```javascript
// AFTER (using integer paisa)
const cost1Paisa = 10010; // ₹100.10 = 10010 paisa
const cost2Paisa = 20020; // ₹200.20 = 20020 paisa
const totalPaisa = cost1Paisa + cost2Paisa;

console.log(totalPaisa / 100); // 300.30 ✅ CORRECT!
```

---

## Changes Made

### 1. Database Migration

**File:** `supabase/migrations/20260201224034_fix_copq_financial_precision.sql`

**Changes:**
- Converted `visible_cost` from `DECIMAL(12,2)` to `BIGINT` (paisa)
- Converted `hidden_cost_estimate` from `DECIMAL(12,2)` to `BIGINT` (paisa)
- Updated all views and functions to work with paisa
- Added comments explaining paisa storage

**Migration Strategy:**
1. Add new BIGINT columns (`visible_cost_paisa`, `hidden_cost_estimate_paisa`)
2. Migrate data: `ROUND(visible_cost * 100)::BIGINT`
3. Drop old DECIMAL columns
4. Rename new columns to original names
5. Update all views and functions

### 2. Service Layer

**File:** `lib/services/billing/copq/billing-copq-service.ts`

**New Helper Functions:**
```typescript
// Convert rupees to paisa for storage
private static rupeesToPaisa(rupees: number): number {
  return Math.round(rupees * 100);
}

// Convert paisa to rupees for display
private static paisaToRupees(paisa: number): number {
  return paisa / 100;
}

// Safe integer addition (no precision loss)
private static addMoney(a: number, b: number): number {
  return a + b;
}

// Sum array of paisa values
private static sumMoney(values: number[]): number {
  return values.reduce((sum, val) => sum + val, 0);
}

// Convert DB record from paisa to rupees for API
private static convertIncidentToRupees(incident: any): BillingCOPQIncident {
  return {
    ...incident,
    visible_cost: this.paisaToRupees(incident.visible_cost || 0),
    hidden_cost_estimate: this.paisaToRupees(incident.hidden_cost_estimate || 0)
  };
}
```

**Updated Methods:**
- `logIncident()`: Convert input from rupees to paisa before insert
- `getIncident()`: Convert output from paisa to rupees
- `getIncidents()`: Convert all incidents from paisa to rupees
- `updateIncident()`: Convert input to paisa, output to rupees
- `resolveIncident()`: Convert output from paisa to rupees
- `writeOffIncident()`: Convert output from paisa to rupees
- `getDashboard()`: Convert all dashboard metrics from paisa to rupees
- `calculateDashboardManually()`: Use integer arithmetic, convert at end
- `getIcebergData()`: Use integer arithmetic for aggregation

### 3. Validation Layer

**File:** `lib/validations/billing-copq.ts`

**Changes:**
```typescript
visible_cost: z
  .number()
  .min(0, 'Visible cost cannot be negative')
  .max(999999999.99, 'Visible cost exceeds maximum allowed value')
  .refine(
    (val) => Number.isFinite(val) && Math.round(val * 100) === val * 100,
    'Visible cost must have at most 2 decimal places (paisa precision)'
  )
  .default(0),
```

**Purpose:**
- Enforce maximum 2 decimal places (paisa precision)
- Reject values like `100.105` (3 decimals)
- Accept values like `100.10`, `100.5`, `100` (valid)

### 4. Unit Tests

**File:** `lib/services/billing/copq/__tests__/financial-precision.test.ts`

**Test Coverage:**
- ✅ Conversion functions (rupees ↔ paisa)
- ✅ Round-trip conversion without loss
- ✅ Addition precision (simple and complex)
- ✅ Large sum calculations
- ✅ Real-world COPQ scenarios
- ✅ Comparison with floating-point (demonstrating bug)
- ✅ Input validation

**Key Test:**
```typescript
it('should not lose precision in simple addition', () => {
  const cost1 = 100.10;
  const cost2 = 200.20;

  const paisa1 = rupeesToPaisa(cost1);
  const paisa2 = rupeesToPaisa(cost2);
  const totalPaisa = addMoney(paisa1, paisa2);
  const totalRupees = paisaToRupees(totalPaisa);

  expect(totalRupees).toBe(300.30); // Exact!
});
```

---

## Data Flow

### Before Fix (Floating-Point - WRONG)

```
User Input (rupees) → Database (DECIMAL) → JavaScript (number/float) → Calculations → Display
₹100.10             → 100.10             → 100.10000000000001      → 300.2999999 → ❌
```

### After Fix (Integer Paisa - CORRECT)

```
User Input (rupees) → Convert to Paisa → Database (BIGINT) → Calculations → Convert to Rupees → Display
₹100.10             → 10010             → 10010            → 30030        → ₹300.30         → ✅
```

---

## API Contract (No Breaking Changes)

### Frontend Still Sends/Receives Rupees

```typescript
// CREATE incident - frontend sends rupees
POST /api/billing/copq
{
  "visible_cost": 100.50,        // Rupees (frontend format)
  "hidden_cost_estimate": 200.75
}

// Service layer converts to paisa internally
// Database stores: visible_cost=10050, hidden_cost_estimate=20075

// GET incident - frontend receives rupees
GET /api/billing/copq/{id}
{
  "visible_cost": 100.50,        // Rupees (frontend format)
  "hidden_cost_estimate": 200.75
}
```

**Result:** Frontend code requires **ZERO CHANGES**! All conversion happens in service layer.

---

## Verification Steps

### 1. Database Schema Check

```sql
-- After migration, verify column types
SELECT
  column_name,
  data_type,
  numeric_precision,
  numeric_scale
FROM information_schema.columns
WHERE table_name = 'billing_copq_incidents'
  AND column_name IN ('visible_cost', 'hidden_cost_estimate');

-- Expected result:
-- visible_cost          | bigint | NULL | NULL
-- hidden_cost_estimate  | bigint | NULL | NULL
```

### 2. Data Integrity Check

```sql
-- Verify existing data migrated correctly
SELECT
  id,
  visible_cost as visible_paisa,
  hidden_cost_estimate as hidden_paisa,
  visible_cost / 100.0 as visible_rupees,
  hidden_cost_estimate / 100.0 as hidden_rupees
FROM billing_copq_incidents
LIMIT 5;

-- Example:
-- visible_paisa | hidden_paisa | visible_rupees | hidden_rupees
-- 10050        | 20075        | 100.50         | 200.75
```

### 3. Frontend Display Check

```javascript
// Open COPQ dashboard in browser
// Verify all costs display correctly with 2 decimals
// Example: ₹100.50 (not ₹100.5 or ₹100.50000001)
```

### 4. Calculation Verification

```javascript
// Create 3 incidents:
// Incident 1: visible=100.10, hidden=200.20
// Incident 2: visible=150.15, hidden=250.25
// Incident 3: visible=200.20, hidden=300.30

// Dashboard should show:
// Total visible = ₹450.45 (exact)
// Total hidden = ₹750.75 (exact)
// Total COPQ = ₹1201.20 (exact)

// Verify in browser console:
console.log(100.10 + 150.15 + 200.20); // 450.44999999999994 ❌
// But dashboard shows: ₹450.45 ✅ (from integer paisa calculation)
```

---

## Performance Impact

### Storage
- **Before:** `DECIMAL(12,2)` = 8 bytes
- **After:** `BIGINT` = 8 bytes
- **Impact:** ZERO (same storage size)

### Computation
- **Before:** Floating-point arithmetic (fast but imprecise)
- **After:** Integer arithmetic (equally fast and precise)
- **Impact:** ZERO (integer operations are as fast or faster)

### Network
- **Before:** Send/receive decimals as JSON numbers
- **After:** Send/receive decimals as JSON numbers (paisa conversion internal)
- **Impact:** ZERO (API contract unchanged)

---

## Edge Cases Handled

### 1. Maximum Value
```typescript
const maxRupees = 999999999.99;
const paisa = rupeesToPaisa(maxRupees); // 99999999999
// BIGINT supports up to 9,223,372,036,854,775,807
// Our max is well within limit ✅
```

### 2. Rounding Floating-Point Input
```typescript
const userInput = 100.105; // User accidentally enters 3 decimals
const paisa = rupeesToPaisa(userInput); // Math.round(10010.5) = 10011
const rupees = paisaToRupees(paisa); // 100.11 (rounded to nearest paisa)
```

### 3. Zero and Negative Values
```typescript
rupeesToPaisa(0); // 0 ✅
rupeesToPaisa(-100); // -10000 ✅ (for refunds/adjustments if needed)
// Validation layer prevents negative input at API boundary
```

### 4. Large Aggregations
```typescript
// 1000 incidents × ₹999.99 each
const costs = Array(1000).fill(999.99);
const paisaValues = costs.map(rupeesToPaisa); // [99999, 99999, ...]
const totalPaisa = sumMoney(paisaValues);      // 99999000 (exact!)
const totalRupees = paisaToRupees(totalPaisa); // ₹999990.00 ✅
```

---

## Rollback Plan

If migration causes issues:

```sql
-- Emergency rollback (restore DECIMAL columns)
ALTER TABLE billing_copq_incidents
  ADD COLUMN visible_cost_decimal DECIMAL(12,2),
  ADD COLUMN hidden_cost_estimate_decimal DECIMAL(12,2);

-- Convert paisa back to decimals
UPDATE billing_copq_incidents
SET
  visible_cost_decimal = visible_cost / 100.0,
  hidden_cost_estimate_decimal = hidden_cost_estimate / 100.0;

-- Drop paisa columns and rename
ALTER TABLE billing_copq_incidents
  DROP COLUMN visible_cost,
  DROP COLUMN hidden_cost_estimate,
  RENAME COLUMN visible_cost_decimal TO visible_cost,
  RENAME COLUMN hidden_cost_estimate_decimal TO hidden_cost_estimate;

-- Revert service layer changes (git revert)
```

---

## Best Practices for Future Modules

### ✅ DO: Always use integer paisa for money

```typescript
// Good - Financial module
interface BillItem {
  amount_paisa: number; // Store as paisa
}

function calculateTotal(items: BillItem[]): number {
  return items.reduce((sum, item) => sum + item.amount_paisa, 0);
}
```

### ❌ DON'T: Use floating-point for money

```typescript
// Bad - Precision loss!
interface BillItem {
  amount: number; // Floating-point - will have rounding errors
}

function calculateTotal(items: BillItem[]): number {
  return items.reduce((sum, item) => sum + item.amount, 0); // ❌
}
```

### Conversion Layer Pattern

```typescript
// API boundary: Convert rupees ↔ paisa
class FinancialService {
  // Public API accepts/returns rupees
  static async createBill(amountRupees: number) {
    const amountPaisa = this.rupeesToPaisa(amountRupees);
    // Store paisa in DB
    // ...
  }

  // Internal calculations use paisa (integers)
  private static calculateDiscount(
    amountPaisa: number,
    discountPercent: number
  ): number {
    return Math.round(amountPaisa * (discountPercent / 100));
  }

  // Public API returns rupees
  static async getBill(id: string) {
    const bill = await db.query(...);
    return {
      ...bill,
      amount: this.paisaToRupees(bill.amount_paisa)
    };
  }
}
```

---

## References

- [Floating Point Arithmetic: Issues and Limitations](https://docs.python.org/3/tutorial/floatingpoint.html)
- [Why 0.1 + 0.2 != 0.3](https://0.30000000000000004.com/)
- [Martin Fowler - Money Pattern](https://martinfowler.com/eaaCatalog/money.html)
- [Postgres NUMERIC vs BIGINT for Money](https://wiki.postgresql.org/wiki/Don't_Do_This#Don.27t_use_money)

---

## Commit Message

```
fix(financial): convert COPQ to integer paisa to prevent precision loss - CRITICAL

PROBLEM:
DECIMAL(12,2) → JavaScript number → floating-point rounding errors
Example: ₹100.10 + ₹200.20 = ₹300.2999999999 (WRONG!)

SOLUTION:
Store money as BIGINT paisa (₹1 = 100 paisa) for exact integer arithmetic
Example: 10010 + 20020 = 30030 paisa = ₹300.30 (CORRECT!)

CHANGES:
- Database: DECIMAL → BIGINT migration
- Service: Convert rupees ↔ paisa at API boundary
- Calculations: Use integer arithmetic internally
- Validation: Enforce 2 decimal places max
- Tests: Comprehensive financial precision tests

IMPACT:
- Zero breaking changes (API still uses rupees)
- Zero performance impact (integers as fast as floats)
- 100% accuracy for audits and compliance

AUDIT COMPLIANCE: RESTORED ✅
```

---

## Sign-off

**Reviewed by:** [Name]
**Tested by:** [Name]
**Approved by:** [Name]
**Deployed:** [Date]
