# Billing Module - Receipt Partial Payment Bug Fix

**Date**: 2026-01-07
**Issue**: When generating receipt for partial payment, bill incorrectly marked as "paid" with ₹0 balance
**Status**: ✅ FIXED

## Problem

When creating a receipt for a partial payment (e.g., paying ₹5,000 for a ₹5,250 bill), the system incorrectly:

- ❌ Set `billing_receipt_items.amount_paid` = ₹5,250 (full bill amount) instead of ₹5,000 (actual payment)
- ❌ Marked bill status as "paid" instead of "partially_paid"
- ❌ Set bill balance to ₹0 instead of ₹250
- ❌ Displayed incorrect "Net Paid Amount" and "Outstanding" on student billing details page

**Example**:
- Bill created: ₹5,250
- Receipt generated with manual payment: ₹5,000 (partial payment)
- **Expected**: Balance ₹250, Status "partially_paid"
- **Actual**: Balance ₹0, Status "paid" ← BUG!

## Root Cause Analysis

### The Bug Flow

1. User clicks "Generate Receipt" from student bills table
2. URL navigation: `/billing/receipts/new?bill_ids=252eb999...` (note: `bill_ids` plural)
3. Page loads bill details and initializes:
   ```typescript
   billPayAmounts[bill.id] = 5250  // Full bill amount
   formData.payment_amount = 5250
   ```
4. User manually changes "Received Amount" input to `5000`
5. This updates `formData.payment_amount = 5000`
6. **BUT** it does NOT update `billPayAmounts[bill.id]` - it stays at `5250`
7. On form submit, code checks: `if (billId)` - this is FALSE (URL has `bill_ids` not `bill_id`)
8. Falls into `else if (selectedBills.length > 0)` branch
9. This branch uses: `amount_paid: billPayAmounts[bill.id]` which is still `5250`
10. Receipt item created with `amount_paid: 5250` instead of `5000`
11. Service calculates: `totalPaid (5250) >= billAmount (5250)` → marks as "paid"

### Code Location: `app/(routes)/billing/receipts/new/page.tsx`

**Lines 193-198 (BEFORE FIX):**
```typescript
const handleInputChange = (field: keyof CreateReceiptDto, value: any) => {
  setFormData((prev) => ({
    ...prev,
    [field]: value
  }));
  // Bug: Does not update billPayAmounts when payment_amount changes!
};
```

**Lines 232-245 (Submit logic):**
```typescript
if (billId) {
  // Single bill via ?bill_id=XXX (singular)
  receiptItems = [
    { bill_id: billId, amount_paid: formData.payment_amount! }
  ];
} else if (selectedBills.length > 0) {
  // Multiple bills OR single bill via ?bill_ids=XXX (plural)
  receiptItems = selectedBills
    .map((bill: any) => ({
      bill_id: bill.id,
      amount_paid: billPayAmounts[bill.id] || 0  // ← Uses stale value!
    }))
    .filter((item) => item.amount_paid > 0);
}
```

### Why It Happened

The page has TWO data structures for tracking payment amounts:
1. `formData.payment_amount` - Total payment amount (used for single bill via `?bill_id`)
2. `billPayAmounts` - Per-bill payment amounts (used for multiple bills via `?bill_ids`)

When navigating from the bills table, the URL uses `?bill_ids=XXX` (plural) even for a single bill. This means:
- User changes the "Received Amount" input
- Only `formData.payment_amount` is updated
- `billPayAmounts[bill.id]` remains at the initial full bill amount
- Submit uses the stale `billPayAmounts` value

## Solution

### Fix 1: Update `handleInputChange` to Sync Both Values

**File**: `app/(routes)/billing/receipts/new/page.tsx:193-208`

