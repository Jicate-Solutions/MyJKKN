// HDFC Payment Callback Handler
// Purpose: Handle POST callback from HDFC SmartGateway after payment
// This API route accepts POST requests from HDFC and redirects to the success page

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    console.log('[billing/payment-callback] Received HDFC POST callback');

    // Extract data from different possible sources
    const searchParams = request.nextUrl.searchParams;
    let formData: FormData | null = null;

    // Try to parse form data
    try {
      formData = await request.formData();
    } catch (e) {
      console.log('[billing/payment-callback] No form data in POST request');
    }

    // Extract transaction_id from query params (our return_url includes this)
    let ourTransactionId = searchParams.get('transaction_id');

    // Extract HDFC response data from form or query params
    const hdfcOrderId =
      formData?.get('order_id')?.toString() || searchParams.get('order_id') || '';
    const hdfcStatus =
      formData?.get('status')?.toString() ||
      formData?.get('order_status')?.toString() ||
      searchParams.get('order_status') || '';
    const hdfcTransactionId =
      formData?.get('transaction_id')?.toString() ||
      formData?.get('cf_payment_id')?.toString() ||
      searchParams.get('hdfc_transaction_id') ||
      '';

    // Log all received data
    console.log('[billing/payment-callback] Callback data', {
      ourTransactionId,
      hdfcOrderId,
      hdfcStatus,
      hdfcTransactionId,
      hasFormData: formData !== null,
      formDataKeys: formData ? Array.from(formData.keys()) : [],
      searchParamsKeys: Array.from(searchParams.keys()),
      allFormData: formData
        ? Object.fromEntries(
            Array.from(formData.entries()).map(([k, v]) => [k, v.toString()])
          )
        : null,
    });

    // If we don't have our transaction_id from URL, look it up using HDFC's order_id
    if (!ourTransactionId && hdfcOrderId) {
      console.log('[billing/payment-callback] Looking up transaction by order_id', { hdfcOrderId });

      // Use service role client to bypass RLS (HDFC callbacks are not authenticated)
      const supabase = createServiceRoleClient() as any;
      const { data: transaction, error: lookupError } = (await supabase
        .from('payment_transactions')
        .select('id')
        .eq('transaction_ref', hdfcOrderId)
        .single()) as any;

      if (lookupError) {
        console.error('[billing/payment-callback] Transaction lookup failed', lookupError);
      }

      if (transaction) {
        ourTransactionId = transaction.id;
        console.log('[billing/payment-callback] Found transaction', { ourTransactionId });
      } else {
        console.warn('[billing/payment-callback] No transaction found for order_id', { hdfcOrderId });
      }
    }

    // Log before status update to debug
    console.log('[billing/payment-callback] Before status update check', {
      hasTransactionId: !!ourTransactionId,
      hasStatus: !!hdfcStatus,
      transactionId: ourTransactionId,
      status: hdfcStatus,
    });

    // Track receipt ID for redirect (must be outside the if block)
    let receiptId: string | null = null;

    // IMPORTANT: Update payment status if we have status from HDFC
    // This is a TEMPORARY solution until webhooks are configured
    if (ourTransactionId && hdfcStatus) {
      console.log('[billing/payment-callback] Updating transaction status', {
        transaction_id: ourTransactionId,
        status: hdfcStatus,
      });

      // Use service role client to bypass RLS
      const supabase = createServiceRoleClient() as any;

      // Map HDFC status to our status
      let newStatus: 'processing' | 'success' | 'failed' | 'cancelled' = 'processing';
      if (hdfcStatus === 'CHARGED' || hdfcStatus === 'SUCCESS' || hdfcStatus === 'COMPLETED') {
        newStatus = 'success';
      } else if (hdfcStatus === 'FAILED' || hdfcStatus === 'DECLINED') {
        newStatus = 'failed';
      } else if (hdfcStatus === 'CANCELLED' || hdfcStatus === 'EXPIRED') {
        newStatus = 'cancelled';
      }

      // Update transaction
      const { error: updateError } = (await supabase
        .from('payment_transactions')
        .update({
          status: newStatus,
          gateway_transaction_id: hdfcTransactionId || hdfcOrderId,
          payment_method: 'CARD', // HDFC sends card payments
          payment_date: new Date().toISOString(),
          completed_at: newStatus !== 'processing' ? new Date().toISOString() : null,
        })
        .eq('id', ourTransactionId)) as any;

      if (updateError) {
        console.error('[billing/payment-callback] Failed to update transaction', updateError);
      } else {
        console.log('[billing/payment-callback] Transaction updated successfully', {
          transaction_id: ourTransactionId,
          newStatus,
        });

        // If payment successful, create receipt immediately
        if (newStatus === 'success') {
          console.log('[billing/payment-callback] Payment successful, creating receipt');

          try {
            // Fetch transaction details
            const { data: txn } = (await supabase
              .from('payment_transactions')
              .select('*')
              .eq('id', ourTransactionId)
              .single()) as any;

            if (!txn) {
              console.error('[billing/payment-callback] Transaction not found');
              return;
            }

            // Fetch transaction items (bill IDs and amounts)
            const { data: items } = (await supabase
              .from('payment_transaction_items')
              .select('bill_id, amount')
              .eq('transaction_id', ourTransactionId)) as any;

            if (!items || items.length === 0) {
              console.error('[billing/payment-callback] No transaction items found');
              return;
            }

            // Generate receipt number
            const { data: receiptNumber } = await supabase.rpc('generate_receipt_number');

            if (!receiptNumber) {
              console.error('[billing/payment-callback] Failed to generate receipt number');
              throw new Error('Failed to generate receipt number');
            }

            // Fetch student details for payer name
            const { data: student } = (await supabase
              .from('students')
              .select('first_name, last_name, student_mobile')
              .eq('id', txn.student_id)
              .single()) as any;

            const payerName = student ? `${student.first_name} ${student.last_name}` : 'Student';

            // Create receipt
            const { data: receipt, error: receiptError } = (await supabase
              .from('billing_receipts')
              .insert({
                receipt_number: receiptNumber,
                receipt_date: new Date().toISOString().split('T')[0],
                student_id: txn.student_id,
                institution_id: txn.institution_id,
                payment_mode: 'online',
                payment_reference_number: txn.gateway_transaction_id || txn.transaction_ref,
                payment_amount: txn.total_amount,
                payment_paid_date: new Date().toISOString().split('T')[0],
                payer_name: payerName,
                payer_contact: student?.student_mobile || '',
                payment_remarks: `Online payment via HDFC SmartGateway - ${txn.payment_method || 'CARD'}`,
                created_by: txn.student_id, // Self-payment
              })
              .select()
              .single()) as any;

            if (receiptError || !receipt) {
              console.error('[billing/payment-callback] Failed to create receipt', receiptError);
              return;
            }

            receiptId = receipt.id; // Store receipt ID for redirect
            console.log('[billing/payment-callback] Receipt created', { receipt_id: receipt.id });

            // Create receipt items
            const receiptItems = items.map((item: any) => ({
              receipt_id: receipt.id,
              bill_id: item.bill_id,
              amount_paid: item.amount,
            }));

            const { error: itemsError } = (await supabase
              .from('billing_receipt_items')
              .insert(receiptItems)) as any;

            if (itemsError) {
              console.error('[billing/payment-callback] Failed to create receipt items', itemsError);
              return;
            }

            console.log('[billing/payment-callback] Receipt items created successfully');

            // Update bill statuses
            for (const item of items as any[]) {
              // Calculate total paid for this bill
              const { data: totalPaid } = (await supabase
                .from('billing_receipt_items')
                .select('amount_paid')
                .eq('bill_id', item.bill_id)) as any;

              const paid = totalPaid?.reduce((sum: number, r: any) => sum + Number(r.amount_paid), 0) || 0;

              // Get bill details
              const { data: bill } = (await supabase
                .from('billing_student_bills')
                .select('final_amount')
                .eq('id', item.bill_id)
                .single()) as any;

              if (bill) {
                const balance = Number(bill.final_amount) - paid;
                const newStatus = balance <= 0 ? 'paid' : paid > 0 ? 'partially_paid' : 'pending';

                await (supabase
                  .from('billing_student_bills')
                  .update({
                    balance_amount: balance,
                    status: newStatus,
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', item.bill_id) as any);

                console.log('[billing/payment-callback] Bill updated', {
                  bill_id: item.bill_id,
                  balance,
                  status: newStatus,
                });
              }
            }

            console.log('[billing/payment-callback] All bill statuses updated');
          } catch (receiptErr) {
            console.error('[billing/payment-callback] Receipt generation error', receiptErr);
          }
        }
      }
    }

    // Build redirect URL to success page
    if (ourTransactionId) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const redirectUrl = new URL(`/billing/payment/success`, baseUrl);

      // Add transaction_id as query param
      redirectUrl.searchParams.set('transaction_id', ourTransactionId);

      // Add receipt_id if available (for redirecting to receipt page)
      if (receiptId) {
        redirectUrl.searchParams.set('receipt_id', receiptId);
      }

      // Add HDFC response data for reference
      if (hdfcOrderId) redirectUrl.searchParams.set('hdfc_order_id', hdfcOrderId);
      if (hdfcStatus) redirectUrl.searchParams.set('hdfc_status', hdfcStatus);
      if (hdfcTransactionId) redirectUrl.searchParams.set('hdfc_transaction_id', hdfcTransactionId);

      console.log('[billing/payment-callback] Redirecting to success page', {
        redirectUrl: redirectUrl.toString(),
        hasReceiptId: !!receiptId,
      });

      // Use 303 See Other to convert POST to GET
      return NextResponse.redirect(redirectUrl, 303);
    }

    // If no transaction_id, log all data and redirect to billing
    console.warn('[billing/payment-callback] No transaction_id found', {
      searchParams: Object.fromEntries(searchParams.entries()),
      formData: formData
        ? Object.fromEntries(
            Array.from(formData.entries()).map(([k, v]) => [k, v.toString()])
          )
        : null,
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return NextResponse.redirect(new URL('/billing/schedule/students', baseUrl), 303);
  } catch (error) {
    console.error('[billing/payment-callback] Error processing callback', error);

    // Redirect to billing page on error
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return NextResponse.redirect(new URL('/billing/schedule/students', baseUrl), 303);
  }
}

// Also handle GET requests (for testing)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const transactionId = searchParams.get('transaction_id');

  console.log('[billing/payment-callback] GET request received', {
    transactionId,
    allParams: Object.fromEntries(searchParams.entries()),
  });

  if (transactionId) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const redirectUrl = new URL(`/billing/payment/success`, baseUrl);
    redirectUrl.searchParams.set('transaction_id', transactionId);

    // Copy all other query params
    searchParams.forEach((value, key) => {
      if (key !== 'transaction_id') {
        redirectUrl.searchParams.set(key, value);
      }
    });

    return NextResponse.redirect(redirectUrl, 303);
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return NextResponse.redirect(new URL('/billing/schedule/students', baseUrl), 303);
}
