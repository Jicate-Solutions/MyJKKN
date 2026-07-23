'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { BlockEconomicsService } from '@/lib/services/campus-living/block-economics-service';
import { useHostelBlockOptions } from '@/hooks/campus-living/use-block-economics';

interface CompletenessBannerProps {
  /** The hostel year the user is reviewing (drives the opex completeness check). */
  hostelYearId: string | null;
  hostelYearName: string | null;
}

/**
 * "The page says what data is needed" requirement (spec §12 PR C).
 * For the selected year, surfaces which blocks have NO opex entries and which
 * have NO capex — because the ROI / margin columns on the Bed Economics
 * dashboard stay hidden until those costs are entered.
 */
export function CompletenessBanner({
  hostelYearId,
  hostelYearName,
}: CompletenessBannerProps) {
  const { blocks, loading: blocksLoading } = useHostelBlockOptions();

  // Opex entries for the selected year, plus all active capex (year-agnostic).
  const opexQuery = useQuery({
    queryKey: ['campus-living', 'block-economics', 'completeness-opex', hostelYearId],
    queryFn: () =>
      BlockEconomicsService.getEntries({
        cost_kind: 'opex',
        hostel_year_id: hostelYearId,
      }),
    enabled: !!hostelYearId,
  });

  const capexQuery = useQuery({
    queryKey: ['campus-living', 'block-economics', 'completeness-capex'],
    queryFn: () => BlockEconomicsService.getEntries({ cost_kind: 'capex' }),
  });

  const loading =
    blocksLoading ||
    capexQuery.isLoading ||
    (!!hostelYearId && opexQuery.isLoading);

  const { missingOpex, missingCapex } = useMemo(() => {
    if (!blocks.length) return { missingOpex: [], missingCapex: [] };
    const opexBlockIds = new Set((opexQuery.data ?? []).map((e) => e.block_id));
    const capexBlockIds = new Set((capexQuery.data ?? []).map((e) => e.block_id));
    return {
      missingOpex: hostelYearId
        ? blocks.filter((b) => !opexBlockIds.has(b.id))
        : [],
      missingCapex: blocks.filter((b) => !capexBlockIds.has(b.id)),
    };
  }, [blocks, opexQuery.data, capexQuery.data, hostelYearId]);

  if (loading) {
    return <Skeleton className='h-20 w-full' />;
  }

  if (!hostelYearId) {
    return (
      <Alert>
        <AlertTriangle className='h-4 w-4' />
        <AlertTitle>Choose a year to check operating-cost coverage</AlertTitle>
        <AlertDescription>
          Pick a hostel year above to see which blocks still need operating costs
          entered. Capital costs are listed below regardless of year.
        </AlertDescription>
      </Alert>
    );
  }

  const allClear = missingOpex.length === 0 && missingCapex.length === 0;

  if (allClear) {
    return (
      <Alert className='border-green-600/40 bg-green-50 text-green-900 dark:bg-green-950/30 dark:text-green-200'>
        <CheckCircle2 className='h-4 w-4 !text-green-600' />
        <AlertTitle>All cost data is entered</AlertTitle>
        <AlertDescription>
          Every block has operating costs for {hostelYearName ?? 'this year'} and
          a capital-cost entry. ROI and margin figures will show on the Bed
          Economics dashboard.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant='destructive'>
      <AlertTriangle className='h-4 w-4' />
      <AlertTitle>Some cost data is still missing</AlertTitle>
      <AlertDescription>
        <div className='space-y-1.5 mt-1'>
          {missingOpex.length > 0 && (
            <p>
              <span className='font-medium'>
                No operating costs for {hostelYearName ?? 'this year'}:
              </span>{' '}
              {missingOpex.map((b) => b.name).join(', ')}.
            </p>
          )}
          {missingCapex.length > 0 && (
            <p>
              <span className='font-medium'>No capital costs entered:</span>{' '}
              {missingCapex.map((b) => b.name).join(', ')}.
            </p>
          )}
          <p className='text-sm'>
            ROI on the Bed Economics dashboard stays hidden for these blocks until
            their costs are entered.
          </p>
        </div>
      </AlertDescription>
    </Alert>
  );
}
