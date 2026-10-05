'use client';

import Link from 'next/link';

import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { useHrInstitutionsWithAccess } from '@/hooks/hr/use-hr-institutions';
import { RequestsTab } from './_components/requests-tab';
import { GrantTab } from './_components/grant-tab';
import { SitesTab } from './_components/sites-tab';

export default function ClinicalDutyPage() {
  const { isLoading: authLoading } = useAuth();
  const { can, isSuperAdmin, isLoading: permLoading } = usePermissions();
  const { institutions } = useHrInstitutionsWithAccess();

  const canManage = isSuperAdmin || can('hr.attendance.clinical.manage');
  const options = institutions.map((i) => ({ id: i.id, name: i.name }));

  return (
    <ContentLayout title="Clinical Duty">
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
              <Link href="/hr">HR</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Clinical Duty</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-4 space-y-6">
        <PageHeader
          title="Clinical Duty"
          description="Approve which staff may mark geotagged attendance from off-campus duty sites."
        />

        {authLoading || permLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : !canManage ? (
          <EmptyState
            title="Permission required"
            description="You don't have permission to manage clinical duty eligibility."
          />
        ) : (
          <Tabs defaultValue="requests" className="space-y-4">
            <TabsList>
              <TabsTrigger value="requests">Requests</TabsTrigger>
              <TabsTrigger value="grant">Grant</TabsTrigger>
              <TabsTrigger value="sites">Duty sites</TabsTrigger>
            </TabsList>
            <TabsContent value="requests">
              <RequestsTab institutions={options} />
            </TabsContent>
            <TabsContent value="grant">
              <GrantTab institutions={options} />
            </TabsContent>
            <TabsContent value="sites">
              <SitesTab institutions={options} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </ContentLayout>
  );
}