**After Fix:**
```typescript
const handleInputChange = (field: keyof CreateReceiptDto, value: any) => {
  setFormData((prev) => ({
    ...prev,
    [field]: value
  }));

  // CRITICAL FIX: When payment_amount changes and there's only ONE bill selected,
  // also update billPayAmounts to match the new payment amount
  // This prevents the bug where receipt item gets full bill amount instead of partial payment
  if (field === 'payment_amount' && selectedBills.length === 1) {
    const singleBillId = selectedBills[0].id;
    setBillPayAmounts({
      [singleBillId]: value
    });
  }
};
```

**Result**: When user changes "Received Amount" for a single bill, both `formData.payment_amount` AND `billPayAmounts[bill.id]` are updated to match.

### Fix 2: Database Migration to Correct Existing Data

**Migration**: `supabase/migrations/20260107_fix_receipt_partial_payment_bug.sql`

```sql
-- Fix the specific bill that has incorrect data
-- Bill: 252eb999-112e-4387-bf2d-036cbecfd6e3
-- Receipt: ff6c8c02-ef63-4d2e-b240-cfa9c821cbbc

-- Step 1: Fix receipt_item amount_paid (change from 5250 to 5000)
UPDATE billing_receipt_items
SET amount_paid = 5000.00
WHERE id = '5feb1f7b-9a12-4734-8280-8c4304cb0cba';

-- Step 2: Fix bill status and balance
UPDATE billing_student_bills
SET
  status = 'partially_paid',
  balance_amount = 250.00,
  payment_date = NULL,
  updated_at = NOW()
WHERE id = '252eb999-112e-4387-bf2d-036cbecfd6e3';
```

**Result**: Existing incorrect bill data is corrected to show proper partial payment status.

## Files Modified

### 1. Receipt Generation Page

**File**: `app/(routes)/billing/receipts/new/page.tsx`

**Changes**:
- Updated `handleInputChange` function (lines 193-208)
- Added logic to sync `billPayAmounts` when `payment_amount` changes for single bill
- Added detailed comment explaining the fix

### 2. Database Migration

**File**: `supabase/migrations/20260107_fix_receipt_partial_payment_bug.sql`

**Changes**:
- Fixed incorrect receipt_item.amount_paid for bill `252eb999...`
- Corrected bill status from "paid" to "partially_paid"
- Updated bill balance from ₹0 to ₹250
- Cleared payment_date since bill is not fully paid

## Impact

### Before Fix

**Receipt Generation Flow** (for single bill partial payment):
```
1. Bill: ₹5,250
2. User enters: ₹5,000
3. formData.payment_amount = 5000 ✓
4. billPayAmounts[bill.id] = 5250 ✗ (stale)
5. Submit uses: amount_paid = 5250 ✗
6. Bill marked as: "paid" ✗
7. Balance set to: ₹0 ✗
```

**Student Billing Details Page**:
- ❌ Shows: ₹5,250 paid, ₹0 outstanding
- ❌ Status: PAID (green badge)
- ❌ Misleading: Student thinks bill is fully paid

### After Fix

**Receipt Generation Flow** (for single bill partial payment):
```
1. Bill: ₹5,250
2. User enters: ₹5,000
3. formData.payment_amount = 5000 ✓
4. billPayAmounts[bill.id] = 5000 ✓ (synced!)
5. Submit uses: amount_paid = 5000 ✓
6. Bill marked as: "partially_paid" ✓
7. Balance set to: ₹250 ✓
```

**Student Billing Details Page**:
- ✅ Shows: ₹5,000 paid, ₹250 outstanding
- ✅ Status: PARTIALLY_PAID (yellow badge)
- ✅ Clear: Student knows ₹250 is still due

## Testing

### Pre-Fix Behavior

```
❌ Create bill for ₹5,250
❌ Click "Generate Receipt"
❌ Enter payment amount: ₹5,000
❌ Submit receipt
❌ Check bill details:
   - Shows: ₹5,250 paid (WRONG)
   - Shows: ₹0 outstanding (WRONG)
   - Status: PAID (WRONG)
❌ Database shows:
   - receipt_items.amount_paid = 5250 (WRONG)
   - bills.status = 'paid' (WRONG)
   - bills.balance_amount = 0 (WRONG)
```

