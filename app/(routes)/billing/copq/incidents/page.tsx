'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { usePermissions } from '@/hooks/use-permissions';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useBillingCOPQIncidents } from '@/hooks/billing/use-billing-copq';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { BeatLoader } from 'react-spinners';
import {
  ArrowLeft,
  Plus,
  Search,
  Eye,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  FileWarning
} from 'lucide-react';
import {
  COPQ_CATEGORY_LABELS,
  COPQ_STATUS_LABELS,
  COPQ_STATUS_COLORS
} from '@/types/billing-copq';
import type { COPQCategory, COPQStatus } from '@/types/billing-copq';

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount);

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

const truncateText = (text: string, maxLength: number = 60) => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

const ALL_CATEGORIES = Object.keys(COPQ_CATEGORY_LABELS) as COPQCategory[];
const ALL_STATUSES = Object.keys(COPQ_STATUS_LABELS) as COPQStatus[];
const PAGE_SIZE_OPTIONS = [10, 25, 50];

export default function COPQIncidentsPage() {
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();
  const { institutions } = useUserInstitutionAccess();

  const defaultInstitutionId = institutions?.[0]?.institution_id || '';
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>('');
  const institutionId = selectedInstitutionId || defaultInstitutionId;

  // Local filter state for controlled inputs
  const [searchInput, setSearchInput] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const {
    incidents,
    metadata,
    loading,
    error,
    filters,
    updateFilters,
    changePage
  } = useBillingCOPQIncidents({ institution_id: institutionId });

  const canViewCOPQ = isSuperAdmin || canAccess('billing.reports', 'view');

  // Handle filter changes
  const handleCategoryChange = (value: string) => {
    setCategoryFilter(value);
    updateFilters({
      category: value === 'all' ? undefined : (value as COPQCategory)
    });
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    updateFilters({
      status: value === 'all' ? undefined : (value as COPQStatus)
    });
  };

  const handleSearchSubmit = () => {
    updateFilters({
      search: searchInput.trim() || undefined
    });
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearchSubmit();
    }
  };

  const handleDateFromChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDateFrom(value);
    updateFilters({ date_from: value || undefined });
  };

  const handleDateToChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDateTo(value);
    updateFilters({ date_to: value || undefined });
  };

  const handleInstitutionChange = (value: string) => {
    setSelectedInstitutionId(value);
    updateFilters({ institution_id: value });
  };

  const handlePageSizeChange = (value: string) => {
    updateFilters({ limit: parseInt(value), page: 1 });
  };

  // Permissions loading
  if (permissionsLoading) {
    return (
      <ContentLayout title='COPQ Incidents'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  // Permission denied
  if (!canViewCOPQ) {
    return (
      <ContentLayout title='COPQ Incidents'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to view COPQ incidents.
          </p>
        </div>
      </ContentLayout>
    );
  }

  const totalPages = metadata.totalPages;
  const currentPage = metadata.page;
  const totalItems = metadata.total;
  const pageSize = metadata.limit;

  // Generate visible page numbers for pagination
  const getVisiblePages = (): number[] => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: number[] = [];
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  return (
    <ContentLayout title='COPQ Incidents'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing/schedule' },
          { label: 'Cost of Poor Quality', href: '/billing/copq' },
          { label: 'Incidents', href: '/billing/copq/incidents' }
        ]}
      />

      <div className='space-y-6 mt-4'>
        {/* Header */}
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>COPQ Incidents</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              View and manage all billing quality incidents
            </p>
          </div>
          <div className='flex flex-wrap gap-2'>
            <Link href='/billing/copq'>
              <Button variant='outline'>
                <ArrowLeft className='mr-2 h-4 w-4' />
                Back to Dashboard
              </Button>
            </Link>
            <Link href='/billing/copq'>
              <Button>
                <Plus className='mr-2 h-4 w-4' />
                Log Incident
              </Button>
            </Link>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className='p-4'>
            <div className='flex flex-wrap gap-4 items-end'>
              {institutions && institutions.length > 1 && (
                <div className='space-y-2'>
                  <Label>Institution</Label>
                  <Select
                    value={selectedInstitutionId}
                    onValueChange={handleInstitutionChange}
                  >
                    <SelectTrigger className='w-[250px]'>
                      <SelectValue placeholder='Select institution' />
                    </SelectTrigger>
                    <SelectContent>
                      {institutions.map((inst) => (
                        <SelectItem
                          key={inst.institution_id}
                          value={inst.institution_id}
                        >
                          {inst.institution_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className='space-y-2'>
                <Label>Category</Label>
                <Select
                  value={categoryFilter}
                  onValueChange={handleCategoryChange}
                >
                  <SelectTrigger className='w-[200px]'>
                    <SelectValue placeholder='All categories' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='all'>All Categories</SelectItem>
                    {ALL_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {COPQ_CATEGORY_LABELS[cat]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className='space-y-2'>
                <Label>Status</Label>
                <Select
                  value={statusFilter}
                  onValueChange={handleStatusChange}
                >
                  <SelectTrigger className='w-[160px]'>
                    <SelectValue placeholder='All statuses' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='all'>All Statuses</SelectItem>
                    {ALL_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {COPQ_STATUS_LABELS[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className='space-y-2'>
                <Label>From</Label>
                <Input
                  type='date'
                  value={dateFrom}
                  onChange={handleDateFromChange}
                  className='w-[160px]'
                />
              </div>

              <div className='space-y-2'>
                <Label>To</Label>
                <Input
                  type='date'
                  value={dateTo}
                  onChange={handleDateToChange}
                  className='w-[160px]'
                />
              </div>

              <div className='space-y-2'>
                <Label>Search</Label>
                <div className='flex gap-2'>
                  <Input
                    placeholder='Search description...'
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    className='w-[200px]'
                  />
                  <Button
                    variant='outline'
                    size='icon'
                    onClick={handleSearchSubmit}
                  >
                    <Search className='h-4 w-4' />
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Error State */}
        {error && (
          <Card className='border-destructive'>
            <CardContent className='flex flex-col items-center justify-center py-8'>
              <AlertTriangle className='h-12 w-12 text-destructive mb-4' />
              <h3 className='text-lg font-semibold mb-2'>Error Loading Incidents</h3>
              <p className='text-muted-foreground text-center max-w-md'>
                {error}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Loading State */}
        {loading && !error && (
          <div className='flex items-center justify-center min-h-[300px]'>
            <BeatLoader color='#00e902' />
          </div>
        )}

        {/* Data Table */}
        {!loading && !error && (
          <>
            {incidents.length === 0 ? (
              /* Empty State */
              <Card>
                <CardContent className='flex flex-col items-center justify-center py-16'>
                  <FileWarning className='h-16 w-16 text-muted-foreground mb-4' />
                  <h3 className='text-lg font-semibold mb-2'>No Incidents Found</h3>
                  <p className='text-muted-foreground text-center max-w-md mb-6'>
                    {filters.search || filters.category || filters.status || filters.date_from || filters.date_to
                      ? 'No incidents match your current filters. Try adjusting or clearing them.'
                      : 'No COPQ incidents have been logged yet. Start by logging your first incident.'}
                  </p>
                  <Link href='/billing/copq'>
                    <Button>
                      <Plus className='mr-2 h-4 w-4' />
                      Log Incident
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Table */}
                <Card>
                  <CardContent className='p-0'>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className='w-[100px]'>Date</TableHead>
                          <TableHead className='w-[160px]'>Category</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className='text-right w-[120px]'>Visible Cost</TableHead>
                          <TableHead className='text-right w-[120px]'>Hidden Cost</TableHead>
                          <TableHead className='w-[120px]'>Status</TableHead>
                          <TableHead className='w-[80px] text-center'>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {incidents.map((incident) => (
                          <TableRow key={incident.id}>
                            <TableCell className='whitespace-nowrap text-sm'>
                              {formatDate(incident.incident_date)}
                            </TableCell>
                            <TableCell>
                              <Badge variant='outline' className='text-xs whitespace-nowrap'>
                                {COPQ_CATEGORY_LABELS[incident.category]}
                              </Badge>
                            </TableCell>
                            <TableCell
                              className='text-sm max-w-[300px]'
                              title={incident.description}
                            >
                              {truncateText(incident.description)}
                            </TableCell>
                            <TableCell className='text-right text-sm font-medium'>
                              {formatCurrency(incident.visible_cost)}
                            </TableCell>
                            <TableCell className='text-right text-sm font-medium'>
                              {formatCurrency(incident.hidden_cost_estimate)}
                            </TableCell>
                            <TableCell>
                              <Badge
                                className={`text-xs ${COPQ_STATUS_COLORS[incident.status]}`}
                              >
                                {COPQ_STATUS_LABELS[incident.status]}
                              </Badge>
                            </TableCell>
                            <TableCell className='text-center'>
                              <Link href={`/billing/copq/incidents/${incident.id}`}>
                                <Button variant='ghost' size='icon' title='View details'>
                                  <Eye className='h-4 w-4' />
                                </Button>
                              </Link>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* Pagination */}
                <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
                  <div className='flex items-center gap-4 text-sm text-muted-foreground'>
                    <span>
                      Showing {(currentPage - 1) * pageSize + 1}
                      {' '}-{' '}
                      {Math.min(currentPage * pageSize, totalItems)}
                      {' '}of {totalItems} incidents
                    </span>
                    <div className='flex items-center gap-2'>
                      <Label className='text-sm'>Per page:</Label>
                      <Select
                        value={pageSize.toString()}
                        onValueChange={handlePageSizeChange}
                      >
                        <SelectTrigger className='w-[70px] h-8'>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAGE_SIZE_OPTIONS.map((size) => (
                            <SelectItem key={size} value={size.toString()}>
                              {size}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {totalPages > 1 && (
                    <div className='flex items-center gap-1'>
                      <Button
                        variant='outline'
                        size='icon'
                        className='h-8 w-8'
                        onClick={() => changePage(currentPage - 1)}
                        disabled={currentPage <= 1}
                      >
                        <ChevronLeft className='h-4 w-4' />
                      </Button>

                      {getVisiblePages().map((page) => (
                        <Button
                          key={page}
                          variant={page === currentPage ? 'default' : 'outline'}
                          size='icon'
                          className='h-8 w-8'
                          onClick={() => changePage(page)}
                        >
                          {page}
                        </Button>
                      ))}

                      <Button
                        variant='outline'
                        size='icon'
                        className='h-8 w-8'
                        onClick={() => changePage(currentPage + 1)}
                        disabled={currentPage >= totalPages}
                      >
                        <ChevronRight className='h-4 w-4' />
                      </Button>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </ContentLayout>
  );
}
