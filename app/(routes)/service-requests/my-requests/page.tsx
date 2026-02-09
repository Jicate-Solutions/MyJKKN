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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useMyServiceRequests } from '@/hooks/service-requests/use-service-requests';
import { useServiceTypes } from '@/hooks/service-requests/use-service-types';
import { RequestDataTable } from '../_components/request-data-table';
import { RequestFilters } from '../_components/request-filters';
import { Plus, Inbox } from 'lucide-react';
export default function MyRequestsPage() {
  const [filters, setFilters] = useState<Record<string, string | undefined>>({});
  const { data: requestsData, isLoading } = useMyServiceRequests(filters);
  const { data: serviceTypes } = useServiceTypes({ is_active: true });

  const handleFilterChange = (key: string, value: string | undefined) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleClearFilters = () => {
    setFilters({});
  };

  return (
    <ContentLayout title="My Requests">
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
            <BreadcrumbPage>My Requests</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <h1 className="text-2xl font-bold">My Requests</h1>
            <p className="text-muted-foreground">
              View and track all your service requests
            </p>
          </div>
          <Button asChild>
            <Link href="/service-requests/new">
              <Plus className="h-4 w-4 mr-2" />
              New Request
            </Link>
          </Button>
        </div>

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
                showRequester={false}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-12">
                <Inbox className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground mb-4">
                  No requests found
                </p>
                <Button asChild variant="outline">
                  <Link href="/service-requests/new">Create a new request</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
