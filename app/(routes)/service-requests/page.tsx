'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
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
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useMyServiceRequests,
  usePendingApprovals,
  useServiceRequests,
  useRequestCountsByStatus,
} from '@/hooks/service-requests/use-service-requests';
import { RequestDataTable } from './_components/request-data-table';
import {
  Plus,
  FileText,
  Clock,
  CheckCircle,
  AlertTriangle,
  Inbox,
} from 'lucide-react';

export default function ServiceRequestsHubPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { can, isSuperAdmin } = usePermissions();
  const initialTab = searchParams.get('tab') || 'my-requests';
  const [activeTab, setActiveTab] = useState(initialTab);

  const { data: myRequestsData, isLoading: myLoading } = useMyServiceRequests();
  const { data: pendingApprovalsData, isLoading: approvalsLoading } = usePendingApprovals();
  const { data: allRequestsData, isLoading: allLoading } = useServiceRequests();
  const { data: counts } = useRequestCountsByStatus();

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    router.replace(`/service-requests?tab=${tab}`, { scroll: false });
  };

  const canViewAll = can('service_requests.view_all') || isSuperAdmin;
  const canApprove = can('service_requests.approve') || isSuperAdmin;

  return (
    <ContentLayout title="Service Requests">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Service Requests</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <h1 className="text-2xl font-bold">Service Requests</h1>
            <p className="text-muted-foreground">
              Submit and track service requests
            </p>
          </div>
          <Button asChild>
            <Link href="/service-requests/new">
              <Plus className="h-4 w-4 mr-2" />
              New Request
            </Link>
          </Button>
        </div>

        {/* Status Count Cards */}
        {counts && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="text-2xl font-bold">
                      {Object.values(counts).reduce((a: number, b) => a + (typeof b === 'number' ? b : 0), 0)}
                    </p>
                  </div>
                  <FileText className="h-6 w-6 text-blue-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Pending</p>
                    <p className="text-2xl font-bold">
                      {(counts.submitted || 0) + (counts.in_review || 0)}
                    </p>
                  </div>
                  <Clock className="h-6 w-6 text-yellow-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Approved</p>
                    <p className="text-2xl font-bold">{counts.approved || 0}</p>
                  </div>
                  <CheckCircle className="h-6 w-6 text-green-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Rejected</p>
                    <p className="text-2xl font-bold">{counts.rejected || 0}</p>
                  </div>
                  <AlertTriangle className="h-6 w-6 text-red-500" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="my-requests">My Requests</TabsTrigger>
            {canApprove && (
              <TabsTrigger value="pending-approvals">Pending Approvals</TabsTrigger>
            )}
            {canViewAll && (
              <TabsTrigger value="all-requests">All Requests</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="my-requests" className="mt-4">
            <Card>
              <CardContent className="p-6">
                {myLoading ? (
                  <div className="flex justify-center items-center min-h-[200px]">
                    <p className="text-sm text-muted-foreground">Loading...</p>
                  </div>
                ) : myRequestsData?.data && myRequestsData.data.length > 0 ? (
                  <RequestDataTable
                    data={myRequestsData.data}
                    showRequester={false}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Inbox className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-sm text-muted-foreground mb-4">
                      You haven&apos;t submitted any requests yet
                    </p>
                    <Button asChild variant="outline">
                      <Link href="/service-requests/new">Create your first request</Link>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {canApprove && (
            <TabsContent value="pending-approvals" className="mt-4">
              <Card>
                <CardContent className="p-6">
                  {approvalsLoading ? (
                    <div className="flex justify-center items-center min-h-[200px]">
                      <p className="text-sm text-muted-foreground">Loading...</p>
                    </div>
                  ) : pendingApprovalsData?.data && pendingApprovalsData.data.length > 0 ? (
                    <RequestDataTable
                      data={pendingApprovalsData.data.map((a: any) => a.service_request).filter(Boolean)}
                      showRequester={true}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12">
                      <CheckCircle className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-sm text-muted-foreground">
                        No pending approvals
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {canViewAll && (
            <TabsContent value="all-requests" className="mt-4">
              <Card>
                <CardContent className="p-6">
                  {allLoading ? (
                    <div className="flex justify-center items-center min-h-[200px]">
                      <p className="text-sm text-muted-foreground">Loading...</p>
                    </div>
                  ) : allRequestsData?.data && allRequestsData.data.length > 0 ? (
                    <RequestDataTable data={allRequestsData.data} />
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12">
                      <p className="text-sm text-muted-foreground">No requests found</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </ContentLayout>
  );
}
