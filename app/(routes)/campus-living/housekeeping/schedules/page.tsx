'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { Loader2 } from 'lucide-react';

export default function HousekeepingSchedulesRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/campus-living/housekeeping');
  }, [router]);

  return (
    <ContentLayout title="Housekeeping Schedules">
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    </ContentLayout>
  );
}
