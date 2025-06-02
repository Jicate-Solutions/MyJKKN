# Billing Refund Implementation

## Overview

This document outlines the comprehensive refund functionality implemented in the billing module. The system now properly handles refunds and their impact on student billing calculations, receipt displays, and overall financial reporting.

## Key Features Implemented

### 1. Automatic Amount Calculations

- **Student Paid Amount**: Now calculated as `Total Receipts - Processed Refunds`
- **Outstanding Amount**: Properly accounts for processed refunds when calculating what students still owe
- **Bill Status Updates**: Automatically recalculates bill status when refunds are processed

### 2. Visual Indicators

#### Receipt Page

- **Refunded Receipts**: Display original amount with strikethrough and red color
- **Refund Amount**: Shown in red with minus sign for processed refunds
- **Net Amount**: Clearly displayed in green showing effective receipt value
- **Refund Status**: Color-coded badges indicating refund status (pending, approved, processed)

#### Student Details Page

- **Net Paid Amount**: Shows actual amount after refunds
- **Refund Breakdown**: Displays refunded amount separately in red
- **Receipt Table**: Individual receipts show refund impact visually

### 3. Database-Level Automation

#### Triggers

- **Refund Status Change**: Automatically updates bill status when refund is processed
- **Bill Recalculation**: Triggers recalculation of bill balances and payment status
- **Outstanding Updates**: Automatically updates student outstanding amounts

#### Functions

- `calculate_student_outstanding()`: Updated to account for processed refunds
- `recalculate_bill_status_with_refunds()`: Recalculates bill status considering refunds
- `update_bill_on_refund_status_change()`: Handles automatic updates on refund processing

## Implementation Details

### 1. Service Layer Updates

#### Student Search Service (`lib/services/billing/schedule/student-search-service.ts`)

```typescript
// Updated calculation logic
const totalReceiptAmount = receipts?.reduce((sum, receipt) => sum + receipt.payment_amount, 0) || 0;
const totalProcessedRefunds = refunds
  ?.filter((refund) => refund.approval_status === 'processed')
  .reduce((sum, refund) => sum + refund.refund_amount, 0) || 0;
const paidAmount = totalReceiptAmount - totalProcessedRefunds;
```

#### Refund Service (`lib/services/billing/refunds/billing-refund-service.ts`)

```typescript
static async processRefund(id: string): Promise<BillingRefund> {
  // Updates refund status and triggers bill recalculation
  // Ensures all related bills are updated automatically
}
```

### 2. UI Component Updates

#### Receipt Details (`app/(routes)/billing/receipts/[id]/page.tsx`)

- Added refund totals calculation
- Visual indicators for refunded amounts
- Updated payment amount display with strikethrough for refunded receipts

#### Student Receipts Table (`app/(routes)/billing/schedule/students/[id]/_components/student-receipts-table.tsx`)

- Added refund information calculation helper
- Updated amount display to show refund impact
- Color-coded refunded vs. net amounts

#### Student Summary Cards (`app/(routes)/billing/schedule/students/[id]/page.tsx`)

- Updated to show net paid amount after refunds
- Added refund breakdown in summary display

### 3. Database Schema Updates

#### New Functions

```sql
-- Handles refund status changes and bill updates
CREATE OR REPLACE FUNCTION update_bill_on_refund_status_change()

-- Recalculates bill status considering processed refunds
CREATE OR REPLACE FUNCTION recalculate_bill_status_with_refunds(p_bill_id UUID)

-- Updated to account for refunds in outstanding calculation
CREATE OR REPLACE FUNCTION calculate_student_outstanding(student_uuid UUID)
```

#### New Triggers

```sql
-- Automatically handles bill updates when refund status changes
CREATE TRIGGER trigger_update_bill_on_refund_status_change
  AFTER UPDATE ON public.billing_refunds
```

## Behavior Flow

### When a Refund is Processed

1. **Status Update**: Refund status changes to 'processed'
2. **Database Trigger**: Automatically fires `update_bill_on_refund_status_change()`
3. **Bill Recalculation**: All related bills have their status and balance recalculated
4. **Outstanding Update**: Student's outstanding amount is recalculated
5. **UI Updates**: All displays automatically show updated amounts

### Visual Indicators

#### Receipt Status Indicators

- **Original Amount**: Red with strikethrough if refunded
- **Refund Amount**: Red with minus sign
- **Net Amount**: Green showing effective value
- **Status Badge**: Color-coded (pending: yellow, approved: blue, processed: green)

#### Student Summary

- **Paid Amount**: Shows net amount after refunds
- **Refund Breakdown**: Clearly shows how much was refunded
- **Outstanding**: Accurately reflects what student owes after refunds

## Testing Scenarios

### Test Case 1: Process a Refund

1. Create a receipt for a student
2. Create a refund request against the receipt
3. Process the refund (status → 'processed')
4. Verify:
   - Receipt page shows refunded amount in red
   - Student summary shows reduced paid amount
   - Bill status updated if applicable
   - Outstanding amount recalculated

### Test Case 2: Partial Refund

1. Create receipt for ₹1000
2. Process refund for ₹300
3. Verify:
   - Receipt shows ₹1000 (strikethrough) and net ₹700
   - Student paid amount reduced by ₹300
   - Visual indicators show partial refund

### Test Case 3: Full Refund

1. Create receipt for full bill amount
2. Process full refund
3. Verify:
   - Bill status reverts to unpaid
   - Student outstanding amount increases
   - All visual indicators show full refund

## Benefits

1. **Accuracy**: Financial calculations now properly account for refunds
2. **Transparency**: Clear visual indicators of refund impact
3. **Automation**: Reduces manual work and errors
4. **Consistency**: All displays show consistent refund-adjusted amounts
5. **Real-time**: Updates happen automatically when refunds are processed

## Future Enhancements

1. **Refund Analytics**: Dashboard showing refund trends and patterns
2. **Bulk Refund Processing**: Handle multiple refunds efficiently
3. **Refund Notifications**: Email/SMS notifications for refund status changes
4. **Advanced Reporting**: Detailed refund reports and reconciliation tools
