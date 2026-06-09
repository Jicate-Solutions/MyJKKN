'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useMyHostelSummary, useMyCategoryFees } from '@/hooks/campus-living/use-my-hostel';
import { Building2, UtensilsCrossed, Info, Loader2 } from 'lucide-react';
import { RoomCategoryUpgradeCard } from './room-category-upgrade-card';
import { MessCategoryUpgradeCard } from './mess-category-upgrade-card';

// ---------------------------------------------------------------------------
// CategoryFeesTab
// ---------------------------------------------------------------------------
export function CategoryFeesTab() {
  const { data: summary, isLoading } = useMyHostelSummary();
  const { data: fees, isLoading: feesLoading } = useMyCategoryFees(
    summary?.hostelCategory?.id
  );

  if (isLoading) {
    return (
      <div className='flex items-center justify-center min-h-[200px]'>
        <Loader2 className='h-6 w-6 animate-spin text-primary' />
      </div>
    );
  }

  if (!summary?.hostelCategory) {
    return (
      <Card>
        <CardContent className='p-8 text-center'>
          <Info className='h-10 w-10 mx-auto text-muted-foreground mb-2' />
          <p className='text-muted-foreground'>
            No hostel category assigned to your profile yet — contact the hostel office.
          </p>
        </CardContent>
      </Card>
    );
  }

  const totalAmount =
    fees && fees.length > 0 ? fees.reduce((sum, f) => sum + (f.amount ?? 0), 0) : null;

  const currentRoomFee = (fees ?? []).find((f) => !f.mess_category_id)?.amount ?? 0;
  const currentMessFee = (fees ?? []).find((f) => f.mess_category_id)?.amount ?? 0;

  return (
    <div className='space-y-6'>
      {/* Category summary */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Building2 className='h-5 w-5 text-primary' />
            Your Category Assignment
          </CardTitle>
          <CardDescription>Hostel and mess categories linked to your profile.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
            <div className='p-3 bg-muted/50 rounded-lg'>
              <div className='flex items-center gap-1 text-xs text-muted-foreground mb-1'>
                <Building2 className='h-4 w-4' />
                Hostel Category
              </div>
              <p className='font-medium'>{summary.hostelCategory.name}</p>
              {summary.hostelCategory.type && (
                <p className='text-xs text-muted-foreground capitalize mt-0.5'>
                  {summary.hostelCategory.type}
                </p>
              )}
            </div>

            <div className='p-3 bg-muted/50 rounded-lg'>
              <div className='flex items-center gap-1 text-xs text-muted-foreground mb-1'>
                <UtensilsCrossed className='h-4 w-4' />
                Mess Category
              </div>
              <p className='font-medium'>{summary.messCategory?.name ?? '—'}</p>
            </div>

            <div className='p-3 bg-muted/50 rounded-lg'>
              <div className='flex items-center gap-1 text-xs text-muted-foreground mb-1'>
                <Info className='h-4 w-4' />
                Hostel Fee (profile)
              </div>
              <p className='font-medium'>
                {summary.hostelFee != null
                  ? `₹${summary.hostelFee.toLocaleString()}`
                  : '—'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Fee breakdown table */}
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Fee Breakdown</CardTitle>
          <CardDescription>
            Published fee structure for{' '}
            <span className='font-medium'>{summary.hostelCategory.name}</span> (room + mess
            components are additive).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {feesLoading ? (
            <div className='flex items-center justify-center py-6'>
              <Loader2 className='h-5 w-5 animate-spin text-primary' />
            </div>
          ) : !fees || fees.length === 0 ? (
            <p className='text-sm text-muted-foreground text-center py-6'>
              Fee structure not published for your category yet.
            </p>
          ) : (
            <div className='overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='border-b'>
                    <th className='text-left py-2 pr-4 font-medium text-muted-foreground'>
                      Component
                    </th>
                    <th className='text-left py-2 pr-4 font-medium text-muted-foreground'>
                      Frequency
                    </th>
                    <th className='text-right py-2 font-medium text-muted-foreground'>
                      Amount (₹)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {fees.map((fee) => (
                    <tr key={fee.id} className='border-b last:border-0'>
                      <td className='py-2 pr-4 text-muted-foreground'>
                        {fee.mess_category_id ? 'Mess' : 'Room'}
                      </td>
                      <td className='py-2 pr-4 capitalize'>
                        {fee.frequency?.replace(/_/g, ' ') ?? '—'}
                      </td>
                      <td className='py-2 text-right font-medium'>
                        {fee.amount != null ? fee.amount.toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {totalAmount != null && (
                  <tfoot>
                    <tr className='border-t'>
                      <td
                        colSpan={2}
                        className='pt-3 text-xs text-muted-foreground'
                      >
                        Total (per period, additive)
                      </td>
                      <td className='pt-3 text-right font-semibold'>
                        ₹{totalAmount.toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Self-service upgrades */}
      <RoomCategoryUpgradeCard
        currentCategoryName={summary.hostelCategory?.name ?? null}
        currentFee={currentRoomFee}
      />
      <MessCategoryUpgradeCard
        currentMessName={summary.messCategory?.name ?? null}
        currentFee={currentMessFee}
      />
    </div>
  );
}
