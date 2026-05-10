// app/(routes)/admission/page.tsx
//
// Unified Admission hub. Director directive 2026-05-08: collapse the 4
// separate admission dashboards into one tabbed entry at /admission.
//
// Tabs render the existing per-route page components via next/dynamic.
// The 4 individual routes (/admission/dashboard, /admission/group-dashboard,
// /admission/analytics, /admission/insights) stay alive for direct linking.
//
// Layout note: each tab's underlying page already wraps its content in
// <ContentLayout> (which renders its own <Navbar title=...>). To avoid
// nested navbars we deliberately do NOT wrap the hub in another
// ContentLayout — TabsList sits above and the active tab page brings its
// own Navbar. This keeps the visual identical to visiting each sub-route
// directly, with the tab strip layered on top for navigation.
//
// URL state: active tab is mirrored to ?tab=<value> so links like
// /admission?tab=funnel deep-link to the Funnel pane. Default = overview.
//
// /admission already has a literal href in lib/sidebarMenuLink.ts, so no
// `navMeta.invokedFrom` is needed — the hub is itself the canonical href.

'use client';

import dynamic from 'next/dynamic';
import { Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';

const VALID_TABS = ['overview', 'group', 'funnel', 'insights'] as const;
type AdmissionHubTab = (typeof VALID_TABS)[number];
const DEFAULT_TAB: AdmissionHubTab = 'overview';

function isValidTab(value: string | null | undefined): value is AdmissionHubTab {
  return !!value && (VALID_TABS as readonly string[]).includes(value);
}

// Lazy-load each existing dashboard page as a tab pane. ssr:false keeps the
// initial bundle small — most users land on Overview and never visit the
// others. Each Skeleton fallback fills the dashboard area while the chunk
// streams in.
const TabFallback = () => (
  <div className='space-y-4'>
    <Skeleton className='h-12 w-1/3' />
    <Skeleton className='h-64 w-full' />
    <Skeleton className='h-48 w-full' />
  </div>
);

const DashboardView = dynamic(() => import('./dashboard/page'), {
  loading: () => <TabFallback />,
  ssr: false,
});
const GroupView = dynamic(() => import('./group-dashboard/page'), {
  loading: () => <TabFallback />,
  ssr: false,
});
const AnalyticsView = dynamic(() => import('./analytics/page'), {
  loading: () => <TabFallback />,
  ssr: false,
});
const InsightsView = dynamic(() => import('./insights/page'), {
  loading: () => <TabFallback />,
  ssr: false,
});

export default function AdmissionHubPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab: AdmissionHubTab = isValidTab(tabParam) ? tabParam : DEFAULT_TAB;

  const handleTabChange = useCallback(
    (next: string) => {
      if (!isValidTab(next)) return;
      const params = new URLSearchParams(searchParams.toString());
      if (next === DEFAULT_TAB) {
        params.delete('tab');
      } else {
        params.set('tab', next);
      }
      const qs = params.toString();
      router.replace(qs ? `/admission?${qs}` : '/admission', { scroll: false });
    },
    [router, searchParams]
  );

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className='w-full'>
      {/* Tab strip — sits above each tab page's own Navbar/ContentLayout.
          Container matches ContentLayout's inner padding so the strip lines
          up with the page content below. */}
      <div className='container px-4 sm:px-8 pt-4'>
        <TabsList className='grid w-full grid-cols-4 sm:max-w-2xl'>
          <TabsTrigger value='overview'>Overview</TabsTrigger>
          <TabsTrigger value='group'>Group</TabsTrigger>
          <TabsTrigger value='funnel'>Funnel</TabsTrigger>
          <TabsTrigger value='insights'>Insights</TabsTrigger>
        </TabsList>
      </div>

      {/* Each TabsContent mounts only when active (forceMount is NOT set),
          so unrelated dashboards don't fire their own data fetches in the
          background. Suspense around dynamic() gives an extra safety net
          alongside the dynamic loading state. */}
      <TabsContent value='overview' className='mt-0'>
        <Suspense fallback={<TabFallback />}>
          <DashboardView />
        </Suspense>
      </TabsContent>
      <TabsContent value='group' className='mt-0'>
        <Suspense fallback={<TabFallback />}>
          <GroupView />
        </Suspense>
      </TabsContent>
      <TabsContent value='funnel' className='mt-0'>
        <Suspense fallback={<TabFallback />}>
          <AnalyticsView />
        </Suspense>
      </TabsContent>
      <TabsContent value='insights' className='mt-0'>
        <Suspense fallback={<TabFallback />}>
          <InsightsView />
        </Suspense>
      </TabsContent>
    </Tabs>
  );
}
