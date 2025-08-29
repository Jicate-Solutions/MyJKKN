'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AIChip from '@/components/ui/ai-chip';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    // Clear any stale cache for users who visited the old version
    if (typeof window !== 'undefined') {
      // Force clear Next.js router cache
      if ('caches' in window) {
        caches.keys().then((names) => {
          names.forEach((name) => {
            caches.delete(name);
          });
        });
      }

      // Add timestamp to force bypass cache
      const timestamp = new Date().getTime();
      router.replace(`/dashboard?v=${timestamp}`);
    }
  }, [router]);

  return (
    <div className='flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800'>
      <div className='text-center'>
        <div className='w-48 h-48 mx-auto mb-6'>
          <AIChip animated={true} showDescription={false} />
        </div>
        <h1 className='text-2xl font-bold mb-2'>Welcome to MyJKKN</h1>
      </div>
    </div>
  );
}
