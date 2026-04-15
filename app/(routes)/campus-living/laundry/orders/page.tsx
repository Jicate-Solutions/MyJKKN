'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { Loader2 } from 'lucide-react';

export default function LaundryOrdersRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/campus-living/laundry');
  }, [router]);

  return (
    <ContentLayout title="Laundry Orders">
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    </ContentLayout>
  );
}
