'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useAuth } from '@/hooks/use-auth';
import { useAdmissionLeads, useLeadMutations } from '@/hooks/admission';
import type { AdmissionLead, FunnelStage, LeadPriority } from '@/types/admission';
import {
  Users,
  UserPlus,
  Search,
  Filter,
  Flame,
  Star,
  MoreHorizontal,
  Eye,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  X
} from 'lucide-react';
import Link from 'next/link';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { AdmissionErrorBoundary } from '@/components/admission';

const FUNNEL_STAGES = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'application_started', label: 'Application Started' },
  { value: 'application_submitted', label: 'Application Submitted' },
  { value: 'documents_pending', label: 'Documents Pending' },
  { value: 'documents_verified', label: 'Documents Verified' },
  { value: 'interview_scheduled', label: 'Interview Scheduled' },
  { value: 'interview_completed', label: 'Interview Completed' },
  { value: 'offer_sent', label: 'Offer Sent' },
  { value: 'offer_accepted', label: 'Offer Accepted' },
  { value: 'token_paid', label: 'Token Paid' },
  { value: 'enrolled', label: 'Enrolled' },
  { value: 'lost', label: 'Lost' }
];

function getStageColor(stage: string | null): string {
  const colors: Record<string, string> = {
    new: 'bg-blue-100 text-blue-800',
    contacted: 'bg-indigo-100 text-indigo-800',
    qualified: 'bg-purple-100 text-purple-800',
    application_started: 'bg-pink-100 text-pink-800',
    application_submitted: 'bg-rose-100 text-rose-800',
    documents_pending: 'bg-orange-100 text-orange-800',
    documents_verified: 'bg-amber-100 text-amber-800',
    interview_scheduled: 'bg-yellow-100 text-yellow-800',
    interview_completed: 'bg-lime-100 text-lime-800',
    offer_sent: 'bg-green-100 text-green-800',
    offer_accepted: 'bg-emerald-100 text-emerald-800',
    token_paid: 'bg-teal-100 text-teal-800',
    enrolled: 'bg-cyan-100 text-cyan-800',
    lost: 'bg-gray-100 text-gray-800'
  };
  return colors[stage || 'new'] || 'bg-gray-100 text-gray-800';
}

function LeadsTableSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-10 w-40" />
      </div>
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead><Skeleton className="h-4 w-24" /></TableHead>
              <TableHead><Skeleton className="h-4 w-20" /></TableHead>
              <TableHead><Skeleton className="h-4 w-16" /></TableHead>
              <TableHead><Skeleton className="h-4 w-16" /></TableHead>
              <TableHead><Skeleton className="h-4 w-20" /></TableHead>
              <TableHead><Skeleton className="h-4 w-8" /></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[1, 2, 3, 4, 5].map((i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                <TableCell><Skeleton className="h-8 w-8" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function AdmissionLeadsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, isLoading: accessLoading } = useAuth();
  const institutionId = profile?.institution_id;

  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');

  // Parse filters from URL
  const filters = {
    institution_id: institutionId || '',
    funnel_stage: (searchParams.get('funnel_stage') || undefined) as FunnelStage | undefined,
    priority: (searchParams.get('priority') || undefined) as LeadPriority | undefined,
    search: searchParams.get('search') || undefined
  };

  const page = parseInt(searchParams.get('page') || '1', 10);

  const {
    leads,
    total,
    totalPages,
    isLoading: leadsLoading,
    refetch
  } = useAdmissionLeads(filters);

  const { toggleHotLead, togglePriority } = useLeadMutations();

  const isLoading = accessLoading || leadsLoading;

  // Update URL with new params
  const updateParams = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams(searchParams);
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.set('page', '1');
      router.push(`/admission/leads?${params.toString()}`);
    },
    [router, searchParams]
  );

  const clearFilters = useCallback(() => {
    router.push('/admission/leads');
    setSearchTerm('');
  }, [router]);

  const handleSearch = useCallback(() => {
    updateParams('search', searchTerm || undefined);
  }, [searchTerm, updateParams]);

  const handlePageChange = useCallback(
    (newPage: number) => {
      const params = new URLSearchParams(searchParams);
      params.set('page', newPage.toString());
      router.push(`/admission/leads?${params.toString()}`);
    },
    [router, searchParams]
  );

  const activeFilterCount = [
    filters.funnel_stage,
    filters.priority,
    filters.search
  ].filter(Boolean).length;

  if (isLoading) {
    return (
      <PermissionGuard module="admission" action="view">
        <ContentLayout title="Leads">
          <LeadsTableSkeleton />
        </ContentLayout>
      </PermissionGuard>
    );
  }

  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="Leads">
        <div className="space-y-6">
          {/* Breadcrumb */}
          <div className="flex items-center justify-between">
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
                  <BreadcrumbPage>Leads</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => {
                refetch();
                toast.success('Leads refreshed');
              }}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button asChild>
                <Link href="/admission/leads/new">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add Lead
                </Link>
              </Button>
            </div>
          </div>

          {/* Filters */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  Filters
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary">{activeFilterCount}</Badge>
                  )}
                </CardTitle>
                {activeFilterCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => {
                    clearFilters();
                    toast.success('Filters cleared');
                  }}>
                    <X className="h-4 w-4 mr-2" />
                    Clear All
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                <div className="flex gap-2 flex-1 min-w-[200px]">
                  <Input
                    placeholder="Search by name, email, phone..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="max-w-sm"
                  />
                  <Button variant="outline" onClick={() => {
                    handleSearch();
                    toast.success('Search applied');
                  }}>
                    <Search className="h-4 w-4" />
                  </Button>
                </div>

                <Select
                  value={filters.funnel_stage || '_all'}
                  onValueChange={(value) => updateParams('funnel_stage', value === '_all' ? undefined : value)}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="All Stages" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">All Stages</SelectItem>
                    {FUNNEL_STAGES.map((stage) => (
                      <SelectItem key={stage.value} value={stage.value}>
                        {stage.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  variant={filters.priority === 'hot' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => updateParams('priority', filters.priority === 'hot' ? undefined : 'hot')}
                  className="gap-2"
                >
                  <Flame className="h-4 w-4" />
                  Hot Leads
                </Button>

                <Button
                  variant={filters.priority === 'warm' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => updateParams('priority', filters.priority === 'warm' ? undefined : 'warm')}
                  className="gap-2"
                >
                  <Star className="h-4 w-4" />
                  Warm Leads
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Results Summary */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {leads.length} of {total} leads
            </span>
            <span>
              Page {page} of {totalPages || 1}
            </span>
          </div>

          {/* Leads Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lead</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead className="text-center">Score</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                        <p className="text-muted-foreground">No leads found</p>
                        <Button variant="link" asChild className="mt-2">
                          <Link href="/admission/leads/new">Add your first lead</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : (
                    leads.map((lead: AdmissionLead) => (
                      <TableRow key={lead.id} className="cursor-pointer hover:bg-muted/50">
                        <TableCell>
                          <Link href={`/admission/leads/${lead.id}`} className="block">
                            <div className="flex items-center gap-2">
                              <div className="font-medium">{lead.full_name || 'Unknown'}</div>
                              <div className="flex gap-1">
                                {lead.is_hot_lead && (
                                  <Flame className="h-4 w-4 text-orange-500" />
                                )}
                                {(lead.is_priority && !lead.is_hot_lead) && (
                                  <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                                )}
                              </div>
                            </div>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {lead.email && <div>{lead.email}</div>}
                            {lead.phone && <div className="text-muted-foreground">{lead.phone}</div>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={getStageColor(lead.funnel_stage)} variant="secondary">
                            {lead.funnel_stage?.replace(/_/g, ' ') || 'New'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="font-medium">{lead.score || 0}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {lead.source || '-'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {lead.created_at
                              ? new Date(lead.created_at).toLocaleDateString()
                              : '-'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link href={`/admission/leads/${lead.id}`}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  View Details
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => {
                                  toggleHotLead.mutate({
                                    leadId: lead.id,
                                    isHot: !lead.is_hot_lead
                                  });
                                  toast.success(lead.is_hot_lead ? 'Hot status removed' : 'Marked as hot lead');
                                }}
                              >
                                <Flame className="h-4 w-4 mr-2" />
                                {lead.is_hot_lead ? 'Remove Hot Status' : 'Mark as Hot'}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  togglePriority.mutate({
                                    leadId: lead.id,
                                    isPriority: !lead.is_priority
                                  });
                                  toast.success(lead.is_priority ? 'Priority removed' : 'Marked as warm');
                                }}
                              >
                                <Star className="h-4 w-4 mr-2" />
                                {lead.priority === 'warm' ? 'Remove Warm Status' : 'Mark as Warm'}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(page - 1)}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (page <= 3) {
                    pageNum = i + 1;
                  } else if (page >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = page - 2 + i;
                  }
                  return (
                    <Button
                      key={pageNum}
                      variant={page === pageNum ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handlePageChange(pageNum)}
                      className="w-10"
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= totalPages}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function AdmissionLeadsPage() {
  return (
    <AdmissionErrorBoundary>
      <AdmissionLeadsPageContent />
    </AdmissionErrorBoundary>
  );
}
