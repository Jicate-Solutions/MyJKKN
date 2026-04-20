'use client';

import { useEffect, useState } from 'react';
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
import { AIDebuggerTab } from './ai-debugger-tab';
import { AskTab } from './ask-tab';
import { ActivityTimelineTab } from './activity-timeline-tab';
import { ModuleAccessTab } from './module-access-tab';
import { ComplianceReportButton } from './compliance-report-button';

export function PermissionsAuditClient() {
  const router = useRouter();
  const { profile, isLoading: isAuthLoading } = useAuth();
  // Controlled tabs so children (e.g. SystemHealthTab health cards) can switch tabs
  const [activeTab, setActiveTab] = useState('ask');

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

        <Tabs value={activeTab} onValueChange={setActiveTab} className='w-full'>
          <TabsList className='grid w-full grid-cols-2 sm:grid-cols-6 lg:grid-cols-11'>
            <TabsTrigger value='ask'>Ask</TabsTrigger>
            <TabsTrigger value='activity'>What Changed</TabsTrigger>
            <TabsTrigger value='unified'>Unified Access</TabsTrigger>
            <TabsTrigger value='module-access'>Module → Roles</TabsTrigger>
            <TabsTrigger value='rls'>RLS Audit</TabsTrigger>
            <TabsTrigger value='health'>System Health</TabsTrigger>
            <TabsTrigger value='resolver'>User Resolver</TabsTrigger>
            <TabsTrigger value='matrix'>Permission Matrix</TabsTrigger>
            <TabsTrigger value='comparison'>Comparison</TabsTrigger>
            <TabsTrigger value='export'>Export</TabsTrigger>
            <TabsTrigger value='ai-debug'>AI Debugger</TabsTrigger>
          </TabsList>

          <TabsContent value='ask'>
            <AskTab />
          </TabsContent>

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
            <SystemHealthTab onSwitchTab={setActiveTab} />
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

          <TabsContent value='ai-debug'>
            <AIDebuggerTab />
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}
