'use client';

// Referrals of a consultant row that stands for a team member (staff_id) or a
// learner (learner_referrer_id). Those referrals are recorded on the referred
// learner — learners_profiles.referral_type + referred_by_id — not in
// consultant_lead_attributions, so the agency Referrals table would be empty.

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import type { ColumnDef } from '@tanstack/react-table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DataTable } from '@/components/ui/data-table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClipboardList } from 'lucide-react';
import { LifecycleStatusBadge, getStatusLabel } from '@/components/learners/lifecycle-status-badge';
import type { LifecycleStatus } from '@/types/learner-profile';
import type {
  ReferrerProfile,
  ReferredLearner,
} from '@/app/api/admission/consultants/referrers/[type]/[id]/route';

export type LinkedReferrer = { type: 'internal' | 'student'; id: string };

/** The referrer's profile and every learner they referred. Shared query key, so the page's stat cards and the tab make one request. */
export function useLinkedReferrer(linked: LinkedReferrer | null) {
  return useQuery<{ profile: ReferrerProfile; referrals: ReferredLearner[] }>({
    queryKey: ['consultant-referrer', linked?.type, linked?.id],
    queryFn: async () => {
      const res = await fetch(`/api/admission/consultants/referrers/${linked!.type}/${linked!.id}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Failed to load referrals');
      return body;
    },
    enabled: !!linked,
  });
}

export function ReferrerReferralsPanel({ linked }: { linked: LinkedReferrer }) {
  const { data, isLoading, error } = useLinkedReferrer(linked);
  const [institutionFilter, setInstitutionFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const referrals = useMemo(() => data?.referrals ?? [], [data]);
  const distinct = (pick: (r: ReferredLearner) => string | null) =>
    [...new Set(referrals.map(pick).filter(Boolean) as string[])].sort();
  const institutions = useMemo(() => distinct((r) => r.institution), [referrals]);
  const years = useMemo(() => distinct((r) => r.admission_year).reverse(), [referrals]);
  const statuses = useMemo(() => distinct((r) => r.lifecycle_status), [referrals]);

  const filtered = useMemo(
    () =>
      referrals.filter(
        (r) =>
          (institutionFilter === 'all' || r.institution === institutionFilter) &&
          (yearFilter === 'all' || r.admission_year === yearFilter) &&
          (statusFilter === 'all' || r.lifecycle_status === statusFilter)
      ),
    [referrals, institutionFilter, yearFilter, statusFilter]
  );

  // Status cards, as on the agency Referrals tab: counts honour the Institution
  // and Year filters but not Status, so clicking a card never zeroes the others.
  const statCardBase = useMemo(
    () =>
      referrals.filter(
        (r) =>
          (institutionFilter === 'all' || r.institution === institutionFilter) &&
          (yearFilter === 'all' || r.admission_year === yearFilter)
      ),
    [referrals, institutionFilter, yearFilter]
  );
  const statusCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of statCardBase) {
      const s = r.lifecycle_status ?? 'unknown';
      map.set(s, (map.get(s) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [statCardBase]);

  const columns = useMemo<ColumnDef<ReferredLearner>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (r) => r.name,
        header: 'Learner',
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.name}</div>
            {row.original.roll_number && (
              <div className="text-xs text-muted-foreground">{row.original.roll_number}</div>
            )}
          </div>
        ),
      },
      { id: 'institution', accessorFn: (r) => r.institution ?? '', header: 'Institution', cell: ({ row }) => row.original.institution ?? '—' },
      { id: 'program', accessorFn: (r) => r.program ?? '', header: 'Programme', cell: ({ row }) => row.original.program ?? '—' },
      { id: 'year', accessorFn: (r) => r.admission_year ?? '', header: 'Admission Year', cell: ({ row }) => row.original.admission_year ?? '—' },
      {
        id: 'status',
        accessorFn: (r) => r.lifecycle_status ?? '',
        header: 'Status',
        cell: ({ row }) =>
          row.original.lifecycle_status ? (
            <LifecycleStatusBadge status={row.original.lifecycle_status as LifecycleStatus} />
          ) : (
            '—'
          ),
      },
      {
        id: 'enquiry_date',
        accessorFn: (r) => r.enquiry_date ?? '',
        header: 'Admitted Date',
        cell: ({ row }) =>
          row.original.enquiry_date ? format(new Date(row.original.enquiry_date), 'dd MMM yyyy') : '—',
      },
    ],
    []
  );

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error) return <p className="py-8 text-center text-destructive">{(error as Error).message}</p>;

  return (
    <>
    {statusCounts.length > 0 && (
      <div className="mb-4 grid gap-4 md:grid-cols-4">
        {statusCounts.map(([status, count]) => (
          <Card
            key={status}
            onClick={() => setStatusFilter(statusFilter === status ? 'all' : status)}
            className={`cursor-pointer transition-colors hover:bg-muted/50 ${
              statusFilter === status ? 'ring-1 ring-primary/50 bg-muted/50' : ''
            }`}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {status === 'unknown' ? 'No Status' : getStatusLabel(status as LifecycleStatus)}
              </CardTitle>
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{count}</div>
              <p className="text-xs text-muted-foreground">
                of {statCardBase.length} referrals
                {yearFilter !== 'all' && ` in ${yearFilter}`}
                {institutionFilter !== 'all' && ` at ${institutionFilter}`}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    )}
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Referred Learners</CardTitle>
        <CardDescription>
          Every learner whose referral names this {linked.type === 'internal' ? 'team member' : 'learner'}.{' '}
          {filtered.length} of {referrals.length} shown.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {referrals.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No referrals recorded.</p>
        ) : (
          <DataTable
            columns={columns}
            data={filtered}
            searchPlaceholder="Search learner, roll number..."
            getRowId={(r) => r.id}
            showRefresh={false}
            globalFilterFn={(row, _c, q) => {
              const r = row.original as ReferredLearner;
              const s = String(q).toLowerCase();
              return [r.name, r.roll_number, r.program].some((v) => v?.toLowerCase().includes(s));
            }}
            tableTools={
              <>
                <Select value={institutionFilter} onValueChange={setInstitutionFilter}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Institutions</SelectItem>
                    {institutions.map((i) => (
                      <SelectItem key={i} value={i}>{i}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={yearFilter} onValueChange={setYearFilter}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Years</SelectItem>
                    {years.map((y) => (
                      <SelectItem key={y} value={y}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {statuses.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            }
          />
        )}
      </CardContent>
    </Card>
    </>
  );
}
