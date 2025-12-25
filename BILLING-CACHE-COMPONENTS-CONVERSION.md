# Billing Invoices Module - Cache Components Conversion

## ⚠️ CRITICAL STATUS

This conversion is **PARTIALLY COMPLETE** and requires significant additional work to finish.

## ✅ Completed Work

### 1. Server Data Fetchers Created
- ✅ `/app/(routes)/billing/invoices/_data/get-invoices.ts` - Invoice list with filters
- ✅ `/app/(routes)/billing/invoices/_data/get-invoice.ts` - Single invoice details
- ✅ `/app/(routes)/billing/receipts/_data/get-receipts.ts` - Receipt list with filters
- ✅ `/app/(routes)/billing/receipts/_data/get-receipt.ts` - Single receipt details

**Cache Strategy Applied:**
- **Profile**: `warm` (5 minutes TTL)
- **Rationale**: Financial data needs to be fairly fresh but not real-time
- **Tags**: Proper cache tags for invalidation by institution, student, and ID

## ❌ Remaining Work Required

### 2. Server Actions Needed
Create in `/app/(routes)/billing/_actions/`:

#### `/billing/_actions/invoice-actions.ts`
```typescript
'use server';

import { revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { cacheTags } from '@/lib/cache';
import type { CreateInvoiceDto, UpdateInvoiceDto } from '@/types/billing-schedule';

export async function createInvoice(data: CreateInvoiceDto) {
  const supabase = await createClient();

  // Generate invoice number
  const { data: invoiceNumber } = await supabase.rpc('generate_invoice_number');

  // Calculate grand total
  const grandTotal =
    data.invoice_items.reduce((sum, item) => sum + item.amount, 0) +
    (data.additional_charges || 0) -
    (data.discount_applied || 0);

  // Create invoice
  const { data: invoice, error } = await supabase
    .from('billing_invoices')
    .insert({
      invoice_number: invoiceNumber,
      ...data,
      grand_total: grandTotal
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Create invoice items
  if (data.invoice_items.length > 0) {
    await supabase
      .from('billing_invoice_items')
      .insert(
        data.invoice_items.map(item => ({
          invoice_id: invoice.id,
          ...item
        }))
      );
  }

  // Invalidate caches
  revalidateTag(cacheTags.billing.invoices.list());
  if (data.student_id) {
    revalidateTag(cacheTags.billing.invoices.byStudent(data.student_id));
  }
  if (data.institution_id) {
    revalidateTag(cacheTags.billing.invoices.byInstitution(data.institution_id));
  }

  return invoice;
}

export async function updateInvoice(id: string, data: UpdateInvoiceDto) {
  const supabase = await createClient();

  const { data: invoice, error } = await supabase
    .from('billing_invoices')
    .update(data)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Invalidate caches
  revalidateTag(cacheTags.billing.invoices.byId(id));
  revalidateTag(cacheTags.billing.invoices.list());

  return invoice;
}

export async function deleteInvoice(id: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('billing_invoices')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);

  // Invalidate caches
  revalidateTag(cacheTags.billing.invoices.byId(id));
  revalidateTag(cacheTags.billing.invoices.list());
}

export async function sendInvoice(id: string, email: string) {
  // TODO: Implement email sending via Edge Function or external service
  console.log('Send invoice:', id, email);
}

export async function downloadInvoicePDF(id: string) {
  // TODO: Implement PDF generation
  console.log('Download PDF:', id);
}
```

#### `/billing/_actions/receipt-actions.ts`
```typescript
'use server';

import { revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { cacheTags } from '@/lib/cache';
import type { CreateReceiptDto, UpdateReceiptDto } from '@/types/billing-schedule';

export async function createReceipt(data: CreateReceiptDto) {
  const supabase = await createClient();

  // Generate receipt number
  const { data: receiptNumber } = await supabase.rpc('generate_receipt_number');

  // Create receipt
  const { data: receipt, error } = await supabase
    .from('billing_receipts')
    .insert({
      receipt_number: receiptNumber,
      ...data
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Create receipt items
  if (data.receipt_items && data.receipt_items.length > 0) {
    await supabase
      .from('billing_receipt_items')
      .insert(
        data.receipt_items.map(item => ({
          receipt_id: receipt.id,
          ...item
        }))
      );
  }

  // Invalidate caches
  revalidateTag(cacheTags.billing.receipts.list());
  if (data.student_id) {
    revalidateTag(cacheTags.billing.receipts.byStudent(data.student_id));
  }
  revalidateTag(cacheTags.billing.bills.list());

  return receipt;
}

export async function updateReceipt(id: string, data: UpdateReceiptDto) {
  const supabase = await createClient();

  const { data: receipt, error } = await supabase
    .from('billing_receipts')
    .update(data)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Invalidate caches
  revalidateTag(cacheTags.billing.receipts.byId(id));
  revalidateTag(cacheTags.billing.receipts.list());

  return receipt;
}

export async function deleteReceipt(id: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('billing_receipts')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);

  // Invalidate caches
  revalidateTag(cacheTags.billing.receipts.byId(id));
  revalidateTag(cacheTags.billing.receipts.list());
}
```

### 3. Page Conversions Required

#### `/billing/invoices/page.tsx`
**Current**: Client component using React Query
**Target**: Server component using server data fetching

```typescript
import { getInvoices } from './_data/get-invoices';
import { InvoiceList } from './_components/invoice-list';
import { InvoiceFilters } from './_components/invoice-filters';

export default async function BillingInvoicesPage({
  searchParams
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const params = await searchParams;

  const filters = {
    page: params.page ? parseInt(params.page) : 1,
    limit: params.limit ? parseInt(params.limit) : 10,
    search: params.search,
    institution_id: params.institution_id,
    student_id: params.student_id,
    invoice_type: params.invoice_type
  };

  const { data: invoices, metadata } = await getInvoices(filters);

  return (
    <ContentLayout title='Billing Invoices'>
      <PageBreadcrumb items={[...]} />

      <InvoiceFilters />
      <InvoiceList invoices={invoices} metadata={metadata} />
    </ContentLayout>
  );
}
```

