'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Plus, MessageSquare, Mail, MailOpen, AlertTriangle } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { BeatLoader } from 'react-spinners';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { usePermissions } from '@/hooks/use-permissions';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import {
  useAdminCommunications,
  useAdminCommunicationStats,
  useDeleteAdminCommunication,
} from '@/hooks/parent-portal';
import type {
  CommunicationType,
  CommunicationPriority,
  ParentCommunication,
} from '@/types/parent-portal';
import {
  COMMUNICATION_TYPE_LABELS,
  PRIORITY_LABELS,
  getPriorityColor,
} from '@/types/parent-portal';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function CommunicationsPage() {
  const { canAccess, isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const { institutions, loading: institutionsLoading } = useUserInstitutionAccess();
  const institutionId = institutions?.[0]?.institution_id || '';

  const [typeFilter, setTypeFilter] = useState<CommunicationType | undefined>(undefined);
  const [priorityFilter, setPriorityFilter] = useState<CommunicationPriority | undefined>(undefined);
  const [readFilter, setReadFilter] = useState<boolean | undefined>(undefined);
  const [page, setPage] = useState(1);

  const canView = isSuperAdmin || canAccess('tqm.parent_portal.communication', 'view');

  const filters = useMemo(
    () => ({
      institution_id: institutionId,
      type: typeFilter,
      priority: priorityFilter,
      is_read: readFilter,
      page,
      limit: 20,
    }),
    [institutionId, typeFilter, priorityFilter, readFilter, page]
  );

  const { data, isLoading } = useAdminCommunications(filters);
  const { data: stats } = useAdminCommunicationStats(institutionId);
  const deleteMutation = useDeleteAdminCommunication();

  const communications = data?.data || [];
  const metadata = data?.metadata || { total: 0, page: 1, limit: 20, totalPages: 1 };
  const loading = isLoading || institutionsLoading;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (comm: ParentCommunication) => {
    if (comm.read_at) {
      return <Badge variant="default" className="bg-blue-100 text-blue-700">Read</Badge>;
    }
    return <Badge variant="secondary">Sent</Badge>;
  };

  if (permissionsLoading || institutionsLoading) {
    return (
      <ContentLayout title="Communications">
        <div className="flex items-center justify-center min-h-[400px]">
          <BeatLoader color="#00e902" />
        </div>
      </ContentLayout>
    );
  }

  if (!canView) {
    return (
      <ContentLayout title="Communications">
        <div className="text-center py-8">
          <p className="text-destructive">
            You don&apos;t have permission to view communications.
          </p>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Parent Communications">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Parent Portal', href: '/parent-portal' },
          { label: 'Communications', href: '/parent-portal/communications' },
        ]}
      />
      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold py-1">Communications</h1>
            <p className="text-sm text-muted-foreground">
              View and manage all parent communications
            </p>
          </div>
          <Button asChild>
            <Link href="/parent-portal/communications/new">
              <Plus className="mr-2 h-4 w-4" />
              Send Communication
            </Link>
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Sent</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.total || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Unread</CardTitle>
              <Mail className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{stats?.unread || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Read</CardTitle>
              <MailOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats?.read || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">By Type</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1">
                {stats?.by_type &&
                  Object.entries(stats.by_type).map(
                    ([type, count]) =>
                      (count as number) > 0 && (
                        <Badge key={type} variant="outline" className="text-xs">
                          {COMMUNICATION_TYPE_LABELS[type as CommunicationType] || type}:{' '}
                          {count as number}
                        </Badge>
                      )
                  )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters & Table */}
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <Select
                value={typeFilter || 'all'}
                onValueChange={(v) => {
                  setTypeFilter(v === 'all' ? undefined : (v as CommunicationType));
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {Object.entries(COMMUNICATION_TYPE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={priorityFilter || 'all'}
                onValueChange={(v) => {
                  setPriorityFilter(v === 'all' ? undefined : (v as CommunicationPriority));
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={readFilter === undefined ? 'all' : readFilter ? 'read' : 'unread'}
                onValueChange={(v) => {
                  setReadFilter(v === 'all' ? undefined : v === 'read');
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Read Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="read">Read</SelectItem>
                  <SelectItem value="unread">Unread</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <div className="flex justify-center items-center p-8">
                <BeatLoader color="#00e902" />
              </div>
            ) : communications.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <MessageSquare className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>No communications found.</p>
                <Button asChild className="mt-4" variant="outline">
                  <Link href="/parent-portal/communications/new">
                    Send First Communication
                  </Link>
                </Button>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Subject</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Sent At</TableHead>
                      <TableHead>Learner</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {communications.map((comm: ParentCommunication) => (
                      <TableRow key={comm.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{comm.subject}</div>
                            <div className="text-xs text-muted-foreground line-clamp-1">
                              {comm.content}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {COMMUNICATION_TYPE_LABELS[comm.type] || comm.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={getPriorityColor(comm.priority)}>
                            {PRIORITY_LABELS[comm.priority] || comm.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>{getStatusBadge(comm)}</TableCell>
                        <TableCell className="text-sm">
                          {formatDate(comm.created_at)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {comm.learner?.name || '--'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Pagination */}
                {metadata.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                      Showing {(metadata.page - 1) * metadata.limit + 1} to{' '}
                      {Math.min(metadata.page * metadata.limit, metadata.total)} of{' '}
                      {metadata.total} records
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page <= 1}
                        onClick={() => setPage(page - 1)}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= metadata.totalPages}
                        onClick={() => setPage(page + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
