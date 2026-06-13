'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, X } from 'lucide-react';
import { formatINRCompact, num } from './_utils';
import type { BillingInstitutionAnalytics } from '@/types/billing-analytics';

function rateTone(rate: number): string {
  if (rate >= 60) return 'bg-green-100 text-green-700';
  if (rate >= 30) return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
}

export function InstitutionComparison({
  data,
  loading,
  selectedInstitution,
  onSelect,
}: {
  data?: BillingInstitutionAnalytics[];
  loading: boolean;
  selectedInstitution?: string;
  onSelect: (institutionId: string | null) => void;
}) {
  const rows = data ?? [];
  const maxOutstanding = Math.max(1, ...rows.map((r) => num(r.total_outstanding)));

  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
        <CardTitle className='text-base'>Institution Comparison</CardTitle>
        {selectedInstitution && (
          <button
            onClick={() => onSelect(null)}
            className='text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs'
          >
            <X className='h-3 w-3' /> Clear focus
          </button>
        )}
      </CardHeader>
      <CardContent>
        {loading && !data ? (
          <Skeleton className='h-64 w-full' />
        ) : rows.length === 0 ? (
          <p className='text-muted-foreground py-12 text-center text-sm'>
            No billing data for the selected scope.
          </p>
        ) : (
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='text-muted-foreground border-b text-left text-xs'>
                  <th className='py-2 pr-2 font-medium'>Institution</th>
                  <th className='px-2 py-2 text-right font-medium'>Billed</th>
                  <th className='px-2 py-2 text-right font-medium'>Collected</th>
                  <th className='px-2 py-2 text-right font-medium'>Outstanding</th>
                  <th className='px-2 py-2 text-right font-medium'>Pending Students</th>
                  <th className='px-2 py-2 text-right font-medium'>Rate</th>
                  <th className='w-6' />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const outstanding = num(r.total_outstanding);
                  const isSelected = selectedInstitution === r.institution_id;
                  return (
                    <tr
                      key={r.institution_id}
                      onClick={() =>
                        onSelect(isSelected ? null : r.institution_id)
                      }
                      className={`hover:bg-muted/50 cursor-pointer border-b transition-colors ${
                        isSelected ? 'bg-muted/60' : ''
                      }`}
                    >
                      <td className='py-2 pr-2'>
                        <div className='font-medium'>{r.institution_name}</div>
                        <div className='bg-muted mt-1 h-1.5 w-full max-w-[180px] overflow-hidden rounded-full'>
                          <div
                            className='h-full rounded-full bg-red-400'
                            style={{
                              width: `${(outstanding / maxOutstanding) * 100}%`,
                            }}
                          />
                        </div>
                      </td>
                      <td className='px-2 py-2 text-right'>
                        {formatINRCompact(r.total_billed)}
                      </td>
                      <td className='px-2 py-2 text-right text-green-700'>
                        {formatINRCompact(r.total_collected)}
                      </td>
                      <td className='px-2 py-2 text-right font-medium text-red-700'>
                        {formatINRCompact(outstanding)}
                      </td>
                      <td className='px-2 py-2 text-right'>
                        <span className='font-medium text-red-700'>
                          {num(r.students_with_dues).toLocaleString('en-IN')}
                        </span>
                        <span className='text-muted-foreground text-xs'>
                          {' '}
                          of {num(r.student_count).toLocaleString('en-IN')}
                        </span>
                      </td>
                      <td className='px-2 py-2 text-right'>
                        <Badge
                          variant='secondary'
                          className={`font-normal ${rateTone(num(r.collection_rate))}`}
                        >
                          {num(r.collection_rate).toFixed(0)}%
                        </Badge>
                      </td>
                      <td className='text-muted-foreground'>
                        <ChevronRight className='h-4 w-4' />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
