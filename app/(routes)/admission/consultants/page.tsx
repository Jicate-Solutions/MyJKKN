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
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import {
  Handshake,
  UserPlus,
  Search,
  Filter,
  MoreHorizontal,
  Eye,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  X,
  Loader2,
  Phone,
  Mail,
  DollarSign,
  TrendingUp,
  Users,
  Edit,
  Trash2,
  Upload
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
import { ConsultantService } from '@/lib/services/admission/consultant-service';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { EducationConsultant, ConsultantFilters } from '@/types/education-consultants';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ConsultantImportDialog } from './_components/import-dialog';

const CONSULTANT_STATUS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'pending_verification', label: 'Pending Verification' },
  { value: 'contract_expired', label: 'Contract Expired' }
];

const CONSULTANT_TYPES = [
  { value: 'external', label: 'External' },
  { value: 'internal', label: 'Internal' },
  { value: 'institutional', label: 'Institutional' },
  { value: 'alumni', label: 'Alumni' },
  { value: 'student', label: 'Student' }
];

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    inactive: 'bg-gray-100 text-gray-800',
    suspended: 'bg-red-100 text-red-800',
    pending_verification: 'bg-yellow-100 text-yellow-800',
    contract_expired: 'bg-orange-100 text-orange-800'
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
}

function getTypeColor(type: string): string {
  const colors: Record<string, string> = {
    external: 'bg-blue-100 text-blue-800',
    internal: 'bg-amber-100 text-amber-800',
    institutional: 'bg-indigo-100 text-indigo-800',
    alumni: 'bg-emerald-100 text-emerald-800',
    student: 'bg-cyan-100 text-cyan-800'
  };
  return colors[type] || 'bg-gray-100 text-gray-800';
}

