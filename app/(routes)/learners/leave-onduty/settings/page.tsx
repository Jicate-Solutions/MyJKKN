'use client';

/**
 * Learner Leave Types + Approval Flows settings.
 *
 * Replaces two retired screens:
 *  - /academic/leave-onduty/settings (OD sub-categories + workflow builder)
 *  - /campus-living/settings/leave-types (hostel leave types)
 *
 * One group-wide list (learner_leave_types) now covers both leave and on-duty,
 * for hostelers and day scholars alike, with a per-type approval flow that can
 * be overridden per institution (learner_leave_flows / learner_leave_flow_steps).
 *
 * @route /learners/leave-onduty/settings
 */

import { Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useTabParam } from '@/hooks/use-tab-param';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { LeaveTypesTab } from './_components/leave-types-tab';
import { FlowsTab } from './_components/flows-tab';

const SETTINGS_TABS = ['types', 'flows'] as const;

function LearnerLeaveSettingsPageInner() {
  const router = useRouter();
  const { isLoading: authLoading } = useAuth();
  const { can, isLoading: permissionsLoading } = usePermissions();
  const [activeTab, setActiveTab] = useTabParam('types', SETTINGS_TABS);

  const canView = can('learners.leave_types.view');
  const canManage = can('learners.leave_types.manage');

  // Permission check - redirect if unauthorized.
  // Wait for both auth AND permissions to finish loading before checking —
  // can() returns false while in flight, so deciding early bounces users who
  // actually hold the key.
  useEffect(() => {
    if (!authLoading && !permissionsLoading && !canView) {
      router.replace('/');
    }
  }, [authLoading, permissionsLoading, canView, router]);

  if (authLoading || permissionsLoading) {
    return (
      <ContentLayout title="Leave Settings">
        <div className="space-y-6">
          <Skeleton className="h-8 w-64 mb-6" />
          <Card>
            <CardContent className="p-6">
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  if (!canView) {
    return (
      <ContentLayout title="Leave Settings">
        <div className="space-y-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>You do not have permission to access this page.</AlertDescription>
          </Alert>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Leave Settings">
      <div className="space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/">Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/learners/leave-onduty/my-applications">Leave/OnDuty</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Settings</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Leave/OnDuty Settings</h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            One leave/on-duty type list for every learner — hostel or day scholar — plus the
            approval chain each type routes through.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="flex w-full max-w-md justify-start gap-1 overflow-x-auto sm:grid sm:grid-cols-2 sm:gap-0 sm:overflow-visible">
            <TabsTrigger value="types">Leave Types</TabsTrigger>
            <TabsTrigger value="flows">Approval Flows</TabsTrigger>
          </TabsList>

          <TabsContent value="types" className="mt-6">
            <LeaveTypesTab canManage={canManage} />
          </TabsContent>

          <TabsContent value="flows" className="mt-6">
            <FlowsTab canManage={canManage} />
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}

export default function LearnerLeaveSettingsPage() {
  // Suspense boundary required: useTabParam() reads useSearchParams().
  return (
    <Suspense fallback={null}>
      <LearnerLeaveSettingsPageInner />
    </Suspense>
  );
}
