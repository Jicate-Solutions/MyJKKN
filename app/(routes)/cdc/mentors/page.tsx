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
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { useMentorPairingList } from '@/hooks/cdc/use-cdc-mentors';
import { useAuth } from '@/hooks/use-auth';
import { canEditMentorPairing } from '@/lib/services/cdc/mentor-access';
import type { MentorPairingFilters, MentoringStatus } from '@/types/cdc/mentors';
import { Plus, UserCog, Activity, Building2, Eye } from 'lucide-react';
import { BeatLoader } from 'react-spinners';

const STATUS_COLORS: Record<MentoringStatus, string> = {
  active: 'bg-green-100 text-green-800 border-green-200',
  paused: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  concluded: 'bg-gray-100 text-gray-600 border-gray-200',
};

export default function MentorPairingsPage() {
  const [filters, setFilters] = useState<MentorPairingFilters>({ page: 1, limit: 20 });
  const { data, isLoading, error } = useMentorPairingList(filters);
  const { profile } = useAuth();

  const handleStatusChange = (val: string) => {
    setFilters(f => ({
      ...f,
      status: val === 'all' ? undefined : (val as MentoringStatus),
      page: 1
    }));
  };

  return (
    <PermissionGuard module="cdc.mentors" action="view">
    <ContentLayout title="Mentor Pairings">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink href="/cdc">CDC</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Mentor Pairings</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <UserCog className="w-6 h-6 text-blue-600" />
            Mentor Pairings
          </h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/cdc/mentors/rollups">
                <Activity className="w-4 h-4 mr-1" />
                Activity
              </Link>
            </Button>
            <PermissionGuard module="cdc.mentors" action="create" fallback={null}>
              <Button asChild>
                <Link href="/cdc/mentors/new">
                  <Plus className="w-4 h-4 mr-1" />
                  New Pairing
                </Link>
              </Button>
            </PermissionGuard>
          </div>
        </div>

        {/* Filter */}
        <div className="flex gap-3">
          <Select onValueChange={handleStatusChange} defaultValue="all">
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="concluded">Concluded</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading && (
          <div className="flex justify-center py-12"><BeatLoader color="#3b82f6" /></div>
        )}

        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="py-4 text-red-700">
              Failed to load pairings: {error.message}
            </CardContent>
          </Card>
        )}

        {!isLoading && !error && (
          <>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm text-gray-500">{data?.total ?? 0} pairings</p>
              <p className="text-xs text-gray-400">
                Showing mentor pairings across all colleges. You can edit only your own college&apos;s pairs.
              </p>
            </div>
            <div className="grid gap-3">
              {(data?.data ?? []).length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-gray-500">
                    No mentor pairings yet. Create the first one.
                  </CardContent>
                </Card>
              ) : (
                (data?.data ?? []).map(p => {
                  // A pairing's owning college is the mentee's institution (falls
                  // back to the mentor's if the mentee has none). This mirrors the
                  // write-RLS anchor so the view-only cue matches who can edit.
                  const college =
                    p.mentee?.institution?.name ?? p.mentor?.institution?.name ?? null;
                  const ownerInstitutionId =
                    p.mentee?.institution_id ?? p.mentor?.institution_id ?? null;
                  const canEdit = canEditMentorPairing(profile, ownerInstitutionId);
                  return (
                    <Link key={p.id} href={`/cdc/mentors/${p.id}`}>
                      <Card className="hover:border-blue-300 transition-colors cursor-pointer">
                        <CardHeader className="pb-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <CardTitle className="text-base">
                              {p.mentor?.name ?? 'Unknown'} → {p.mentee?.name ?? 'Unknown'}
                            </CardTitle>
                            <div className="flex items-center gap-2 shrink-0">
                              {!canEdit && (
                                <Badge variant="outline" className="text-xs border-gray-200 text-gray-500 gap-1">
                                  <Eye className="w-3 h-3" /> View only
                                </Badge>
                              )}
                              <Badge className={`text-xs border ${STATUS_COLORS[p.status as MentoringStatus]}`} variant="outline">
                                {p.status}
                              </Badge>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="text-sm text-gray-500 space-y-1">
                          <p className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-gray-400" />
                            {college ?? 'College not set'}
                          </p>
                          <p>Paired: {new Date(p.paired_at).toLocaleDateString()}</p>
                          {p.concluded_at && (
                            <p>Concluded: {new Date(p.concluded_at).toLocaleDateString()}</p>
                          )}
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </ContentLayout>
    </PermissionGuard>
  );
}
