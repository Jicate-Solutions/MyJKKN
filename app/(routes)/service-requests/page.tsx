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
import { useTablePagination } from '@/hooks/service-requests/use-table-pagination';
import { RequestDataTable } from './_components/request-data-table';
import { buildHubStatCards, type HubStatCard } from './_components/hub-stat-cards';
import {
  Plus,
  FileText,
  Clock,
  CheckCircle,
  AlertTriangle,
  Inbox,
} from 'lucide-react';

const STAT_CARD_ICONS: Record<HubStatCard['key'], typeof FileText> = {
  total: FileText,
  in_progress: Clock,
  approved: CheckCircle,
  rejected: AlertTriangle,
};

const STAT_CARD_ICON_COLORS: Record<HubStatCard['key'], string> = {
  total: 'text-blue-500',
  in_progress: 'text-yellow-500',
  approved: 'text-green-500',
  rejected: 'text-red-500',
};

export default function ServiceRequestsHubPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { can, isSuperAdmin } = usePermissions();
  const initialTab = searchParams.get('tab') || 'my-requests';
  const [activeTab, setActiveTab] = useState(initialTab);

  // Independent paging state per tab — each one pages the server rather than
  // slicing a single unparameterised fetch, which previously capped every tab
  // at the API's default page size.
  const myPaging = useTablePagination();
  const approvalsPaging = useTablePagination();
  const allPaging = useTablePagination();

  const { data: myRequestsData, isLoading: myLoading, isFetching: myFetching } =
    useMyServiceRequests(myPaging.queryParams);
  const {
    data: pendingApprovalsData,
    isLoading: approvalsLoading,
    isFetching: approvalsFetching,
  } = usePendingApprovals(approvalsPaging.queryParams);
  const { data: allRequestsData, isLoading: allLoading, isFetching: allFetching } =
    useServiceRequests(allPaging.queryParams);
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

        {/* Status Count Cards — the second card is "In progress", not
            "Pending"; see _components/hub-stat-cards.ts (BUG-006055). */}
        {counts && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {buildHubStatCards(
              counts,
              // The approver's own queue total — the number the Pending
              // Approvals tab shows. Withheld while loading or while a search
              // narrows that tab, so the card never quotes a filtered count.
              canApprove && !approvalsPaging.search && pendingApprovalsData?.metadata
                ? pendingApprovalsData.metadata.total
                : null
            ).map((card) => {
              const Icon = STAT_CARD_ICONS[card.key];
              return (
                <Card key={card.key}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">{card.label}</p>
                        <p className="text-2xl font-bold">{card.value}</p>
                        {card.caption && (
                          <p className="text-xs text-muted-foreground">{card.caption}</p>
                        )}
                      </div>
                      <Icon className={`h-6 w-6 ${STAT_CARD_ICON_COLORS[card.key]}`} />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="flex w-full max-w-full justify-start overflow-x-auto sm:inline-flex sm:w-auto [&>button]:shrink-0">
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
                ) : (myRequestsData?.data && myRequestsData.data.length > 0) ||
                  myPaging.search ? (
                  // Stay mounted on an empty *search* result, otherwise the
                  // search box unmounts and the filter can't be cleared.
                  <RequestDataTable
                    data={myRequestsData?.data ?? []}
                    showRequester={false}
                    showEdit={true}
                    showCancel={true}
                    onSearch={myPaging.handleSearch}
                    initialSearch={myPaging.search}
                    serverSidePagination={myPaging.buildPaginationProps(
                      myRequestsData?.metadata,
                      myFetching
                    )}
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
                  ) : (pendingApprovalsData?.data &&
                      pendingApprovalsData.data.length > 0) ||
                    approvalsPaging.search ? (
                    <RequestDataTable
                      data={(pendingApprovalsData?.data ?? []) as any}
                      showRequester={true}
                      onSearch={approvalsPaging.handleSearch}
                      initialSearch={approvalsPaging.search}
                      serverSidePagination={approvalsPaging.buildPaginationProps(
                        pendingApprovalsData?.metadata,
                        approvalsFetching
                      )}
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
                  ) : (allRequestsData?.data && allRequestsData.data.length > 0) ||
                    allPaging.search ? (
                    <RequestDataTable
                      data={allRequestsData?.data ?? []}
                      showDelete={isSuperAdmin}
                      onSearch={allPaging.handleSearch}
                      initialSearch={allPaging.search}
                      serverSidePagination={allPaging.buildPaginationProps(
                        allRequestsData?.metadata,
                        allFetching
                      )}
                    />
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
