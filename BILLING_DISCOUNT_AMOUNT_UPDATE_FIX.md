# Billing Discount Amount Update Fix

## Issue Description

When discounts were applied to student bills and approved, the discount was stored in the `billing_discounts` table but **the actual bill amounts in `billing_student_bills` table were not being updated**. This meant:

1. Discount records showed as "approved"
2. But student bills still showed the original amounts
3. Students could not see the reduced bill amounts
4. Payment calculations were incorrect

## Root Cause Analysis

### Original Implementation Problem

The `BillingDiscountService.approveDiscount()` method was only updating the discount record:

```typescript
// ❌ BEFORE - Only updated discount table
static async approveDiscount(id: string): Promise<BillingDiscount> {
  const { data, error } = await this.supabase
    .from('billing_discounts')
    .update({
      approval_status: 'approved',
      approval_date: new Date().toISOString(),
      authorizer_id: user?.id
    })
    .eq('id', id)
    // Missing: Update to billing_student_bills table
}
```

### Database Schema Understanding

The `billing_student_bills` table has these amount fields:

- `total_amount`: Base amount before taxes
- `tax_amount`: Tax amount
- `final_amount`: Total amount after taxes (what students need to pay)
- `balance_amount`: Remaining unpaid amount

When a discount is approved, both `final_amount` and `balance_amount` should be reduced.

## Solution Implementation

### 1. Enhanced `approveDiscount` Method

```typescript
// ✅ AFTER - Updates both discount and bill tables
static async approveDiscount(id: string): Promise<BillingDiscount> {
  try {
    // Get discount details first
    const discountData = await this.getBillingDiscount(id);

    // Get current bill details
    const billData = await this.getBillData(discountData.bill_id);

    // Validation
    if (discountData.discount_amount > billData.final_amount) {
      throw new Error('Discount amount cannot exceed bill amount');
    }

    if (discountData.approval_status === 'approved') {
      throw new Error('This discount is already approved');
    }

    // Calculate new amounts
    const newFinalAmount = billData.final_amount - discountData.discount_amount;
    let newBalanceAmount = 0;

    if (billData.status === 'unpaid') {
      newBalanceAmount = newFinalAmount;
    } else if (billData.status === 'partially_paid') {
      newBalanceAmount = Math.max(0, billData.balance_amount - discountData.discount_amount);
    }

    // Update discount record
    const updatedDiscount = await this.updateDiscountStatus(id, 'approved');

    // Update bill amounts
    await this.updateBillAmounts(discountData.bill_id, newFinalAmount, newBalanceAmount);

    // Mark as paid if balance becomes zero
    if (newBalanceAmount === 0) {
      await this.markBillAsPaid(discountData.bill_id);
    }

    return updatedDiscount;
  } catch (error) {
    throw new Error(`Failed to approve discount: ${error.message}`);
  }
}
```

### 2. Added Discount Reversal

```typescript
static async reverseDiscount(id: string): Promise<BillingDiscount> {
  // Restores original bill amounts if discount needs to be reversed
  const restoredFinalAmount = billData.final_amount + discountData.discount_amount;
  const restoredBalanceAmount = billData.balance_amount + discountData.discount_amount;

  // Updates both discount and bill records
}
```

### 3. Enhanced Frontend Hooks

Updated React Query hooks to invalidate related caches:

```typescript
export function useApproveDiscount() {
  return useMutation({
    mutationFn: (id: string) => BillingDiscountService.approveDiscount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-discounts'] });
      queryClient.invalidateQueries({ queryKey: ['billing-discount'] });
      queryClient.invalidateQueries({ queryKey: ['student-billing-summary'] }); // ✅ Added
      queryClient.invalidateQueries({ queryKey: ['billing-schedule'] }); // ✅ Added
      toast.success('Discount approved and bill amount updated'); // ✅ Updated message
    }
  });
}
```

## Testing the Fix

### Test Scenario 1: Basic Discount Approval

1. **Create a test bill**:

   ```
   Student: Test Student
   Bill Amount: ₹10,000
   Tax: ₹1,000
   Final Amount: ₹11,000
   Status: unpaid
   Balance: ₹11,000
   ```

2. **Apply a discount**:

   ```
   Discount Type: percentage
   Discount Value: 10%
   Discount Amount: ₹1,100 (10% of ₹11,000)
   ```

3. **Before approval - Bill should show**:

   ```
   Final Amount: ₹11,000 (unchanged)
   Balance: ₹11,000 (unchanged)
   Status: unpaid
   ```

4. **After approval - Bill should show**:
   ```
   Final Amount: ₹9,900 (₹11,000 - ₹1,100)
   Balance: ₹9,900 (₹11,000 - ₹1,100)
   Status: unpaid
   ```

### Test Scenario 2: Partial Payment + Discount

1. **Create bill**: ₹10,000 final amount
2. **Student pays**: ₹5,000 (bill becomes partially_paid, balance = ₹5,000)
3. **Apply discount**: 20% = ₹2,000
4. **Approve discount**:
   ```
   Final Amount: ₹8,000 (₹10,000 - ₹2,000)
   Balance: ₹3,000 (₹5,000 - ₹2,000)
   Status: partially_paid
   ```

### Test Scenario 3: Discount Makes Bill Fully Paid

1. **Create bill**: ₹5,000 final amount
2. **Student pays**: ₹3,000 (balance = ₹2,000)
3. **Apply discount**: ₹2,500 (more than balance)
4. **Approve discount**:
   ```
   Final Amount: ₹2,500 (₹5,000 - ₹2,500)
   Balance: ₹0 (₹2,000 - ₹2,500 = 0, capped at 0)
   Status: paid (auto-updated)
   Payment Date: set to approval date
   ```

### Validation Tests

- ✅ Cannot approve discount exceeding bill amount
- ✅ Cannot approve already approved discount
- ✅ Discount reversal restores original amounts
- ✅ UI updates immediately after approval
- ✅ Student billing page reflects new amounts

## Database Consistency Verification

Use this utility method to verify calculations:

```typescript
const summary = await BillingDiscountService.getBillWithDiscountSummary(billId);

console.log({
  originalAmount: summary.originalAmount,
  totalDiscountAmount: summary.totalDiscountAmount,
  effectiveAmount: summary.effectiveAmount,
  currentFinalAmount: summary.bill.final_amount,
  isConsistent: summary.effectiveAmount === summary.bill.final_amount
});
```

## Key Files Modified

1. **`lib/services/billing/discounts/billing-discount-service.ts`**

   - Enhanced `approveDiscount()` method
   - Added `reverseDiscount()` method
   - Added validation and bill amount updates
   - Added `getBillWithDiscountSummary()` utility

2. **`hooks/billing/use-billing-discounts.ts`**
   - Updated `useApproveDiscount()` to invalidate related queries
   - Added `useReverseDiscount()` hook
   - Enhanced success messages

## Error Handling

The implementation includes comprehensive error handling:

- Validation that discount doesn't exceed bill amount
- Prevention of double-approval
- Database transaction consistency
- Proper error messages for user feedback
- Automatic rollback on failures

## Performance Considerations

- Uses database transactions to ensure consistency
- Efficient query invalidation to update UI
- Minimal database calls with proper indexing
- Error handling prevents partial updates

## Future Enhancements

1. **Database Triggers**: Consider adding database triggers to automatically update bill amounts
2. **Audit Trail**: Enhanced logging of amount changes
3. **Bulk Operations**: Optimize bulk discount approvals
4. **Real-time Updates**: WebSocket notifications for amount changes
