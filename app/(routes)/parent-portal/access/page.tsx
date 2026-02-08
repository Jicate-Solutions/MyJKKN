'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Plus, Users, UserCheck, KeyRound, RefreshCw, ToggleLeft, ToggleRight, Copy, Trash2 } from 'lucide-react';
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
  useParentAccessRecords,
  useParentAccessStats,
  useToggleParentAccess,
  useRegenerateAccessCode,
  useDeleteParentAccess,
} from '@/hooks/parent-portal';
import type { ParentAccessFilters, AccessRelationship } from '@/types/parent-portal';
import {
  ACCESS_RELATIONSHIP_LABELS,
  ACCESS_LEVEL_LABELS,
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
import toast from 'react-hot-toast';

export default function ParentAccessPage() {
  const { canAccess, isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const { institutions, loading: institutionsLoading } = useUserInstitutionAccess();
  const institutionId = institutions?.[0]?.institution_id || '';

  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<boolean | undefined>(undefined);
  const [relationshipFilter, setRelationshipFilter] = useState<AccessRelationship | undefined>(undefined);
  const [page, setPage] = useState(1);

  const canView = isSuperAdmin || canAccess('tqm.parent_portal', 'view');

  const filters: ParentAccessFilters = useMemo(() => ({
    institution_id: institutionId,
    search: search || undefined,
    is_active: activeFilter,
    relationship: relationshipFilter,
    page,
    limit: 20,
  }), [institutionId, search, activeFilter, relationshipFilter, page]);

  const { data, isLoading, refetch } = useParentAccessRecords(filters);
  const { data: stats } = useParentAccessStats(institutionId);
  const toggleMutation = useToggleParentAccess();
  const regenerateMutation = useRegenerateAccessCode();
  const deleteMutation = useDeleteParentAccess();

  const records = data?.data || [];
  const metadata = data?.metadata || { total: 0, page: 1, limit: 20, totalPages: 1 };
  const loading = isLoading || institutionsLoading;

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success('Access code copied to clipboard');
  };

  const handleToggle = (id: string, currentActive: boolean) => {
    toggleMutation.mutate({ id, isActive: !currentActive });
  };

  const handleRegenerate = (id: string) => {
    regenerateMutation.mutate(id);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this access record?')) {
      deleteMutation.mutate(id);
    }
  };

  if (permissionsLoading || institutionsLoading) {
    return (
      <ContentLayout title="Parent Access Management">
        <div className="flex items-center justify-center min-h-[400px]">
          <BeatLoader color="#00e902" />
        </div>
      </ContentLayout>
    );
  }

  if (!canView) {
    return (
      <ContentLayout title="Parent Access Management">
        <div className="text-center py-8">
          <p className="text-destructive">
            You don&apos;t have permission to view parent access management.
          </p>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Parent Access Management">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Parent Portal', href: '/parent-portal' },
          { label: 'Access Management', href: '/parent-portal/access' },
        ]}
      />
      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold py-1">Access Management</h1>
            <p className="text-sm text-muted-foreground">
              Manage parent access codes and permissions
            </p>
          </div>
          <Button asChild>
            <Link href="/parent-portal/access/new">
              <Plus className="mr-2 h-4 w-4" />
              Create Access
            </Link>
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Records</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.total_access_records || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active</CardTitle>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats?.active_count || 0}</div>
              <p className="text-xs text-muted-foreground">{stats?.inactive_count || 0} inactive</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Recently Active</CardTitle>
              <KeyRound className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.recently_active || 0}</div>
              <p className="text-xs text-muted-foreground">Last 30 days</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">By Relationship</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1">
                {stats?.by_relationship && Object.entries(stats.by_relationship).map(([rel, count]) => (
                  count > 0 && (
                    <Badge key={rel} variant="outline" className="text-xs">
                      {ACCESS_RELATIONSHIP_LABELS[rel as AccessRelationship] || rel}: {count}
                    </Badge>
                  )
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters & Table */}
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <Input
                placeholder="Search by name, email, phone, or code..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="max-w-sm"
              />
              <Select
                value={activeFilter === undefined ? 'all' : activeFilter ? 'active' : 'inactive'}
                onValueChange={(v) => {
                  setActiveFilter(v === 'all' ? undefined : v === 'active');
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={relationshipFilter || 'all'}
                onValueChange={(v) => {
                  setRelationshipFilter(v === 'all' ? undefined : v as AccessRelationship);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Relationship" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="parent">Parent</SelectItem>
                  <SelectItem value="guardian">Guardian</SelectItem>
                  <SelectItem value="sponsor">Sponsor</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <div className="flex justify-center items-center p-8">
                <BeatLoader color="#00e902" />
              </div>
            ) : records.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>No parent access records found.</p>
                <Button asChild className="mt-4" variant="outline">
                  <Link href="/parent-portal/access/new">Create First Access</Link>
                </Button>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Parent Name</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Relationship</TableHead>
                      <TableHead>Access Code</TableHead>
                      <TableHead>Level</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Logins</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-medium">{record.parent_name}</TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {record.parent_email && <div>{record.parent_email}</div>}
                            {record.parent_phone && <div className="text-muted-foreground">{record.parent_phone}</div>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {ACCESS_RELATIONSHIP_LABELS[record.relationship as AccessRelationship] || record.relationship}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <code className="bg-muted px-2 py-1 rounded text-sm font-mono">
                              {record.access_code}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => handleCopyCode(record.access_code)}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={record.access_level === 'interact' ? 'default' : 'secondary'}>
                            {ACCESS_LEVEL_LABELS[record.access_level as keyof typeof ACCESS_LEVEL_LABELS] || record.access_level}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={record.is_active ? 'default' : 'destructive'}>
                            {record.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell>{record.access_count}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleToggle(record.id, record.is_active)}
                              title={record.is_active ? 'Deactivate' : 'Activate'}
                            >
                              {record.is_active ? (
                                <ToggleRight className="h-4 w-4 text-green-600" />
                              ) : (
                                <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleRegenerate(record.id)}
                              title="Regenerate Code"
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => handleDelete(record.id)}
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
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
