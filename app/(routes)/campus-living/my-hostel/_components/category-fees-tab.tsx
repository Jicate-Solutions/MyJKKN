'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useMyHostelSummary } from '@/hooks/campus-living/use-my-hostel';
import { Building2, UtensilsCrossed, Info, Loader2 } from 'lucide-react';
import { RoomCategoryUpgradeCard } from './room-category-upgrade-card';
import { MessCategoryUpgradeCard } from './mess-category-upgrade-card';

// ---------------------------------------------------------------------------
// CategoryFeesTab
// ---------------------------------------------------------------------------
export function CategoryFeesTab() {
  const { data: summary, isLoading } = useMyHostelSummary();

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

  return (
    <div className='space-y-6'>
      {/* Category summary */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Building2 className='h-5 w-5 text-primary' />
            Your Category Assignment
          </CardTitle>
          <CardDescription>Room and mess categories linked to your profile.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
            <div className='p-3 bg-muted/50 rounded-lg'>
              <div className='flex items-center gap-1 text-xs text-muted-foreground mb-1'>
                <Building2 className='h-4 w-4' />
                Room Category
              </div>
              <p className='font-medium'>{summary.hostelCategory.name}</p>
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
                <Building2 className='h-4 w-4' />
                Hostel Type
              </div>
              <p className='font-medium capitalize'>
                {summary.hostelCategory.type ?? '—'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Self-service upgrades */}
      <RoomCategoryUpgradeCard
        currentCategoryName={summary.hostelCategory?.name ?? null}
      />
      <MessCategoryUpgradeCard
        currentMessName={summary.messCategory?.name ?? null}
      />
    </div>
  );
}
