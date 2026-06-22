'use client';

import type { ReactNode } from 'react';
import { Receipt, Wallet, CheckCircle2, CalendarClock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { BillingCategoryKind, MyBillsData } from '@/types/billing';

// Human label for the fee head (billing_categories.kind). Kept inline to avoid
// pulling the admin category form into this student-facing bundle.
const FEE_HEAD_LABELS: Record<BillingCategoryKind, string> = {
  tuition: 'Tuition',
  university_fee: 'University',
  establishment: 'Establishment',
  hostel: 'Hostel',
  mess: 'Mess',
  transport: 'Transport',
  exam: 'Exam',
  application_fee: 'Application',
  library: 'Library',
  other: 'Other',
};

const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(n);

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

interface MyBillsClientProps {
  data: MyBillsData;
  learnerName: string;
  rollNumber: string;
  institutionName: string;
}

export function MyBillsClient({ data, learnerName, rollNumber, institutionName }: MyBillsClientProps) {
  const { totalDue, bills, receipts } = data;

  return (
    <div className='space-y-6'>
      {/* Summary header */}
      <Card>
        <CardContent className='flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between'>
          <div className='space-y-0.5'>
            {learnerName && <div className='text-lg font-semibold'>{learnerName}</div>}
            <div className='text-sm text-muted-foreground'>
              {[rollNumber, institutionName].filter(Boolean).join(' · ') || 'Fee summary'}
            </div>
          </div>
          <div className='sm:text-right'>
            <div className='text-xs uppercase tracking-wide text-muted-foreground'>Total Due</div>
            <div className={`text-2xl font-bold ${totalDue > 0 ? 'text-destructive' : 'text-emerald-600'}`}>
              {inr(totalDue)}
            </div>
            <div className='text-xs text-muted-foreground'>
              {bills.length} outstanding {bills.length === 1 ? 'bill' : 'bills'}
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue='outstanding' className='w-full'>
        <TabsList>
          <TabsTrigger value='outstanding' className='gap-1.5'>
            <Wallet className='h-4 w-4' /> Outstanding
            {bills.length > 0 && <Badge variant='secondary' className='ml-1'>{bills.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value='paid' className='gap-1.5'>
            <Receipt className='h-4 w-4' /> Paid
            {receipts.length > 0 && <Badge variant='secondary' className='ml-1'>{receipts.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* Outstanding bills */}
        <TabsContent value='outstanding' className='mt-4 space-y-3'>
          {bills.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className='h-8 w-8 text-emerald-600' />}
              title='No outstanding bills'
              subtitle="You're all caught up — nothing due right now."
            />
          ) : (
            bills.map((b) => (
              <Card key={b.id}>
                <CardContent className='flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between'>
                  <div className='min-w-0 space-y-1'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <span className='font-medium'>{b.categoryName || b.description}</span>
                      {b.kind && <Badge variant='secondary'>{FEE_HEAD_LABELS[b.kind] ?? b.kind}</Badge>}
                      {b.status && <Badge variant='outline' className='capitalize'>{b.status}</Badge>}
                    </div>
                    {b.categoryName && b.description && b.description !== b.categoryName && (
                      <div className='text-xs text-muted-foreground line-clamp-1'>{b.description}</div>
                    )}
                    <div className='flex items-center gap-1.5 text-xs text-muted-foreground'>
                      <CalendarClock className='h-3.5 w-3.5' /> Due {fmtDate(b.dueDate)}
                    </div>
                  </div>
                  <div className='shrink-0 sm:text-right'>
                    <div className='text-lg font-semibold text-destructive'>{inr(b.balanceAmount)}</div>
                    {b.totalAmount !== b.balanceAmount && (
                      <div className='text-xs text-muted-foreground'>of {inr(b.totalAmount)}</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Paid receipts */}
        <TabsContent value='paid' className='mt-4 space-y-3'>
          {receipts.length === 0 ? (
            <EmptyState
              icon={<Receipt className='h-8 w-8 text-muted-foreground' />}
              title='No payments yet'
              subtitle='Your receipts will appear here once a payment is recorded.'
            />
          ) : (
            receipts.map((r) => (
              <Card key={r.id}>
                <CardContent className='flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between'>
                  <div className='min-w-0 space-y-1'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <span className='font-medium'>Receipt #{r.receiptNumber || '—'}</span>
                      {r.mode && <Badge variant='outline' className='capitalize'>{r.mode}</Badge>}
                    </div>
                    <div className='text-xs text-muted-foreground'>
                      Paid {fmtDate(r.paidDate)}
                      {r.reference ? ` · Ref ${r.reference}` : ''}
                    </div>
                  </div>
                  <div className='shrink-0 text-lg font-semibold text-emerald-600 sm:text-right'>
                    {inr(r.amount)}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmptyState({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return (
    <Card>
      <CardContent className='flex flex-col items-center justify-center gap-2 py-12 text-center'>
        {icon}
        <div className='font-medium'>{title}</div>
        <div className='max-w-sm text-sm text-muted-foreground'>{subtitle}</div>
      </CardContent>
    </Card>
  );
}
