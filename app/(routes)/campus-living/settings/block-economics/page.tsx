'use client';

import { Suspense, useMemo, useState } from 'react';
import { useTabParam } from '@/hooks/use-tab-param';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldAlert } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { useHostelYearOptions } from '@/hooks/campus-living/use-block-economics';
import type { CostKind } from '@/lib/services/campus-living/block-economics-service';
import { BlockEconomicsDataTable } from './_components/block-economics-data-table';
import { CompletenessBanner } from './_components/completeness-banner';

const ALL = '__all__';
const ONE_TIME = '__one_time__';

const COST_KIND_TABS = ['opex', 'capex'] as const;

function BlockEconomicsSettingsPageInner() {
  const { isSuperAdmin, isLoading } = usePermissions();
  const { years } = useHostelYearOptions();

  const [blockId, setBlockId] = useState<string>(ALL);
  const [costKind, setCostKind] = useTabParam('opex', COST_KIND_TABS);
  const [yearValue, setYearValue] = useState<string>(ALL);

  // The completeness banner needs a concrete year. Default it to the current
  // year (or the most recent) when the filter is "all" so the banner is useful.
  const bannerYear = useMemo(() => {
    if (yearValue !== ALL && yearValue !== ONE_TIME) {
      const match = years.find((y) => y.id === yearValue);
      return { id: yearValue, name: match?.name ?? null };
    }
    const current = years.find((y) => y.is_current) ?? years[0];
    return current ? { id: current.id, name: current.name } : { id: null, name: null };
  }, [yearValue, years]);

  if (isLoading) {
    return (
      <ContentLayout title='Block Economics'>
        <div className='space-y-6'>
          <Skeleton className='h-8 w-64' />
          <Skeleton className='h-64 w-full' />
        </div>
      </ContentLayout>
    );
  }

  if (!isSuperAdmin) {
    return (
      <ContentLayout title='Block Economics'>
        <Card className='max-w-xl mx-auto mt-10'>
          <CardContent className='p-8 text-center space-y-3'>
            <div className='mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center'>
              <ShieldAlert className='h-6 w-6 text-destructive' />
            </div>
            <h2 className='text-lg font-semibold'>You don&apos;t have access</h2>
            <p className='text-sm text-muted-foreground'>
              Block economics cost configuration is restricted to super admins.
              If you need to view or change these figures, contact your system
              administrator.
            </p>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Block Economics'>
      <div className='space-y-6'>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href='/'>Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href='/campus-living'>Campus Living</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href='/campus-living/settings'>
                Settings
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Block Economics</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div>
          <h1 className='text-2xl font-bold'>Block Economics</h1>
          <p className='text-muted-foreground'>
            Enter each block&apos;s yearly running costs (operating) and one-time
            investments (capital). These figures power the ROI, margin, and
            payback numbers on the Bed Economics dashboard.
          </p>
        </div>

        <CompletenessBanner
          hostelYearId={bannerYear.id}
          hostelYearName={bannerYear.name}
        />

        <Card>
          <CardContent className='p-6'>
            <BlockEconomicsDataTable
              blockId={blockId}
              costKind={costKind}
              yearValue={yearValue}
              onBlockChange={setBlockId}
              onCostKindChange={(v) => {
                setCostKind(v);
                // capex has no year — reset the year filter to "all".
                if (v === 'capex') setYearValue(ALL);
              }}
              onYearChange={setYearValue}
            />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}

export default function BlockEconomicsSettingsPage() {
  // Suspense boundary required: useTabParam() reads useSearchParams().
  return (
    <Suspense fallback={null}>
      <BlockEconomicsSettingsPageInner />
    </Suspense>
  );
}
