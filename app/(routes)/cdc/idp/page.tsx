'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink,
  BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { useIdpList, useSendIdpReminders } from '@/hooks/cdc/use-cdc-idp';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { IdpFilters } from '@/types/cdc/idp';
import {
  Plus, Search, ClipboardList, ListChecks, Clock, CheckCircle2, BellRing, Loader2
} from 'lucide-react';
import { BeatLoader } from 'react-spinners';

// A response is "pending" when submitted but never opened/edited since
// (updated_at <= submitted_at) — the same rule the stats cards use.
function isIdpPending(r: { submitted_at?: string | null; updated_at?: string | null }): boolean {
  const submitted = r.submitted_at ? new Date(r.submitted_at).getTime() : 0;
  const updated = r.updated_at ? new Date(r.updated_at).getTime() : 0;
  return !(updated > submitted);
}

// Self-submit workflow status badge (BUG-004298).
const IDP_STATUS_META: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-slate-100 text-slate-700 hover:bg-slate-100' },
  submitted: { label: 'Submitted', className: 'bg-amber-100 text-amber-700 hover:bg-amber-100' },
  approved: { label: 'Approved', className: 'bg-green-100 text-green-700 hover:bg-green-100' },
};

const idpStatsClient = createClientSupabaseClient();

interface IdpStats {
  total: number;
  reviewed: number;
  pending: number;
}

// Stats summary (BUG-004091).
// NOTE: cdc_idp_responses has no dedicated review/status column, so "reviewed"
// is derived from whether a response has been edited since submission
// (updated_at > submitted_at — i.e. opened and saved via the detail/edit flow).
// Counts honour the server-side filters (academic year, source) so they match
// the list's `total`, and are computed globally (not page-local) by fetching
// only the two timestamp columns for all matching rows.
function useIdpStats(filters: IdpFilters) {
  const { academic_year_label, source } = filters;
  return useQuery<IdpStats>({
    queryKey: ['cdc-idp', 'stats', { academic_year_label, source }],
    queryFn: async () => {
      let query = idpStatsClient
        .from('cdc_idp_responses')
        .select('submitted_at, updated_at');
      if (academic_year_label) query = query.eq('academic_year_label', academic_year_label);
      if (source) query = query.eq('source', source);

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      const rows = (data ?? []) as Array<{ submitted_at: string; updated_at: string }>;
      const total = rows.length;
      const reviewed = rows.filter(
        r => r.updated_at && r.submitted_at && new Date(r.updated_at).getTime() > new Date(r.submitted_at).getTime()
      ).length;
      return { total, reviewed, pending: total - reviewed };
    },
    staleTime: 2 * 60 * 1000,
  });
}

interface StatCardProps {
  label: string;
  value: number | undefined;
  isLoading: boolean;
  isError: boolean;
  icon: React.ElementType;
  color: string;
  hint?: string;
}

