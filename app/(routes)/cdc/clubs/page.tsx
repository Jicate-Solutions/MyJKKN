'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink,
  BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { useClubList } from '@/hooks/cdc/use-cdc-clubs';
import type { ClubFilters, CdcClubStatus } from '@/types/cdc/clubs';
import { Plus, Search, Users } from 'lucide-react';
import { BeatLoader } from 'react-spinners';

// 'all' is a UI-only sentinel meaning "no status filter".
type StatusFilterValue = CdcClubStatus | 'all';

const STATUS_FILTERS: { value: StatusFilterValue; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'upcoming', label: 'Upcoming' },
];

const STATUS_BADGE: Record<CdcClubStatus, { label: string; className: string }> = {
  active: { label: 'Active', className: 'border-green-300 text-green-700 bg-green-50' },
  inactive: { label: 'Inactive', className: 'border-gray-300 text-gray-600 bg-gray-50' },
  upcoming: { label: 'Upcoming', className: 'border-amber-300 text-amber-700 bg-amber-50' },
};

export default function ClubsListPage() {
  // Default to the Active view (matches the prior "Active only" default).
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('active');
  const filters: ClubFilters = {
    page: 1,
    limit: 20,
    status: statusFilter === 'all' ? undefined : statusFilter,
  };
  const [search, setSearch] = useState('');

  const { data, isLoading, error } = useClubList(filters);

  const filtered = (data?.data ?? []).filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <PermissionGuard module="cdc.clubs" action="view">
    <ContentLayout title="Clubs">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink href="/cdc">CDC</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Clubs</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-600" />
            Clubs
          </h1>
          <PermissionGuard module="cdc.clubs" action="create" fallback={null}>
            <Button asChild>
              <Link href="/cdc/clubs/new">
                <Plus className="w-4 h-4 mr-1" />
                New Club
              </Link>
            </Button>
          </PermissionGuard>
        </div>

        {/* Filters */}
        <div className="flex gap-4 flex-wrap items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search clubs..."
              className="pl-9"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="status-filter" className="text-sm text-gray-600">Status</Label>
            <Select
              value={statusFilter}
              onValueChange={v => setStatusFilter(v as StatusFilterValue)}
            >
              <SelectTrigger id="status-filter" className="w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading && (
          <div className="flex justify-center py-12"><BeatLoader color="#3b82f6" /></div>
        )}

        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="py-4 text-red-700">
              Failed to load clubs: {error.message}
            </CardContent>
          </Card>
        )}

        {!isLoading && !error && (
          <>
            <p className="text-sm text-gray-500">{data?.total ?? 0} clubs</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.length === 0 ? (
                <Card className="col-span-full">
                  <CardContent className="py-12 text-center text-gray-500">
                    No clubs found. Create the first one.
                  </CardContent>
                </Card>
              ) : (
                filtered.map(c => (
                  <Link key={c.id} href={`/cdc/clubs/${c.id}`}>
                    <Card className="h-full hover:border-blue-300 transition-colors cursor-pointer">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-base">{c.name}</CardTitle>
                          {c.status !== 'active' && (
                            <Badge
                              variant="outline"
                              className={`text-xs shrink-0 ${STATUS_BADGE[c.status]?.className ?? ''}`}
                            >
                              {STATUS_BADGE[c.status]?.label ?? c.status}
                            </Badge>
                          )}
                        </div>
                        {c.club_type && (
                          <p className="text-xs text-gray-400 capitalize">{c.club_type}</p>
                        )}
                      </CardHeader>
                      <CardContent className="text-sm text-gray-600 space-y-2">
                        {c.description && (
                          <p className="line-clamp-2">{c.description}</p>
                        )}
                        <div className="flex items-center gap-1 text-blue-600 font-medium">
                          <Users className="w-3.5 h-3.5" />
                          <span>{c.member_count} member{c.member_count !== 1 ? 's' : ''}</span>
                        </div>
                        {c.formed_on && (
                          <p className="text-xs text-gray-400">
                            Founded {new Date(c.formed_on).toLocaleDateString()}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </ContentLayout>
    </PermissionGuard>
  );
}