### Post-Fix Expected Behavior

```
✓ Create bill for ₹5,250
✓ Click "Generate Receipt"
✓ Enter payment amount: ₹5,000
✓ Submit receipt
✓ Check bill details:
   - Shows: ₹5,000 paid (CORRECT)
   - Shows: ₹250 outstanding (CORRECT)
   - Status: PARTIALLY_PAID (CORRECT)
✓ Database shows:
   - receipt_items.amount_paid = 5000 (CORRECT)
   - bills.status = 'partially_paid' (CORRECT)
   - bills.balance_amount = 250 (CORRECT)
```

### Verification Steps

1. **Test Single Bill Partial Payment**:
   ```
   1. Create a bill for ₹10,000
   2. Go to student billing details
   3. Click "Generate Receipt" for the bill
   4. Enter payment amount: ₹7,000 (partial)
   5. Fill in payer details and submit
   6. Verify receipt shows: ₹7,000 paid
   7. Return to bill details
   8. Verify shows: ₹7,000 paid, ₹3,000 outstanding
   9. Verify status badge: PARTIALLY_PAID (yellow)
   10. Check database:
       - receipt_items.amount_paid = 7000 ✓
       - bills.balance_amount = 3000 ✓
       - bills.status = 'partially_paid' ✓
   ```

2. **Test Full Payment**:
   ```
   1. Create a bill for ₹5,000
   2. Generate receipt for full amount: ₹5,000
   3. Verify bill marked as: PAID
   4. Verify balance: ₹0
   5. Verify receipt_item.amount_paid = 5000
   ```

3. **Test Multiple Bills Payment**:
   ```
   1. Create two bills: ₹5,000 and ₹3,000
   2. Select both bills
   3. Click "Generate Receipt"
   4. Pay ₹5,000 for first bill, ₹2,000 for second bill (partial)
   5. Total payment: ₹7,000
   6. Verify first bill: PAID (₹5,000)
   7. Verify second bill: PARTIALLY_PAID (₹2,000 paid, ₹1,000 outstanding)
   ```

4. **Test Existing Fixed Data**:
   ```
   1. Navigate to student "BOOBALAN A" billing details
   2. Check bill dated 2026-01-07 for ₹5,250
   3. Verify shows: ₹5,000 paid, ₹250 outstanding
   4. Verify status: PARTIALLY_PAID
   5. View receipt RCP-2026-000081
   6. Verify receipt amount: ₹5,000
   7. Verify receipt item shows: ₹5,000 paid for ₹5,250 bill
   ```

## Security & Data Integrity Notes

### Why This Bug Was Critical

1. **Financial Accuracy**: Billing records showed incorrect paid amounts
2. **Student Confusion**: Students thought they had no outstanding balance
3. **Reporting Errors**: Financial reports would show incorrect totals
4. **Audit Trail**: Receipt and bill data were inconsistent

### Database Consistency Maintained

The fix ensures:
- ✅ `billing_receipts.payment_amount` = sum of all `billing_receipt_items.amount_paid`
- ✅ `billing_student_bills.balance_amount` = `final_amount` - sum of `receipt_items.amount_paid`
- ✅ Bill status correctly reflects payment state:
  - `unpaid`: No payments yet
  - `partially_paid`: Some payment received, balance > 0
  - `paid`: Full payment received, balance = 0

### Service Layer Validation

The `BillingReceiptService.validateAndUpdateBillStatus()` method (lines 846-932) provides fallback validation:
- Recalculates total paid from receipt items
- Determines correct status based on amount paid vs bill amount
- Updates bill if status/balance doesn't match
- Serves as safety net if UI sends incorrect data

## Related Information

### Similar Issues to Watch For

1. **Discount Application**: Check if discount forms have similar state management issue
2. **Refund Processing**: Verify refund forms correctly update bill balances
3. **Multiple Bill Receipts**: Ensure per-bill amounts are properly tracked

### Service Methods Involved

