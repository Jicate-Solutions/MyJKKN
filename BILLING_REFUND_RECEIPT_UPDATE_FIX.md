# Billing Refund Receipt Update Fix

## Issue Description

When processing a refund from a receipt details page:

- ✅ **Working**: Student details page properly updates with reduced paid amount
- ❌ **Not Working**: Receipt details page was not updating to show refund status and visual indicators

## Root Cause Analysis

The issue was caused by insufficient cache invalidation and timing problems in the React Query cache management:

1. **Insufficient Cache Invalidation**: The `useCreateBillingRefund` hook was not specifically invalidating the individual receipt query
2. **Timing Issues**: The receipt refresh was happening before the backend completed the refund processing
3. **Generic Invalidation**: Only generic query keys were being invalidated, not the specific receipt ID

## Solutions Implemented

### 1. Enhanced Cache Invalidation in `useCreateBillingRefund`

**File**: `hooks/billing/use-billing-refunds.ts`

```typescript
export function useCreateBillingRefund() {
  return useMutation({
    mutationFn: (data: CreateRefundDto) => BillingRefundService.createBillingRefund(data),
    onSuccess: (refund) => {
      // Invalidate refund queries
      queryClient.invalidateQueries({ queryKey: ['billing-refunds'] });

      // Invalidate receipt queries - both list and specific receipt
      queryClient.invalidateQueries({ queryKey: ['billing-receipts'] });
      queryClient.invalidateQueries({ queryKey: ['billing-receipt'] });

      // 🔥 NEW: Specifically invalidate the receipt that this refund is for
      if (refund.receipt_id) {
        queryClient.invalidateQueries({
          queryKey: ['billing-receipt', refund.receipt_id]
        });
      }

      // Invalidate student bill queries since refunds affect outstanding amounts
      queryClient.invalidateQueries({ queryKey: ['student-bills'] });
      // ... additional invalidations
    }
  });
}
```

### 2. Improved Timing in Receipt Page Callback

**File**: `app/(routes)/billing/receipts/[id]/page.tsx`

```typescript
{canCreateRefunds && (
  <ReceiptRefundDialog
    receipt={receipt}
    onRefundCreated={() => {
      // 🔥 NEW: Add delay to ensure backend processing is complete
      setTimeout(() => {
        refetch();
      }, 500);
    }}
  />
)}
```

### 3. Better Sequencing in Refund Dialog

**File**: `app/(routes)/billing/receipts/[id]/_components/receipt-refund-dialog.tsx`

```typescript
const createdRefund = await createRefundMutation.mutateAsync(refundData);

toast.success('Refund request created successfully');
setOpen(false);

// 🔥 NEW: Call callback first to refresh receipt data
onRefundCreated?.();

// 🔥 NEW: Add delay before redirecting to ensure data refresh completes
setTimeout(() => {
  router.push(`/billing/refunds/${createdRefund.id}`);
}, 1000);
```

### 4. Enhanced Process/Approve Refund Hooks

Updated `useProcessRefund` and `useApproveRefund` to also invalidate receipt queries:

```typescript
onSuccess: (processedRefund) => {
  // Invalidate receipt queries since processing affects receipt display
  queryClient.invalidateQueries({ queryKey: ['billing-receipts'] });
  queryClient.invalidateQueries({ queryKey: ['billing-receipt'] });

  // Specifically invalidate the receipt that this refund is for
  if (processedRefund.receipt_id) {
    queryClient.invalidateQueries({
      queryKey: ['billing-receipt', processedRefund.receipt_id]
    });
  }
  // ... additional invalidations
}
```

## Visual Indicators on Receipt Page

The receipt page already had the correct visual logic, which now works properly:

### 1. Payment Amount Display

- **Original Amount**: Shows with strikethrough and red color when refunded
- **Refunded Label**: "(Refunded)" indicator next to original amount
- **Net Amount**: Displays the amount after refunds in green

### 2. Refund History Table

- **Processed Refunds**: Show with red color and minus sign
- **Refund Status**: Visual badges for different statuses
- **Refund Summary**: Shows total refunded and net amounts

### 3. Status Calculations

```typescript
// Calculate refund totals
const processedRefunds = receipt.refunds?.filter((r) => r.approval_status === 'processed') || [];
const totalProcessedRefunds = processedRefunds.reduce((sum, r) => sum + r.refund_amount, 0);
const hasProcessedRefunds = processedRefunds.length > 0;
const netReceiptAmount = receipt.payment_amount - totalProcessedRefunds;
```

## User Experience Flow (After Fix)

1. **User clicks "Process Refund"** on receipt page
2. **Fills out refund form** with required details
3. **Clicks "Create Refund Request"**
4. **System processes** and creates the refund
5. **Success toast appears**
6. **Dialog closes**
7. **Receipt data refreshes** (with 500ms delay for backend processing)
8. **Visual indicators update**:
   - Original amount shows strikethrough + red color
   - "(Refunded)" label appears
   - Net amount displays in green
   - Refund history table shows new refund
9. **Page redirects** to refund details (after 1000ms delay)

## Benefits

- ✅ **Real-time Updates**: Receipt page immediately shows refund status
- ✅ **Visual Clarity**: Clear indicators for refunded amounts
- ✅ **Proper Sequencing**: Data refreshes before navigation
- ✅ **Comprehensive Cache Management**: All related queries are invalidated
- ✅ **Consistent Behavior**: Works for create, approve, and process refund operations

## Testing

To test the fix:

1. Go to any receipt details page
2. Click "Process Refund"
3. Fill out the refund form
4. Submit the refund
5. **Expected Result**:
   - Receipt page should immediately show the refunded amount with visual indicators
   - Should redirect to refund details page after brief delay
   - Student details page should also show updated amounts

The fix ensures that both the receipt page AND student details page stay synchronized with refund data in real-time.
