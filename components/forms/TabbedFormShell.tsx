'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export interface TabSpec {
  id: string;          // used in ?tab=... and as React key
  label: string;
  hidden?: boolean;    // when true, tab trigger and content are not rendered
  dirty?: boolean;     // when true, a small dot is rendered on the trigger
  content: ReactNode;
}

interface TabbedFormShellProps {
  tabs: TabSpec[];
  defaultTab: string;
}

export function TabbedFormShell({ tabs, defaultTab }: TabbedFormShellProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const visibleTabs = tabs.filter((t) => !t.hidden);
  const urlTab = searchParams.get('tab');
  const active = visibleTabs.some((t) => t.id === urlTab) ? urlTab! : defaultTab;

  const setActive = (id: string) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set('tab', id);
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  // If the active tab becomes hidden (e.g., user toggled off extended profile),
  // fall back to defaultTab.
  useEffect(() => {
    if (!visibleTabs.some((t) => t.id === active)) {
      setActive(defaultTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleTabs.length, active]);

  return (
    <Tabs value={active} onValueChange={setActive} className="w-full">
      <TabsList className="mb-4 flex-wrap h-auto">
        {visibleTabs.map((t) => (
          <TabsTrigger key={t.id} value={t.id} className="relative">
            {t.label}
            {t.dirty && (
              <span
                className={cn(
                  'absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary'
                )}
                aria-label="Unsaved changes"
              />
            )}
          </TabsTrigger>
        ))}
      </TabsList>
      {visibleTabs.map((t) => (
        <TabsContent key={t.id} value={t.id}>
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
