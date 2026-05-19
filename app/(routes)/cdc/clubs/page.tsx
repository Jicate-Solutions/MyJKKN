'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink,
  BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useClubList } from '@/hooks/cdc/use-cdc-clubs';
import type { ClubFilters } from '@/types/cdc/clubs';
import { Plus, Search, Users } from 'lucide-react';
import { BeatLoader } from 'react-spinners';

export default function ClubsListPage() {
  const [filters, setFilters] = useState<ClubFilters>({ page: 1, limit: 20, is_active: true });
  const [search, setSearch] = useState('');

  const { data, isLoading, error } = useClubList(filters);

  const filtered = (data?.data ?? []).filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
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
          <Button asChild>
            <Link href="/cdc/clubs/new">
              <Plus className="w-4 h-4 mr-1" />
              New Club
            </Link>
          </Button>
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
            <Switch
              id="active-only"
              checked={filters.is_active !== false}
              onCheckedChange={v =>
                setFilters(f => ({ ...f, is_active: v ? true : undefined, page: 1 }))
              }
            />
            <Label htmlFor="active-only">Active only</Label>
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
                          {!c.is_active && (
                            <Badge variant="outline" className="text-xs shrink-0">Inactive</Badge>
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
  );
}
