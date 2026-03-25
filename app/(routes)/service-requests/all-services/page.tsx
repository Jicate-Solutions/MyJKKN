'use client';

import { useState } from 'react';
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
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import { useServiceRequests } from '@/hooks/service-requests/use-service-requests';
import { useServiceTypes } from '@/hooks/service-requests/use-service-types';
import { RequestDataTable } from '../_components/request-data-table';
import { RequestFilters } from '../_components/request-filters';
import { Plus, List, ShieldAlert } from 'lucide-react';

export default function AllServicesPage() {
  const [filters, setFilters] = useState<Record<string, string | undefined>>({});
  const { can, isSuperAdmin } = usePermissions();

  const canViewAll = can('service_requests.view_all') || isSuperAdmin;

  const { data: requestsData, isLoading } = useServiceRequests(
    canViewAll ? filters : undefined
  );
  const { data: serviceTypes } = useServiceTypes({ is_active: true });

  const handleFilterChange = (key: string, value: string | undefined) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleClearFilters = () => {
    setFilters({});
  };

  return (
    <ContentLayout title="All Services">
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
              <Link href="/service-requests">Service Requests</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>All Services</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <h1 className="text-2xl font-bold">All Requests</h1>
            <p className="text-muted-foreground">
              View and manage all service requests across the institution
            </p>
          </div>
          <Button asChild>
            <Link href="/service-requests/new">
              <Plus className="h-4 w-4 mr-2" />
              New Request
            </Link>
          </Button>
        </div>

        {!canViewAll ? (
          /* Permission denied state */
          <Card>
            <CardContent className="p-12 flex flex-col items-center justify-center gap-4">
              <ShieldAlert className="h-12 w-12 text-muted-foreground" />
              <div className="text-center">
                <p className="font-medium">Access Restricted</p>
                <p className="text-sm text-muted-foreground mt-1">
                  You don&apos;t have permission to view all service requests.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Filters */}
            <RequestFilters
              filters={filters}
              onFilterChange={handleFilterChange}
              onClear={handleClearFilters}
              serviceTypes={serviceTypes}
            />

            {/* Table */}
            <Card>
              <CardContent className="p-6">
                {isLoading ? (
                  <div className="flex justify-center items-center min-h-[200px]">
                    <p className="text-sm text-muted-foreground">Loading...</p>
                  </div>
                ) : requestsData?.data && requestsData.data.length > 0 ? (
                  <RequestDataTable
                    data={requestsData.data}
                    showRequester={true}
                    showServiceType={true}
                    showEdit={true}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center py-12">
                    <List className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-sm text-muted-foreground">
                      No service requests found
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </ContentLayout>
  );
}
