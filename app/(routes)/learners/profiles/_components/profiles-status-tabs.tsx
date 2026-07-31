'use client';

/**
 * URL-driven lifecycle-status tabs for the profiles list.
 *
 * The tab lives in the URL (`?tab=`) rather than in client state so the server
 * renders exactly ONE <ProfilesContent>. Previously all three tabs were passed
 * as children to <TabsContent>, and because those children are async Server
 * Components React had to await and serialise all three to build the RSC
 * payload — Radix only hides the inactive two *after* the work is already
 * paid for. That made every page load run three full learners_profiles reads
 * (plus their exact-count scans) concurrently under RLS, which is what tripped
 * the 8s statement_timeout.
 *
 * Keeping the tab in the URL also means it survives a refresh, matching how
 * search, filters, sorting and pagination already behave on this page.
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PROFILE_TABS } from './profile-tabs';
import type { LifecycleStatus } from '@/types/learner-profile';

interface ProfilesStatusTabsProps {
  /** Currently selected tab, resolved server-side from `?tab=`. */
  value: LifecycleStatus;
  /** Pre-rendered table for `value` only — the other tabs are never fetched. */
  children: React.ReactNode;
}

export function ProfilesStatusTabs({ value, children }: ProfilesStatusTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleTabChange = (next: string) => {
    if (next === value) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    // Page 4 of "active" rarely exists in "exited"; landing on an out-of-range
    // offset would only render an empty table, so restart the new tab at page 1.
    params.delete('page');

    router.push(`/learners/profiles?${params.toString()}`);
  };

  return (
    <Tabs value={value} onValueChange={handleTabChange} className="w-full">
      <TabsList>
        {PROFILE_TABS.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value={value} className="space-y-4">
        {children}
      </TabsContent>
    </Tabs>
  );
}
