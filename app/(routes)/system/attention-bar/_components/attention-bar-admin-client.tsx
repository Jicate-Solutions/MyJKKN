'use client';

/**
 * AttentionBarAdminClient — page shell for /system/attention-bar.
 *
 * Q2 twin-check: closest twin is app/(routes)/users/permissions-audit/_components/permissions-audit-client.tsx
 * Match: ContentLayout + PageBreadcrumb + Tabs/TabsList/TabsTrigger/TabsContent pattern (~85% structural match).
 * Decision: bespoke (not extracted to shared) because the tab structure is attention-bar-specific
 * and permissions-audit-client.tsx is already a standalone module.
 *
 * URL-driven tab state: ?tab=overview|defaults|rules|behavior|ai|audit|sandbox
 * Permission-gated: tabs the user lacks permission for are hidden (not rendered).
 */

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sparkles } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { SYSTEM_ROLES } from '@/types/auth';

import { TabOverview } from './tab-overview';
import { TabDefaults } from './tab-defaults';
import { TabRules } from './tab-rules';
import { TabBehavior } from './tab-behavior';
import { TabAi } from './tab-ai';
import { TabAudit } from './tab-audit';
import { TabSandbox } from './tab-sandbox';

const VALID_TABS = ['overview', 'defaults', 'rules', 'behavior', 'ai', 'audit', 'sandbox'] as const;
type TabId = (typeof VALID_TABS)[number];

interface TabDef {
  id: TabId;
  label: string;
  permKey: string | null; // null = super_admin only, always shown for super_admin
}

const TAB_DEFS: TabDef[] = [
  { id: 'overview',  label: 'Overview',         permKey: 'attention_bar.audit.view' },
  { id: 'defaults',  label: 'Layer 1 — Defaults', permKey: 'attention_bar.rules.view' },
  { id: 'rules',     label: 'Layer 2 — Rules',  permKey: 'attention_bar.rules.manage' },
  { id: 'behavior',  label: 'Layer 3 — Behavior', permKey: 'attention_bar.audit.view' },
  { id: 'ai',        label: 'Layer 4 — AI',     permKey: 'attention_bar.config.manage' },
  { id: 'audit',     label: 'Audit Log',        permKey: 'attention_bar.audit.view' },
  { id: 'sandbox',   label: 'Test Sandbox',     permKey: 'attention_bar.test_sandbox.use' },
];

function isValidTab(tab: string | null): tab is TabId {
  return VALID_TABS.includes(tab as TabId);
}

export function AttentionBarAdminClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, isLoading: isAuthLoading } = useAuth();

  const isSuperAdmin =
    !!profile &&
    (profile.role === SYSTEM_ROLES.SUPER_ADMIN || profile.is_super_admin === true);

  // Fetch all attention_bar permissions at once
  const allPermKeys = TAB_DEFS
    .map(t => t.permKey)
    .filter((k): k is string => k !== null);

  const { hasPermission, isLoading: isPermLoading } = usePermissions(allPermKeys);

  // Determine which tabs the user can see
  const visibleTabs = TAB_DEFS.filter(tab => {
    if (isSuperAdmin) return true;
    if (tab.permKey === null) return false;
    return hasPermission(tab.permKey);
  });

  // URL-driven tab state
  const paramTab = searchParams.get('tab');
  const defaultTab: TabId =
    isValidTab(paramTab) && visibleTabs.some(t => t.id === paramTab)
      ? paramTab
      : (visibleTabs[0]?.id ?? 'overview');

  const [activeTab, setActiveTab] = useState<TabId>(defaultTab);

  // Sync URL when tab changes
  function handleTabChange(tab: string) {
    const t = tab as TabId;
    setActiveTab(t);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', t);
    router.push(`/system/attention-bar?${params.toString()}`, { scroll: false });
  }

  // Redirect unauthorized users
  useEffect(() => {
    if (isAuthLoading || isPermLoading) return;
    if (!profile) return; // Middleware handles unauthenticated

    // Must have at least attention_bar.audit.view to enter the page at all
    if (!isSuperAdmin && !hasPermission('attention_bar.audit.view') && !hasPermission('attention_bar.rules.view') && !hasPermission('attention_bar.rules.manage') && !hasPermission('attention_bar.config.manage') && !hasPermission('attention_bar.test_sandbox.use')) {
      router.push('/unauthorized');
    }
  }, [isAuthLoading, isPermLoading, profile, isSuperAdmin, hasPermission, router]);

  // Ensure activeTab is always in visible tabs
  useEffect(() => {
    if (visibleTabs.length === 0) return;
    if (!visibleTabs.some(t => t.id === activeTab)) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [visibleTabs, activeTab]);

  if (isAuthLoading || isPermLoading || !profile) {
    return (
      <ContentLayout title='Attention Bar Admin'>
        <div className='flex justify-center items-center min-h-[400px]'>
          <BeatLoader color='#6366f1' size={12} />
        </div>
      </ContentLayout>
    );
  }

  if (visibleTabs.length === 0) {
    return (
      <ContentLayout title='Attention Bar Admin'>
        <div className='flex flex-col items-center justify-center min-h-[400px] gap-4 text-center'>
          <Sparkles className='h-12 w-12 text-muted-foreground' />
          <p className='text-muted-foreground'>
            You don&apos;t have permission to access the Attention Bar admin panel.
          </p>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Attention Bar Admin'>
      <div className='space-y-6'>
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'System', href: '/system' },
            { label: 'Attention Bar' },
          ]}
        />

        <div className='flex items-center gap-3'>
          <Sparkles className='h-8 w-8 text-indigo-500' />
          <div>
            <h2 className='text-2xl font-bold'>Attention Bar</h2>
            <p className='text-sm text-muted-foreground'>
              Configure, monitor, and test the 5-layer Attention Bar system (Layer 0 → 2 → 3 → 1 → 4).
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className='w-full'>
          <TabsList className={`grid w-full grid-cols-${Math.min(visibleTabs.length, 4)} sm:grid-cols-${Math.min(visibleTabs.length, 7)}`}>
            {visibleTabs.map(tab => (
              <TabsTrigger key={tab.id} value={tab.id}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value='overview'>
            <TabOverview />
          </TabsContent>

          <TabsContent value='defaults'>
            <TabDefaults />
          </TabsContent>

          {/* TAB-3:RULES */}
          <TabsContent value='rules'>
            <TabRules />
          </TabsContent>

          <TabsContent value='behavior'>
            <TabBehavior />
          </TabsContent>

          {/* TAB-5:AI */}
          <TabsContent value='ai'>
            <TabAi isSuperAdmin={isSuperAdmin} />
          </TabsContent>

          <TabsContent value='audit'>
            <TabAudit />
          </TabsContent>

          <TabsContent value='sandbox'>
            <TabSandbox />
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}
