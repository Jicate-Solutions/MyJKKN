'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { Badge } from '@/components/ui/badge';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { usePendingApprovals, usePendingApprovalCount } from '@/hooks/service-requests/use-service-requests';
import { RequestStatusBadge } from '../_components/request-status-badge';
import { PriorityBadge } from '../_components/priority-badge';
import { formatDistanceToNow } from 'date-fns';
import { Eye, Clock, CheckCircle } from 'lucide-react';
import type { ServiceRequest } from '@/types/service-request';

export default function ApprovalsPage() {
  const router = useRouter();
  const { data: approvalsData, isLoading } = usePendingApprovals();
  const { data: countData } = usePendingApprovalCount();

  // Extract service requests from approvals
  const requests: ServiceRequest[] = useMemo(() => {
    if (!approvalsData?.data) return [];
    return approvalsData.data
      .map((a: any) => a.service_request)
      .filter(Boolean);
  }, [approvalsData]);

  const columns = useMemo<ColumnDef<ServiceRequest>[]>(
    () => [
      {
        accessorKey: 'request_number',
        header: 'Request #',
        cell: ({ row }) => (
          <span className="font-mono text-sm font-medium">
            {row.original.request_number}
          </span>
        ),
      },
      {
        accessorKey: 'service_type.name',
        header: 'Service Type',
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.service_type?.name || '-'}
          </span>
        ),
      },
      {
        accessorKey: 'requester.full_name',
        header: 'Requester',
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.requester?.full_name || '-'}
          </span>
        ),
      },
      {
        accessorKey: 'priority',
        header: 'Priority',
        cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
      },
      {
        accessorKey: 'submitted_at',
        header: 'Waiting Since',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.submitted_at
              ? formatDistanceToNow(new Date(row.original.submitted_at), {
                  addSuffix: true,
                })
              : '-'}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <Button
            variant="default"
            size="sm"
            onClick={() => router.push(`/service-requests/${row.original.id}`)}
            className="gap-1"
          >
            <Eye className="h-4 w-4" />
            Review
          </Button>
        ),
      },
    ],
    [router]
  );

  return (
    <ContentLayout title="Pending Approvals">
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
            <BreadcrumbPage>Approvals</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <h1 className="text-2xl font-bold">Pending Approvals</h1>
            <p className="text-muted-foreground">
              Review and process service requests awaiting your approval
            </p>
          </div>
          {countData && (
            <Badge variant="secondary" className="text-sm gap-1 px-3 py-1.5">
              <Clock className="h-4 w-4" />
              {countData.count} pending
            </Badge>
          )}
        </div>

        {/* Content */}
        <Card>
          <CardContent className="p-6">
            {isLoading ? (
              <div className="flex justify-center items-center min-h-[200px]">
                <p className="text-sm text-muted-foreground">Loading approvals...</p>
              </div>
            ) : requests.length > 0 ? (
              <DataTable
                columns={columns}
                data={requests}
                filterColumn="request_number"
                searchPlaceholder="Search by request number..."
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-12">
                <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
                <p className="text-sm text-muted-foreground">
                  All caught up! No pending approvals.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
