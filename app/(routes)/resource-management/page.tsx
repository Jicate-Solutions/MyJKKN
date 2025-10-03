// app/(routes)/resource-management/page.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Loading from '@/components/Loading/Loading';

/**
 * Resource Management Index Page
 * Redirects to the analytics dashboard
 */
export default function ResourceManagementPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to analytics dashboard
    router.replace('/resource-management/analytics-dashboard');
  }, [router]);

  // Show loading while redirecting
  return <Loading  title='Dashboard'/>;
}
