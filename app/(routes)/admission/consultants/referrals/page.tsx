// app/(routes)/admission/consultants/referrals/page.tsx
// All Referrals — view lead attributions filtered by consultant and/or date

'use client';

import { useState, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Users,
  Search,
  Filter,
  RefreshCw,
  Download,
  ArrowLeft,
  CheckCircle2,
  Clock,
  X,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { format } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ConsultantService } from '@/lib/services/admission/consultant-service';
import type { ConsultantLeadAttribution, LeadAttributionFilters } from '@/types/education-consultants';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { PermissionGuard } from '@/components/auth/permission-guard';

// ─────────────────────────────────────────────────────────────────────────────
// Inner component that reads search params (wrapped in Suspense)
// ─────────────────────────────────────────────────────────────────────────────
function ReferralsContent() {
  const searchParams = useSearchParams();
  const consultantIdParam = searchParams.get('consultant') || undefined;
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  // Filters
  const [verifiedFilter, setVerifiedFilter] = useState<'all' | 'verified' | 'pending'>('all');
  const [attributionTypeFilter, setAttributionTypeFilter] = useState<'all' | 'primary' | 'secondary' | 'assist'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  // Build filter object
  const filters: LeadAttributionFilters = useMemo(() => ({
    consultant_id: consultantIdParam,
    is_verified: verifiedFilter === 'all' ? undefined : verifiedFilter === 'verified',
    attribution_type: attributionTypeFilter !== 'all' ? (attributionTypeFilter as 'primary' | 'secondary' | 'assist') : undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    page,
    limit,
  }), [consultantIdParam, verifiedFilter, attributionTypeFilter, dateFrom, dateTo, page, limit]);

  const {
    data: attributionsData,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['lead-attributions', filters],
    queryFn: () => ConsultantService.getLeadAttributions(filters),
    enabled: true,
  });

  const attributions: ConsultantLeadAttribution[] = attributionsData?.data || [];
  const total = attributionsData?.total || 0;

  // Fetch consultant name when a specific consultant is selected
  const { data: consultant } = useQuery({
    queryKey: ['consultant', consultantIdParam],
    queryFn: () => ConsultantService.getConsultantById(consultantIdParam!),
    enabled: !!consultantIdParam,
  });

  // Client-side search filter over the current page results
  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return attributions;
    const term = searchTerm.toLowerCase();
    return attributions.filter((a: ConsultantLeadAttribution) =>
      a.lead?.full_name?.toLowerCase().includes(term) ||
      a.lead?.phone?.toLowerCase().includes(term) ||
      a.lead?.email?.toLowerCase().includes(term) ||
      a.consultant?.name?.toLowerCase().includes(term) ||
      a.referral_code_used?.toLowerCase().includes(term)
    );
  }, [attributions, searchTerm]);

  // Stats from current page
  const stats = useMemo(() => ({
    total,
    verified: attributions.filter((a: ConsultantLeadAttribution) => a.is_verified).length,
    pending: attributions.filter((a: ConsultantLeadAttribution) => !a.is_verified).length,
  }), [attributions, total]);

  const handleVerify = async (attribution: ConsultantLeadAttribution) => {
    if (!profile?.id) return;
    setVerifyingId(attribution.id);
    try {
      await ConsultantService.verifyLeadAttribution(attribution.id, profile.id);
      toast.success('Referral verified');
      queryClient.invalidateQueries({ queryKey: ['lead-attributions'] });
    } catch (err: any) {
      toast.error(err?.message || 'Failed to verify referral');
    } finally {
      setVerifyingId(null);
    }
  };

  const clearFilters = () => {
    setVerifiedFilter('all');
    setAttributionTypeFilter('all');
    setDateFrom('');
    setDateTo('');
    setSearchTerm('');
    setPage(1);
  };

  const handleExport = () => {
    if (!filtered.length) {
      toast.error('No referrals to export');
      return;
    }

    const headers = [
      'Student Name',
      'Phone',
      'Email',
      'Consultant Name',
      'Consultant Code',
      'Attribution Type',
      'Attribution %',
      'Referral Code',
      'Verified',
      'Verified At',
      'Estimated Commission',
      'Referred On',
    ];

    const rows = filtered.map((a: ConsultantLeadAttribution) => [
      a.lead?.full_name || '',
      a.lead?.phone || '',
      a.lead?.email || '',
      a.consultant?.name || '',
      a.consultant?.code || '',
      a.attribution_type,
      a.attribution_percentage,
      a.referral_code_used || '',
      a.is_verified ? 'Yes' : 'No',
      a.verified_at ? format(new Date(a.verified_at), 'yyyy-MM-dd') : '',
      a.estimated_commission ?? '',
      format(new Date(a.created_at), 'yyyy-MM-dd'),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => {
          const str = String(cell ?? '');
          return str.includes(',') || str.includes('"') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        }).join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `referrals-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} referrals`);
  };

  return (
    <PermissionGuard module="admission.consultants" action="view">
    <ContentLayout title="Referrals">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/admission/consultants">Consultants</BreadcrumbLink>
          </BreadcrumbItem>
          {consultant && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href={`/admission/consultants/${consultantIdParam}`}>
                  {consultant.name}
                </BreadcrumbLink>
              </BreadcrumbItem>
            </>
          )}
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Referrals</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              {consultantIdParam && (
                <Link href={`/admission/consultants/${consultantIdParam}`}>
                  <Button variant="ghost" size="icon">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </Link>
              )}
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  {consultant ? `${consultant.name} — Referrals` : 'All Referrals'}
                </h1>
                <p className="text-muted-foreground">
                  {consultant
                    ? `All lead attributions for ${consultant.name}`
                    : 'All lead attributions across consultants'}
                </p>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Referrals</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{total}</div>
              <p className="text-xs text-muted-foreground">Matching current filters</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Verified</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.verified}</div>
              <p className="text-xs text-muted-foreground">On this page</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Verification</CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
              <p className="text-xs text-muted-foreground">On this page</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, phone..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                  className="pl-9"
                />
              </div>

              <Select value={verifiedFilter} onValueChange={(v) => { setVerifiedFilter(v as typeof verifiedFilter); setPage(1); }}>
                <SelectTrigger>
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="verified">Verified</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>

              <Select value={attributionTypeFilter} onValueChange={(v) => { setAttributionTypeFilter(v as typeof attributionTypeFilter); setPage(1); }}>
                <SelectTrigger>
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="primary">Primary</SelectItem>
                  <SelectItem value="secondary">Secondary</SelectItem>
                  <SelectItem value="assist">Assist</SelectItem>
                </SelectContent>
              </Select>

              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                placeholder="From Date"
              />

              <div className="flex gap-2">
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                  placeholder="To Date"
                />
                <Button variant="ghost" size="icon" onClick={clearFilters} title="Clear Filters">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Referrals Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-4 w-4" />
              Referrals
            </CardTitle>
            <CardDescription>
              {total} total referral{total !== 1 ? 's' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No referrals found</p>
                <p className="text-sm">
                  {total === 0
                    ? 'No referrals have been recorded yet'
                    : 'Try adjusting your search or filters'}
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        {!consultantIdParam && <TableHead>Consultant</TableHead>}
                        <TableHead>Type</TableHead>
                        <TableHead>Referral Code</TableHead>
                        <TableHead>Verification</TableHead>
                        <TableHead>Referred On</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((attribution: ConsultantLeadAttribution) => (
                        <TableRow key={attribution.id}>
                          <TableCell>
                            <div className="font-medium">
                              {attribution.lead?.full_name || 'Unknown'}
                            </div>
                            {attribution.lead?.phone && (
                              <div className="text-xs text-muted-foreground">
                                {attribution.lead.phone}
                              </div>
                            )}
                          </TableCell>

                          {!consultantIdParam && (
                            <TableCell>
                              <div className="font-medium">
                                {attribution.consultant?.name || 'Unknown'}
                              </div>
                              {attribution.consultant?.code && (
                                <div className="text-xs text-muted-foreground">
                                  {attribution.consultant.code}
                                </div>
                              )}
                            </TableCell>
                          )}

                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {attribution.attribution_type}
                              {attribution.attribution_percentage < 100 && (
                                <span className="ml-1 text-muted-foreground">
                                  {attribution.attribution_percentage}%
                                </span>
                              )}
                            </Badge>
                          </TableCell>

                          <TableCell>
                            {attribution.referral_code_used ? (
                              <span className="font-mono text-sm bg-muted px-2 py-0.5 rounded">
                                {attribution.referral_code_used}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>

                          <TableCell>
                            {attribution.is_verified ? (
                              <Badge className="bg-green-100 text-green-800 gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                Verified
                              </Badge>
                            ) : (
                              <Badge className="bg-yellow-100 text-yellow-800 gap-1">
                                <Clock className="h-3 w-3" />
                                Pending
                              </Badge>
                            )}
                          </TableCell>

                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(attribution.created_at), 'dd MMM yyyy')}
                          </TableCell>

                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {!attribution.is_verified && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Verify Referral"
                                  onClick={() => handleVerify(attribution)}
                                  disabled={verifyingId === attribution.id}
                                >
                                  {verifyingId === attribution.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                                  )}
                                </Button>
                              )}
                              {attribution.lead?.id && (
                                <Link href={`/admission/leads/${attribution.lead.id}`}>
                                  <Button variant="ghost" size="icon" title="View Lead">
                                    <ExternalLink className="h-4 w-4" />
                                  </Button>
                                </Link>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {total > limit && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                      Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, total)} of {total} referrals
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => p + 1)}
                        disabled={page * limit >= total}
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
    </PermissionGuard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page export — Suspense boundary required for useSearchParams in App Router
// ─────────────────────────────────────────────────────────────────────────────
export default function ReferralsPage() {
  return (
    <Suspense
      fallback={
        <ContentLayout title="Referrals">
          <div className="mt-6 space-y-6">
            <Skeleton className="h-8 w-64" />
            <div className="grid gap-4 md:grid-cols-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}
            </div>
            <Skeleton className="h-96" />
          </div>
        </ContentLayout>
      }
    >
      <ReferralsContent />
    </Suspense>
  );
}