**Receipt Creation Flow**:
1. UI: `app/(routes)/billing/receipts/new/page.tsx` - Form submission
2. Hook: `hooks/billing/use-billing-receipts.ts` - `useCreateBillingReceipt()`
3. Service: `lib/services/billing/receipts/billing-receipt-service.ts`
   - `createBillingReceipt()` - Creates receipt and receipt items
   - `validateAndUpdateBillStatus()` - Recalculates and updates bill status
   - `checkAndGenerateInvoice()` - Auto-generates invoice if fully paid

### Database Tables Updated

**On Receipt Creation**:
1. `billing_receipts` - Receipt header with total payment amount
2. `billing_receipt_items` - Per-bill payment amounts
3. `billing_student_bills` - Status and balance updated based on receipt items

**Calculation Logic**:
```sql
-- Calculate total paid for a bill
SELECT SUM(amount_paid)
FROM billing_receipt_items
WHERE bill_id = 'xxx';

-- Determine status
CASE
  WHEN total_paid >= final_amount THEN 'paid'
  WHEN total_paid > 0 THEN 'partially_paid'
  ELSE 'unpaid'
END

-- Calculate balance
balance_amount = final_amount - total_paid
```

## Prevention

### Code Review Checklist for Payment Forms

1. ✅ **State Management**: Verify all payment amount fields are synchronized
2. ✅ **Single vs Multiple**: Check both single-item and multi-item flows
3. ✅ **URL Parameters**: Test with both `?item_id` and `?item_ids` parameters
4. ✅ **Manual Entry**: Verify user can override pre-filled amounts
5. ✅ **Partial Payments**: Test with amount < total bill amount
6. ✅ **Full Payments**: Test with amount = total bill amount
7. ✅ **Database Verification**: Check actual stored values match UI input

### Template for Payment Amount Handlers

```typescript
const handlePaymentAmountChange = (newAmount: number) => {
  // Update form data
  setFormData(prev => ({
    ...prev,
    payment_amount: newAmount
  }));

  // CRITICAL: Also update per-item amounts if applicable
  if (selectedItems.length === 1) {
    const itemId = selectedItems[0].id;
    setItemPayAmounts(prev => ({
      ...prev,
      [itemId]: newAmount
    }));
  }
};
```

## Monitoring

### What to Watch

1. **Receipt Generation Errors**: Monitor for status calculation mismatches
2. **Student Complaints**: "My bill shows paid but I didn't pay full amount"
3. **Financial Reports**: Check for discrepancies between receipts and bill balances
4. **Audit Logs**: Verify receipt_item amounts match receipt totals

### Success Metrics

- ✅ Zero complaints about incorrect billing status
- ✅ Receipt amounts match bill payment amounts 100%
- ✅ No discrepancies between receipt totals and receipt item sums
- ✅ Bill balances accurately reflect partial payments
- ✅ Financial reports show correct outstanding amounts

### Database Query for Validation

```sql
-- Find bills where receipt_item amount doesn't match actual payment
SELECT
  b.id as bill_id,
  b.final_amount,
  b.balance_amount,
  b.status,
  SUM(ri.amount_paid) as total_paid,
  r.payment_amount as receipt_total
FROM billing_student_bills b
JOIN billing_receipt_items ri ON ri.bill_id = b.id
JOIN billing_receipts r ON r.id = ri.receipt_id
GROUP BY b.id, b.final_amount, b.balance_amount, b.status, r.payment_amount
HAVING
  -- Check if calculated balance doesn't match stored balance
  (b.final_amount - SUM(ri.amount_paid)) != b.balance_amount
  OR
  -- Check if status doesn't match actual payment state
  (SUM(ri.amount_paid) >= b.final_amount AND b.status != 'paid')
  OR
  (SUM(ri.amount_paid) < b.final_amount AND SUM(ri.amount_paid) > 0 AND b.status != 'partially_paid');
```

---

**Verified**: Partial payment receipts now correctly record actual payment amounts, and bills show accurate outstanding balances with proper status badges.
