'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BeatLoader } from 'react-spinners';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth-provider';
import { SYSTEM_ROLES } from '@/types/auth';
import { SystemHealthTab } from './system-health-tab';
import { UserResolverTab } from './user-resolver-tab';
import { PermissionMatrixTab } from './permission-matrix-tab';
import { ComparisonTab } from './comparison-tab';
import { UnifiedAccessMapTab } from './unified-access-map-tab';
import { RlsAuditTab } from './rls-audit-tab';
import { ExportReportsTab } from './export-reports-tab';
import { ActivityTimelineTab } from './activity-timeline-tab';
import { ModuleAccessTab } from './module-access-tab';
import { ComplianceReportButton } from './compliance-report-button';
import { useTabParam } from '@/hooks/use-tab-param';

/**
 * All valid tab values — used to sanitize the ?tab= URL param.
 *
 * 'ask' was removed 2026-07-26. Its backend
 * (/api/users/permissions-audit/ai-debug) is hardcoded to Gemini and returns
 * "GEMINI_API_KEY not configured in environment" in production, so the box was
 * a dead control — and it was the DEFAULT landing tab, so every super-admin hit
 * it first. Dropping it from this list also makes a stale ?tab=ask deep-link
 * fall back to DEFAULT_TAB instead of opening a broken pane. Re-add here, in
 * TabsList and in TabsContent once the tab has a working backend.
 *
 * 'ai-debug' (the AI Debugger pane) was removed 2026-07-29 for the same reason:
 * it posts to that same dead Gemini route. Its two other endpoints do not save
 * it — /matrix only fills a role dropdown that feeds the dead chat, and
 * /ai-debug/run-sql executes SQL held in `executingSql`, which is set ONLY from
 * an AI response, so handleExecuteSql returns at its first line while the chat
 * is down. The whole pane is therefore inert in production. Same re-add path:
 * restore here, in TabsList and in TabsContent once the backend works.
 */
const TAB_VALUES = [
  'activity',
  'unified',
  'module-access',
  'rls',
  'health',
  'resolver',
  'matrix',
  'comparison',
  'export',
] as const;

const DEFAULT_TAB = 'activity';

export function PermissionsAuditClient() {
  const router = useRouter();
  const { profile, isLoading: isAuthLoading } = useAuth();

  // URL-synced tabs (system standard): active tab is mirrored to ?tab= so
  // each tab is deep-linkable and favoritable, and the default tab is
  // stamped into the URL on mount ("always show the tab"). handleTabChange
  // is also passed to children (e.g. SystemHealthTab health cards) so their
  // programmatic tab switches keep the URL in sync.
  const [activeTab, handleTabChange] = useTabParam(DEFAULT_TAB, TAB_VALUES);

  const isSuperAdmin =
    !!profile &&
    (profile.role === SYSTEM_ROLES.SUPER_ADMIN || profile.is_super_admin === true);

  useEffect(() => {
    if (isAuthLoading) return;
    if (!profile) return; // Middleware handles unauthenticated users
    if (!isSuperAdmin) {
      router.push('/unauthorized');
    }
  }, [isAuthLoading, profile, isSuperAdmin, router]);

  if (isAuthLoading || !profile || !isSuperAdmin) {
    return (
      <ContentLayout title='Permissions Audit'>
        <div className='flex justify-center items-center min-h-[400px]'>
          <BeatLoader color='#6366f1' size={12} />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Permissions Audit'>
      <div className='space-y-6'>
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Users', href: '/users' },
            { label: 'Permissions Audit' }
          ]}
        />

        <div className='flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3'>
          <div className='flex items-center gap-3'>
            <ShieldCheck className='h-8 w-8 text-indigo-500' />
            <div>
              <h2 className='text-2xl font-bold'>Permissions Audit Dashboard</h2>
              <p className='text-sm text-muted-foreground'>
                Unified view of code permissions, database policies, and
                navigation access across all roles and modules.
              </p>
            </div>
          </div>
          <ComplianceReportButton />
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className='w-full'>
          <TabsList className='flex w-full justify-start gap-1 overflow-x-auto lg:grid lg:grid-cols-9 lg:gap-0 lg:overflow-visible'>
            <TabsTrigger value='activity'>What Changed</TabsTrigger>
            <TabsTrigger value='unified'>Unified Access</TabsTrigger>
            <TabsTrigger value='module-access'>Module → Roles</TabsTrigger>
            <TabsTrigger value='rls'>RLS Audit</TabsTrigger>
            <TabsTrigger value='health'>System Health</TabsTrigger>
            <TabsTrigger value='resolver'>User Resolver</TabsTrigger>
            <TabsTrigger value='matrix'>Permission Matrix</TabsTrigger>
            <TabsTrigger value='comparison'>Comparison</TabsTrigger>
            <TabsTrigger value='export'>Export</TabsTrigger>
          </TabsList>

          <TabsContent value='activity'>
            <ActivityTimelineTab />
          </TabsContent>

          <TabsContent value='unified'>
            <UnifiedAccessMapTab />
          </TabsContent>

          <TabsContent value='module-access'>
            <ModuleAccessTab />
          </TabsContent>

          <TabsContent value='rls'>
            <RlsAuditTab />
          </TabsContent>

          <TabsContent value='health'>
            <SystemHealthTab onSwitchTab={handleTabChange} />
          </TabsContent>

          <TabsContent value='resolver'>
            <UserResolverTab />
          </TabsContent>

          <TabsContent value='matrix'>
            <PermissionMatrixTab />
          </TabsContent>

          <TabsContent value='comparison'>
            <ComparisonTab />
          </TabsContent>

          <TabsContent value='export'>
            <ExportReportsTab />
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}