function ConsultantsTableSkeleton() {
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
                <TableCell><Skeleton className="h-10 w-10 rounded-full" /></TableCell>
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

function ConsultantsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { institutions, selectedInstitutionId, loading: accessLoading } = useUserInstitutionAccess();
  // Single-institution users filter to their institution.
  // Multi-institution / super_admin users get undefined → no filter → see all consultants.
  const institutionId = institutions.length === 1 ? selectedInstitutionId : undefined;

  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  // Parse filters from URL
  const currentPage = parseInt(searchParams.get('page') || '1', 10);
  const filters: ConsultantFilters = {
    institution_id: institutionId || '',
    status: searchParams.get('status') as ConsultantFilters['status'] || undefined,
    consultant_type: searchParams.get('type') as ConsultantFilters['consultant_type'] || undefined,
    search: searchParams.get('search') || undefined,
    page: currentPage,
    limit: 20
  };

  // Fetch consultants
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['consultants', filters],
    queryFn: () => ConsultantService.getConsultants(filters),
    enabled: !accessLoading
  });

  // Fetch summary stats
  const { data: summaryStats } = useQuery({
    queryKey: ['consultants-summary', institutionId],
    queryFn: () => ConsultantService.getDashboardStats(institutionId),
    enabled: !accessLoading
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => ConsultantService.deleteConsultant(id),
    onSuccess: () => {
      toast.success('Consultant deleted successfully');
      setDeleteId(null);
      queryClient.refetchQueries({ queryKey: ['consultants'] });
      queryClient.refetchQueries({ queryKey: ['consultants-summary'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to delete consultant');
    }
  });

  // Update filters
  const updateFilters = useCallback((newFilters: Partial<ConsultantFilters>) => {
    const params = new URLSearchParams(searchParams.toString());

    Object.entries(newFilters).forEach(([key, value]) => {
      if (value === undefined || value === '' || value === 'all') {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }
    });

    // Reset page when filters change
    if (!newFilters.page) {
      params.delete('page');
    }

    router.push(`?${params.toString()}`);
  }, [router, searchParams]);

  const handleSearch = () => {
    updateFilters({ search: searchTerm || undefined });
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    router.push('/admission/consultants');
  };

  const hasFilters = searchParams.get('search') || searchParams.get('status') || searchParams.get('type');

  // Show skeleton while institutions are loading, consultants are fetching, or data hasn't arrived yet
  // (the !data guard covers the one-render gap when enabled flips false→true before fetch starts)
  if (accessLoading || isLoading || !data) {
    return <ConsultantsTableSkeleton />;
  }

  // Show error only after everything has loaded but user has no institution access at all
  if (institutions.length === 0) {
    return (
      <div className="text-center py-12">
        <Handshake className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium mb-2">No Institution Assigned</h3>
        <p className="text-muted-foreground">
          Your account is not linked to an institution. Please contact an administrator.
        </p>
      </div>
    );
  }

  const consultants = data?.data || [];
  const metadata = data?.metadata;

  return (
    <div className="space-y-6">
      {/* Summary Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Consultants</CardTitle>
            <Handshake className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summaryStats?.total_consultants || 0}</div>
            <p className="text-xs text-muted-foreground">
              {summaryStats?.active_consultants || 0} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Referrals</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summaryStats?.total_leads_referred || 0}</div>
            <p className="text-xs text-muted-foreground">
              {summaryStats?.total_conversions || 0} converted
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Commissions</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Intl.NumberFormat('en-IN', {
                style: 'currency',
                currency: 'INR',
                maximumFractionDigits: 0
              }).format(summaryStats?.total_commission_paid || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {new Intl.NumberFormat('en-IN', {
                style: 'currency',
                currency: 'INR',
                maximumFractionDigits: 0
              }).format(summaryStats?.pending_commission || 0)} pending
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summaryStats?.overall_conversion_rate?.toFixed(1) || 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              Referral to enrollment
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email, phone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="pl-10"
                />
              </div>
            </div>
            <Select
              value={searchParams.get('status') || 'all'}
              onValueChange={(value) => updateFilters({ status: value as ConsultantFilters['status'] })}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {CONSULTANT_STATUS.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={searchParams.get('type') || 'all'}
              onValueChange={(value) => updateFilters({ consultant_type: value as ConsultantFilters['consultant_type'] })}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {CONSULTANT_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={handleSearch}>
              <Filter className="h-4 w-4 mr-2" />
              Apply
            </Button>
            {hasFilters && (
              <Button variant="ghost" onClick={handleClearFilters}>
                <X className="h-4 w-4 mr-2" />
                Clear
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              disabled={isFetching}
              onClick={() => {
                queryClient.refetchQueries({ queryKey: ['consultants'] });
                queryClient.refetchQueries({ queryKey: ['consultants-summary'] });
              }}
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Consultants Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Handshake className="h-5 w-5" />
            Education Consultants
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Import
            </Button>
            <Link href="/admission/consultants/new">
              <Button>
                <UserPlus className="h-4 w-4 mr-2" />
                Add Consultant
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <ConsultantsTableSkeleton />
          ) : error ? (
            <div className="text-center py-8 text-red-600">
              Error loading consultants. Please try again.
            </div>
          ) : consultants.length === 0 ? (
            <div className="text-center py-12">
              <Handshake className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Consultants Found</h3>
              <p className="text-muted-foreground mb-4">
                {hasFilters
                  ? 'No consultants match your filters. Try adjusting your search.'
                  : 'Get started by adding your first education consultant.'}
              </p>
              {!hasFilters && (
                <Link href="/admission/consultants/new">
                  <Button>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add Consultant
                  </Button>
                </Link>
              )}
            </div>
          ) : (
            <>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Consultant</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Referrals</TableHead>
                      <TableHead className="text-right">Commission Rate</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {consultants.map((consultant: EducationConsultant) => (
                      <TableRow key={consultant.id} className="cursor-pointer hover:bg-muted/50">
                        <TableCell>
                          <Link href={`/admission/consultants/${consultant.id}`} className="flex items-center gap-3">
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={undefined} />
                              <AvatarFallback>
                                {consultant.name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'EC'}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium">{consultant.name}</div>
                              {consultant.contact_person && (
                                <div className="text-sm text-muted-foreground">
                                  {consultant.contact_person}
                                </div>
                              )}
                            </div>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-sm">
                              <Mail className="h-3 w-3 text-muted-foreground" />
                              {consultant.email}
                            </div>
                            {consultant.phone && (
                              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                <Phone className="h-3 w-3" />
                                {consultant.phone}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={getTypeColor(consultant.consultant_type)}>
                            {consultant.consultant_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(consultant.status)}>
                            {consultant.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {consultant.total_leads_referred || 0}
                        </TableCell>
                        <TableCell className="text-right">
                          {consultant.conversion_rate?.toFixed(1) || 0}%
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
                                <Link href={`/admission/consultants/${consultant.id}`}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  View Details
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={`/admission/consultants/${consultant.id}/edit`}>
                                  <Edit className="h-4 w-4 mr-2" />
                                  Edit
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => setDeleteId(consultant.id)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {metadata && metadata.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {((metadata.page - 1) * metadata.limit) + 1} to{' '}
                    {Math.min(metadata.page * metadata.limit, metadata.total)} of {metadata.total}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateFilters({ page: currentPage - 1 })}
                      disabled={currentPage <= 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm">
                      Page {metadata.page} of {metadata.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateFilters({ page: currentPage + 1 })}
                      disabled={currentPage >= metadata.totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this consultant and all associated records.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import Dialog */}
      <ConsultantImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImportComplete={() => {
          queryClient.invalidateQueries({ queryKey: ['consultants'] });
          queryClient.invalidateQueries({ queryKey: ['consultants-summary'] });
        }}
      />
    </div>
  );
}

export default function ConsultantsPage() {
  return (
    <PermissionGuard module="admission.consultants" action="view">
      <ContentLayout title="Education Consultants">
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
              <BreadcrumbPage>Education Consultants</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="mt-6">
          <ConsultantsPageContent />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