**Note**: Convert filter components to use form actions and URL params instead of client state.

#### `/billing/invoices/[id]/page.tsx`
```typescript
import { getInvoice } from '../_data/get-invoice';
import { InvoiceActions } from './_components/invoice-actions'; // Client component for actions

export default async function InvoiceDetailsPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const invoice = await getInvoice(id);

  return (
    <ContentLayout title={`Invoice ${invoice.invoice_number}`}>
      {/* Render invoice details */}
      <InvoiceActions invoice={invoice} /> {/* Client component for actions */}
    </ContentLayout>
  );
}
```

#### Similar conversions needed for:
- `/billing/receipts/page.tsx`
- `/billing/receipts/[id]/page.tsx`
- `/billing/refunds/page.tsx`
- `/billing/schedule/page.tsx`

### 4. Client Components for Interactive Features

Create client components in `_components/` directories:

#### `_components/invoice-actions.tsx`
```typescript
'use client';

import { sendInvoice, downloadInvoicePDF, deleteInvoice } from '../_actions/invoice-actions';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';

export function InvoiceActions({ invoice }) {
  const router = useRouter();

  async function handleSend() {
    try {
      await sendInvoice(invoice.id, invoice.student.college_email);
      toast.success('Invoice sent successfully');
    } catch (error) {
      toast.error('Failed to send invoice');
    }
  }

  async function handleDelete() {
    try {
      await deleteInvoice(invoice.id);
      router.push('/billing/invoices');
      toast.success('Invoice deleted');
    } catch (error) {
      toast.error('Failed to delete invoice');
    }
  }

  return (
    <div className='flex gap-2'>
      <Button onClick={handleSend}>Send Email</Button>
      <Button onClick={() => downloadInvoicePDF(invoice.id)}>Download PDF</Button>
      <Button variant='destructive' onClick={handleDelete}>Delete</Button>
    </div>
  );
}
```

### 5. Types Need Review

Ensure all TypeScript types in `/types/billing-schedule.ts` are compatible with server components.

### 6. Cache Tag Management

Update `/lib/cache/cache-tags.ts` if needed to include refund tags:

```typescript
billing: {
  // ... existing
  refunds: {
    list: () => CACHE_TAG_PREFIXES.REFUNDS,
    byId: (id: string) => `${CACHE_TAG_PREFIXES.REFUNDS}-${id}`,
    byReceipt: (receiptId: string) => `${CACHE_TAG_PREFIXES.REFUNDS}-receipt-${receiptId}`
  }
}
```

## 🚧 Breaking Changes

1. **React Query Removed**: All `useQuery`, `useMutation`, `useQueryClient` removed
2. **Client State → URL Params**: Filters now use searchParams instead of useState
3. **Hooks Deprecated**: `use-billing-invoices.ts`, `use-billing-receipts.ts`, etc. no longer used
4. **Direct Service Calls**: Services no longer called from client, only from server actions

## 🧪 Testing Checklist

- [ ] Invoice list loads with filters
- [ ] Invoice detail page displays correctly
- [ ] Create invoice works
- [ ] Update invoice works
- [ ] Delete invoice works
- [ ] Send invoice email works
- [ ] Download PDF works
- [ ] Receipt list loads
- [ ] Receipt detail page displays
- [ ] Receipt creation works
- [ ] Refund list loads
- [ ] Refund creation works
- [ ] Financial totals are accurate
- [ ] Cache invalidation works correctly
- [ ] TypeScript: 0 errors
- [ ] Build succeeds

## 📊 Performance Expectations

**Before (Client Components + React Query)**:
- Initial page load: ~2.5s
- Client-side data fetching: ~500ms
- Bundle size: +150KB (React Query + hooks)

**After (Server Components + Cache)**:
- Initial page load: ~800ms (server-rendered)
- No client-side data fetching needed
- Bundle size: -150KB (no React Query)
- Cache hit: ~50ms (5min TTL)

## 🔄 Migration Path

1. Create all server data fetchers (`_data/` directories) ✅ DONE
2. Create all server actions (`_actions/` directory) ❌ TODO
3. Convert pages one by one ❌ TODO
4. Create client components for interactive features ❌ TODO
5. Test each route thoroughly ❌ TODO
6. Remove old hooks and services ❌ TODO

## ⚠️ Critical Notes

1. **PDF Generation**: Currently using client-side HTML download. Should migrate to server-side PDF generation using Puppeteer or similar.

2. **Email Sending**: Needs Supabase Edge Function or external email service integration.

3. **Financial Data Accuracy**: MUST test thoroughly. Any bugs in calculations or cache invalidation could cause serious financial discrepancies.

4. **Payment Callbacks**: Keep as API routes (not converted to server actions).

5. **Permission Checks**: Implement in server actions and data fetchers, not just in UI.

## 📝 Next Steps

**IMMEDIATE TODO**:
1. Complete server actions for invoices, receipts, refunds
2. Convert `/billing/invoices/page.tsx` to server component
3. Convert `/billing/invoices/[id]/page.tsx` to server component
4. Create client components for forms and actions
5. Test invoice flows end-to-end

**Estimated Time Remaining**: 8-12 hours of focused work

**Priority**: HIGH (Financial module, affects billing accuracy)

---

**Created**: 2025-12-25
**Status**: IN PROGRESS (15% complete)
**Assigned**: Claude Code Session
