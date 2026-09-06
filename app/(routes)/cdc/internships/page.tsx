'use client';

// app/(routes)/cdc/internships/page.tsx
// CDC Sprint 4 — Corporate internship list page

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Briefcase, CheckCircle, Clock, XCircle, AlertCircle } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import Loading from '@/components/Loading/Loading';
import { useCdcInternships } from '@/hooks/cdc/use-cdc-internships';
import type { InternshipAssignmentStatus } from '@/types/cdc/internships';

const STATUS_LABELS: Record<string, { label: string; icon: React.FC<{ className?: string }> }> = {
  pending: { label: 'Pending', icon: Clock },
  active: { label: 'Active', icon: AlertCircle },
  completed: { label: 'Completed', icon: CheckCircle },
  withdrawn: { label: 'Withdrawn', icon: XCircle },
  cancelled: { label: 'Cancelled', icon: XCircle },
};

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  active: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  withdrawn: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-100 text-red-700',
};

export default function CdcInternshipsPage() {
  const {
    internships,
    total,
    page,
    loading,
    error,
    fetchInternships,
    updateFilters,
  } = useCdcInternships({ internship_type: 'corporate_internship' });

  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    fetchInternships();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    updateFilters({
      status: value === 'all' ? undefined : (value as InternshipAssignmentStatus),
    });
    fetchInternships({
      status: value === 'all' ? undefined : (value as InternshipAssignmentStatus),
    });
  };

  return (
    <PermissionGuard module="cdc.internships" action="view">
    <ContentLayout title="Corporate Internships">
      <div className="space-y-6">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>CDC</BreadcrumbPage>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Corporate Internships</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Corporate Internships</h1>
            <p className="text-sm text-gray-500 mt-1">
              {total} internship{total !== 1 ? 's' : ''} total
            </p>
          </div>
          <PermissionGuard module="cdc.internships" action="create" fallback={null}>
            <Link href="/cdc/internships/new">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                New Internship
              </Button>
            </Link>
          </PermissionGuard>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="withdrawn">Withdrawn</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Content */}
        {loading && <Loading />}

        {!loading && error && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
              <Briefcase className="w-12 h-12 text-red-300 mb-1" />
              <p className="text-red-600 text-sm font-medium">Failed to load corporate internships</p>
              <p className="text-gray-500 text-sm text-center">{error}</p>
              <Button variant="outline" size="sm" onClick={() => fetchInternships()}>
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {!loading && !error && internships.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Briefcase className="w-12 h-12 text-gray-300 mb-4" />
              <p className="text-gray-500 text-sm">No corporate internships found.</p>
              <PermissionGuard module="cdc.internships" action="create" fallback={null}>
                <Link href="/cdc/internships/new" className="mt-4">
                  <Button variant="outline" size="sm">
                    <Plus className="w-4 h-4 mr-2" />
                    Create first internship
                  </Button>
                </Link>
              </PermissionGuard>
            </CardContent>
          </Card>
        )}

        {!loading && internships.length > 0 && (
          <div className="grid gap-4">
            {internships.map(item => {
              const statusInfo = STATUS_LABELS[item.status] ?? STATUS_LABELS.pending;
              const StatusIcon = statusInfo.icon;
              const hasCert = !!(item.certificate && !item.certificate.is_revoked);

              return (
                <Link key={item.id} href={`/cdc/internships/${item.id}`}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-gray-900 truncate">
                              {item.site?.site_name ?? 'Site not found'}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[item.status] ?? ''}`}
                            >
                              <StatusIcon className="w-3 h-3" />
                              {statusInfo.label}
                            </span>
                            {hasCert && (
                              <Badge variant="outline" className="text-green-700 border-green-300 text-xs">
                                Certificate issued
                              </Badge>
                            )}
                          </div>
                          <div className="mt-1 text-sm text-gray-500 flex flex-wrap gap-3">
                            {item.site?.city && (
                              <span>{item.site.city}{item.site.state ? `, ${item.site.state}` : ''}</span>
                            )}
                            <span>
                              {item.rotation_start_date} — {item.rotation_end_date}
                            </span>
                            {item.attendance_percentage != null && (
                              <span>Attendance: {item.attendance_percentage}%</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}

        {/* Pagination hint */}
        {total > 20 && (
          <p className="text-xs text-gray-400 text-center">
            Showing {internships.length} of {total} results.
          </p>
        )}
      </div>
    </ContentLayout>
    </PermissionGuard>
  );
}
