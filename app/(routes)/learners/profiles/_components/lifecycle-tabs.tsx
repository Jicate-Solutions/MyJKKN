'use client';

/**
 * Lifecycle status tabs, driven by the `status` URL param.
 *
 * These used to be Radix <TabsContent> panels each holding their own
 * <ProfilesContent> server component. Because the children of a client
 * component are rendered on the SERVER and serialised into the RSC payload,
 * all three panels executed on every request — three auth lookups, three
 * profile lookups and three learner queries per page load, to display one.
 *
 * Selecting a tab is now a navigation, so exactly one tab is ever fetched.
 *
 * The tab constants live in `lifecycle-status.ts` (no 'use client') because the
 * server page needs to call them — see the note in that file.
 */

import { useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LIFECYCLE_TABS } from './lifecycle-status';

export function LifecycleTabs({ value }: { value: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const handleChange = (next: string) => {
    if (next === value) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('status', next);
    // Row 40 of "exited" is meaningless on "active" — always restart paging.
    params.set('page', '1');
    startTransition(() => {
      router.push(`/learners/profiles?${params.toString()}`);
    });
  };

  return (
    <Tabs value={value} onValueChange={handleChange} className='w-full'>
      {/* Six tabs overflow a phone viewport, so the strip scrolls horizontally
          on small screens rather than squashing the labels. */}
      <TabsList className='flex w-full justify-start gap-1 overflow-x-auto sm:w-auto sm:gap-0'>
        {LIFECYCLE_TABS.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            disabled={isPending}
            className='shrink-0'
          >
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
