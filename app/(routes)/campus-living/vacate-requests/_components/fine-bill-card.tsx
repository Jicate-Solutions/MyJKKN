'use client';

import { CheckCircle2, Loader2, ReceiptText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCompleteVacateAfterFine, useVacateFineBill } from '@/hooks/campus-living/use-hostel-vacate';
import { formatInr } from './bills-card';

/**
 * The damage fine raised at CAO approval. The vacate completes by itself the
 * moment this bill is paid; the manual button only appears if the bill is
 * settled but the request is still waiting (the automatic completion failed).
 */
export function FineBillCard({
  requestId,
  billId,
  requestStatus,
  canComplete,
}: {
  requestId: string;
  billId: string;
  requestStatus: string;
  canComplete: boolean;
}) {
  const { data: bill, isLoading } = useVacateFineBill(billId);
  const complete = useCompleteVacateAfterFine();

  const settled =
    !!bill && (Number(bill.balance_amount ?? 0) === 0 || ['cancelled', 'superseded'].includes(bill.status ?? ''));

  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-base flex items-center gap-2'>
          <ReceiptText className='h-4 w-4' />
          Damage Fine
        </CardTitle>
        <CardDescription>
          The learner is vacated and the room and bed are released as soon as this bill is paid.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-3'>
        {isLoading || !bill ? (
          <div className='flex justify-center py-4'>
            <Loader2 className='h-5 w-5 animate-spin text-primary' />
          </div>
        ) : (
          <>
            <div className='flex items-center justify-between gap-3 rounded-md border p-3'>
              <div className='min-w-0'>
                <p className='text-sm font-medium'>{formatInr(bill.final_amount)}</p>
                {bill.bill_description && (
                  <p className='text-xs text-muted-foreground break-words'>{bill.bill_description}</p>
                )}
                <p className='text-xs text-muted-foreground'>Due {bill.due_date}</p>
              </div>
              {settled ? (
                <Badge variant='success'>{bill.status === 'cancelled' ? 'Cancelled' : 'Paid'}</Badge>
              ) : (
                <Badge variant='secondary'>Unpaid · {formatInr(Number(bill.balance_amount ?? bill.final_amount))}</Badge>
              )}
            </div>
            {!settled && requestStatus === 'pending_fine' && (
              <p className='text-xs text-muted-foreground'>
                Waiting for payment. The learner can pay from their bills; Accounts can also record a payment.
              </p>
            )}
            {settled && requestStatus === 'pending_fine' && (
              <div className='space-y-2'>
                <p className='flex items-center gap-1.5 text-xs text-amber-700'>
                  <CheckCircle2 className='h-3.5 w-3.5' />
                  The fine is settled but the vacate has not completed yet.
                </p>
                {canComplete && (
                  <Button size='sm' onClick={() => complete.mutate(requestId)} disabled={complete.isPending}>
                    {complete.isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                    Complete vacate
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
