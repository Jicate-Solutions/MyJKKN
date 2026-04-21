'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, Award, CheckCircle, FileText, Clock, PauseCircle } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePermissions } from '@/hooks/use-permissions';
import { usePrivilegeGroups, useDeletePrivilegeGroup, useGlobalRenewalSummary } from '@/hooks/academic/use-privileges';
import { PrivilegeGroupsTable } from './_components/privilege-groups-table';
import type { PrivilegeGroupStatus, PrivilegeGroupFilters } from '@/types/privileges';

export default function PrivilegeGroupsPage() {
  const router = useRouter();
  const { userProfile, isSuperAdmin } = usePermissions();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PrivilegeGroupStatus | 'all'>('all');

  const filters: PrivilegeGroupFilters = {
    search: search || undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    is_template: false,
  };

  const { data: groups, isLoading } = usePrivilegeGroups(filters);
  const { data: renewalSummary } = useGlobalRenewalSummary();
  const deleteGroup = useDeletePrivilegeGroup();

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to archive this privilege group?')) {
      deleteGroup.mutate(id);
    }
  };

  // Handle both array and paginated response shapes
  const groupList = Array.isArray(groups) ? groups : groups?.data ?? [];

  return (
    <ContentLayout title="Privilege Groups">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Award className="h-6 w-6 text-amber-600" />
              Privilege Groups
            </h2>
            <p className="text-muted-foreground mt-1">
              Recognize standing and grant privileges to learners.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => router.push('/academic/privileges/templates')}
            >
              Templates
            </Button>
            <Button onClick={() => router.push('/academic/privileges/new')}>
              <Plus className="h-4 w-4 mr-2" />
              Create Group
            </Button>
          </div>
        </div>

        {/* Renewal Summary */}
        {renewalSummary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-green-100 p-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-600">{renewalSummary.active}</div>
                    <p className="text-xs text-muted-foreground">Active</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-amber-100 p-2">
                    <FileText className="h-4 w-4 text-amber-600" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-amber-600">{renewalSummary.pending_report}</div>
                    <p className="text-xs text-muted-foreground">Pending Report</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-blue-100 p-2">
                    <Clock className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-blue-600">{renewalSummary.pending_review}</div>
                    <p className="text-xs text-muted-foreground">Pending Review</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-red-100 p-2">
                    <PauseCircle className="h-4 w-4 text-red-600" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-red-600">{renewalSummary.paused}</div>
                    <p className="text-xs text-muted-foreground">Paused</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filter Bar */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or reference code..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as PrivilegeGroupStatus | 'all')}
              >
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <PrivilegeGroupsTable
          groups={groupList}
          isLoading={isLoading}
          onDelete={handleDelete}
        />
      </div>
    </ContentLayout>
  );
}