function StatCard({ label, value, isLoading, isError, icon: Icon, color, hint }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardDescription className="text-xs font-medium">{label}</CardDescription>
          <div className={`rounded-md p-1.5 ${color}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-16" />
        ) : isError ? (
          <span className="text-sm text-destructive">Error</span>
        ) : (
          <div className="text-3xl font-bold tabular-nums">{value ?? 0}</div>
        )}
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export default function IdpListPage() {
  const [filters, setFilters] = useState<IdpFilters>({ page: 1, limit: 20 });
  const [search, setSearch] = useState('');

  const { data, isLoading, error } = useIdpList(filters);
  const { data: stats, isLoading: statsLoading, isError: statsError } = useIdpStats(filters);
  const sendReminders = useSendIdpReminders();
  // Which single row is mid-send (so only that row's button spins).
  const [remindingId, setRemindingId] = useState<string | null>(null);

  const remindOne = (id: string) => {
    setRemindingId(id);
    sendReminders.mutate(
      { ids: [id], scope: 'selected' },
      { onSettled: () => setRemindingId(null) }
    );
  };

  const remindAllPending = () => {
    // Honour the active server-side filters so the bulk send matches the
    // PENDING count the operator currently sees.
    sendReminders.mutate({ scope: 'all_pending', filters });
  };

  const handleAcademicYearChange = (val: string) => {
    setFilters(f => ({ ...f, academic_year_label: val === 'all' ? undefined : val, page: 1 }));
  };

  const handleSourceChange = (val: string) => {
    setFilters(f => ({ ...f, source: val === 'all' ? undefined : val, page: 1 }));
  };

  const filtered = (data?.data ?? []).filter(r => {
    if (!search) return true;
    const name = (r.learner as { name?: string } | null)?.name?.toLowerCase() ?? '';
    const roll = (r.learner as { roll_number?: string } | null)?.roll_number?.toLowerCase() ?? '';
    const q = search.toLowerCase();
    return name.includes(q) || roll.includes(q);
  });

  return (
    <PermissionGuard module="cdc.idp" action="view">
    <ContentLayout title="IDP Responses">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink href="/cdc">CDC</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>IDP Responses</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-blue-600" />
            Individual Development Plans
          </h1>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Bulk reminder — nudge every pending learner in the current view. */}
            <PermissionGuard module="cdc.idp" action="edit" fallback={null}>
              <Button
                variant="outline"
                onClick={remindAllPending}
                disabled={sendReminders.isPending || (stats?.pending ?? 0) === 0}
                title={(stats?.pending ?? 0) === 0 ? 'No pending IDPs to remind' : 'Remind all pending learners'}
              >
                {sendReminders.isPending && !remindingId ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <BellRing className="w-4 h-4 mr-1" />
                )}
                Remind All Pending{(stats?.pending ?? 0) > 0 ? ` (${stats?.pending})` : ''}
              </Button>
            </PermissionGuard>
            <PermissionGuard module="cdc.idp" action="create" fallback={null}>
              <Button asChild>
                <Link href="/cdc/idp/new">
                  <Plus className="w-4 h-4 mr-1" />
                  New IDP Response
                </Link>
              </Button>
            </PermissionGuard>
          </div>
        </div>

        {/* Stats summary (BUG-004091) */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="TOTAL RESPONSES"
            value={stats?.total}
            isLoading={statsLoading}
            isError={statsError}
            icon={ListChecks}
            color="bg-blue-100 text-blue-700"
          />
          <StatCard
            label="PENDING REVIEW"
            value={stats?.pending}
            isLoading={statsLoading}
            isError={statsError}
            icon={Clock}
            color="bg-amber-100 text-amber-700"
            hint="Submitted, not yet opened/edited"
          />
          <StatCard
            label="COMPLETED / REVIEWED"
            value={stats?.reviewed}
            isLoading={statsLoading}
            isError={statsError}
            icon={CheckCircle2}
            color="bg-green-100 text-green-700"
            hint="Edited since submission"
          />
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search by learner name or roll number..."
              className="pl-9"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Select onValueChange={handleAcademicYearChange} defaultValue="all">
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Academic year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All years</SelectItem>
              <SelectItem value="2024-25">2024-25</SelectItem>
              <SelectItem value="2025-26">2025-26</SelectItem>
              <SelectItem value="2026-27">2026-27</SelectItem>
            </SelectContent>
          </Select>
          <Select onValueChange={handleSourceChange} defaultValue="all">
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              <SelectItem value="native_form">Native form</SelectItem>
              <SelectItem value="google_form_migration">Google Form import</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Content */}
        {isLoading && (
          <div className="flex justify-center py-12">
            <BeatLoader color="#3b82f6" />
          </div>
        )}

        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="py-4 text-red-700">
              Failed to load IDP responses: {error.message}
            </CardContent>
          </Card>
        )}

        {!isLoading && !error && (
          <>
            <p className="text-sm text-gray-500">{data?.total ?? 0} total responses</p>
            <div className="grid gap-3">
              {filtered.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-gray-500">
                    No IDP responses found. Use the button above to create the first one.
                  </CardContent>
                </Card>
              ) : (
                filtered.map(r => (
                  <Link key={r.id} href={`/cdc/idp/${r.id}`}>
                    <Card className="hover:border-blue-300 transition-colors cursor-pointer">
                      <CardHeader className="pb-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <CardTitle className="text-base font-medium">
                            {(r.learner as { name?: string } | null)?.name ?? 'Unknown learner'}
                          </CardTitle>
                          <div className="flex flex-wrap items-center gap-2">
                            {(() => {
                              const meta = IDP_STATUS_META[r.submission_status ?? 'draft'];
                              return meta ? (
                                <Badge className={`text-xs ${meta.className}`}>{meta.label}</Badge>
                              ) : null;
                            })()}
                            {isIdpPending(r) && (
                              <Badge className="text-xs bg-amber-100 text-amber-700 hover:bg-amber-100">
                                Pending
                              </Badge>
                            )}
                            <Badge variant="outline" className="text-xs">
                              {r.source === 'google_form_migration' ? 'Imported' : 'Native'}
                            </Badge>
                            {isIdpPending(r) && (
                              <PermissionGuard module="cdc.idp" action="edit" fallback={null}>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs text-blue-600 hover:text-blue-700"
                                  disabled={sendReminders.isPending}
                                  // Inside a <Link> — prevent navigation when the
                                  // reminder button is clicked.
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    remindOne(r.id);
                                  }}
                                  title="Send a completion reminder to this learner"
                                >
                                  {remindingId === r.id ? (
                                    <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                                  ) : (
                                    <BellRing className="w-3.5 h-3.5 mr-1" />
                                  )}
                                  Remind
                                </Button>
                              </PermissionGuard>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="text-sm text-gray-600 space-y-1">
                        <div className="flex gap-4">
                          <span>Roll: {(r.learner as { roll_number?: string } | null)?.roll_number ?? '—'}</span>
                          {r.academic_year_label && <span>Year: {r.academic_year_label}</span>}
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          {(r.interests as string[]).slice(0, 3).map((i, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs">{i}</Badge>
                          ))}
                          {(r.interests as string[]).length > 3 && (
                            <Badge variant="secondary" className="text-xs">
                              +{(r.interests as string[]).length - 3} more
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">
                          Submitted {new Date(r.submitted_at).toLocaleDateString()}
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                ))
              )}
            </div>

            {/* Pagination */}
            {(data?.total ?? 0) > (filters.limit ?? 20) && (
              <div className="flex justify-center gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={(filters.page ?? 1) <= 1}
                  onClick={() => setFilters(f => ({ ...f, page: (f.page ?? 1) - 1 }))}
                >
                  Previous
                </Button>
                <span className="text-sm text-gray-500 self-center">
                  Page {filters.page ?? 1}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={((filters.page ?? 1) * (filters.limit ?? 20)) >= (data?.total ?? 0)}
                  onClick={() => setFilters(f => ({ ...f, page: (f.page ?? 1) + 1 }))}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </ContentLayout>
    </PermissionGuard>
  );
}
