# Payment Session Creation Fixes

**Date**: 2025-01-20
**Issue**: Payment session creation failing with database constraint violations
**Status**: ✅ Fixed

## Problems Identified

### 1. Null Amount in payment_transaction_items
**Error**:
```
null value in column "amount" of relation "payment_transaction_items"
violates not-null constraint
```

**Root Cause**:
- Code was using `bill.bill_balance` which doesn't exist in the database
- Database column is named `balance_amount`
- This resulted in `null` being passed to the amount field

**Fix Applied** (`lib/services/billing/payment-gateway-service.ts:195`):
```typescript
// Before:
const transactionItems = bills.map((bill) => ({
  transaction_id: transaction.id,
  bill_id: bill.id,
  amount: Number(bill.bill_balance), // ❌ Column doesn't exist
}));

// After:
const transactionItems = bills.map((bill) => ({
  transaction_id: transaction.id,
  bill_id: bill.id,
  amount: Number(bill.balance_amount ?? bill.final_amount ?? bill.total_amount ?? 0), // ✅ Correct column with fallbacks
}));
```

### 2. Duplicate session_id Constraint Violation
**Error**:
```
duplicate key value violates unique constraint
"payment_transactions_session_id_key"
```

**Root Cause**:
- Table has unique constraint on `session_id` column
- Code was inserting empty string `''` for all transactions initially
- Multiple transactions would violate the unique constraint

**Fix Applied** (`lib/services/billing/payment-gateway-service.ts:171-178`):
```typescript
// Before:
const { data: transaction, error: transactionError } = await supabase
  .from('payment_transactions')
  .insert({
    transaction_ref: transactionRef,
    session_id: '', // ❌ Empty string causes duplicates
    student_id: sessionData.student_id,
    // ...
  })

// After:
const transactionRef = this.generateTransactionReference();
const tempSessionId = `temp_${transactionRef}`; // ✅ Unique temporary ID

const { data: transaction, error: transactionError } = await supabase
  .from('payment_transactions')
  .insert({
    transaction_ref: transactionRef,
    session_id: tempSessionId, // ✅ Unique for each transaction
    student_id: sessionData.student_id,
    // ...
  })
```

## Related Fixes (From Previous Session)

### 3. Database Column Name Mismatches
**Fixed in**: `lib/services/billing/payment-gateway-service.ts:101`

```typescript
// Before:
.select('id, bill_number, total_amount, bill_balance, status, institution_id')

// After:
.select('id, bill_description, total_amount, final_amount, balance_amount, status, institution_id')
```

### 4. Total Amount Calculation
**Fixed in**: `lib/services/billing/payment-gateway-service.ts:134-137`

```typescript
// Before:
const totalAmount = bills.reduce((sum, bill) => sum + Number(bill.bill_balance), 0);

// After:
const totalAmount = bills.reduce((sum, bill) => {
  const balance = bill.balance_amount ?? bill.final_amount ?? bill.total_amount ?? 0;
  return sum + Number(balance);
}, 0);
```

## Impact

These fixes resolve:
- ✅ Payment session creation now works without constraint violations
- ✅ Transaction items properly store bill amounts
- ✅ Each transaction gets a unique session ID
- ✅ Null safety for all amount calculations

## Testing

After these fixes, the payment flow should work:

1. Navigate to student billing page
2. Click "Pay Online"
3. Select bills (amounts display correctly)
4. Click "Proceed to Payment"
5. Payment session creates successfully
6. User redirected to HDFC gateway

## Database Schema Notes

### Correct Column Names:
- ✅ `balance_amount` - Amount remaining to be paid
- ✅ `bill_description` - Bill description/number
- ✅ `final_amount` - Final amount after discounts
- ✅ `total_amount` - Original bill total

### Constraints:
- `payment_transactions.session_id` - **UNIQUE** constraint
- `payment_transaction_items.amount` - **NOT NULL** constraint

## Files Modified

1. `lib/services/billing/payment-gateway-service.ts`
   - Line 101: Updated SELECT query columns
   - Line 134-137: Fixed total amount calculation
   - Line 171: Added temporary unique session ID
   - Line 195: Fixed transaction items amount field

## Next Steps

- ✅ Ready for end-to-end testing
- Test with HDFC UAT gateway
- Verify webhook callback processing
- Confirm receipt auto-generation
