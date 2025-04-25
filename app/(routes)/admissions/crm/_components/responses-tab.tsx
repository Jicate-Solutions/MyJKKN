'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
} from '@/components/ui/pagination';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Loader2,
  Search,
  Calendar,
  MessageSquare,
  Clock,
  ChevronDown,
  MessageCircle,
  Filter,
  X,
  Download,
  Eye
} from 'lucide-react';
import { format as dateFormat } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';
import { useFetchFormResponses } from '@/hooks/crm/use-fetch-form-responses';
import { useFetchForms } from '@/hooks/crm/use-fetch-forms';
import { useFetchAdmissionSources } from '@/hooks/crm/use-fetch-admission-sources';
import Link from 'next/link';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/components/ui/collapsible';

interface ResponsesTabProps {
  apiKey: string;
}

// Define filter state interface
interface FilterOptions {
  status: string;
  sourceId: string;
  formId: string;
  dateRange: 'all' | 'today' | 'week' | 'month' | 'custom';
  startDate: string | null;
  endDate: string | null;
}

// Add export data types
type ExportFormat = 'csv' | 'excel' | 'pdf';

export function ResponsesTab({ apiKey }: ResponsesTabProps) {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewingResponse, setViewingResponse] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Advanced filter state
  const [filters, setFilters] = useState<FilterOptions>({
    status: 'all',
    sourceId: 'all',
    formId: 'all',
    dateRange: 'all',
    startDate: null,
    endDate: null
  });

  // Count active filters
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => {
    if (key === 'dateRange' && value !== 'all') return true;
    if ((key === 'startDate' || key === 'endDate') && value !== null)
      return false; // Don't count these separately
    return value !== 'all';
  }).length;

  const {
    data: responses,
    pagination,
    loading,
    error
  } = useFetchFormResponses({
    apiKey,
    formId: filters.formId === 'all' ? undefined : filters.formId,
    page,
    perPage
    // In a real implementation, we would pass all filter parameters to the API
  });

  // Fetch forms to map form_id to form name
  const { data: forms, loading: loadingForms } = useFetchForms({
    apiKey,
    perPage: 100 // Get all forms to ensure we have the mapping
  });

  // Fetch sources to map source_id to source name
  const { data: sources, loading: loadingSources } = useFetchAdmissionSources({
    apiKey,
    perPage: 100 // Get all sources to ensure we have the mapping
  });

  // Function to get form name from form_id
  const getFormName = (formId: string) => {
    if (!forms) return formId;
    const form = forms.find((form) => form.id === formId);
    return form ? form.title : formId;
  };

  // Function to get source name from form_id (looking up the source via the form)
  const getSourceName = (formId: string) => {
    if (!forms || !sources) return 'Unknown';
    const form = forms.find((form) => form.id === formId);
    if (!form) return 'Unknown';

    const source = sources.find((source) => source.id === form.source_id);
    return source ? source.name : form.source_id;
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // Search would be handled here in a real implementation
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handleFilterChange = (key: keyof FilterOptions, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    // Reset to page 1 when filters change
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({
      status: 'all',
      sourceId: 'all',
      formId: 'all',
      dateRange: 'all',
      startDate: null,
      endDate: null
    });
  };

  const getStatusColor = (status: string) => {
    const statusColors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      contacted: 'bg-blue-100 text-blue-800',
      interested: 'bg-green-100 text-green-800',
      'not-interested': 'bg-red-100 text-red-800',
      enrolled: 'bg-purple-100 text-purple-800',
      default: 'bg-gray-100 text-gray-800'
    };

    return statusColors[status] || statusColors.default;
  };

  const formatFieldDisplay = (field: string, value: any) => {
    if (value === null || value === undefined) return 'N/A';

    if (typeof value === 'boolean') return value ? 'Yes' : 'No';

    if (Array.isArray(value)) return value.join(', ');

    if (typeof value === 'object') return JSON.stringify(value);

    return String(value);
  };

  // Function to handle data export
  const handleExport = async (format: ExportFormat) => {
    try {
      setIsExporting(true);

      // In a real implementation, this would call an API endpoint to generate the export
      // Here we're simulating the export process

      // Create a sample CSV data for demonstration
      if (responses && responses.length > 0) {
        let exportData;
        let fileName;
        let mimeType;

        if (format === 'csv') {
          // Create CSV content
          const headers = [
            'ID',
            'Respondent',
            'Email',
            'Form',
            'Source',
            'Status',
            'Submitted'
          ];
          const csvRows = [
            headers.join(','),
            ...responses.map((response) =>
              [
                response.id,
                response.data.name || response.data.fullName || 'Anonymous',
                response.data.email || 'N/A',
                getFormName(response.form_id),
                getSourceName(response.form_id),
                response.status,
                dateFormat(new Date(response.created_at), 'yyyy-MM-dd')
              ].join(',')
            )
          ];

          exportData = csvRows.join('\n');
          fileName = `responses-export-${new Date()
            .toISOString()
            .slice(0, 10)}.csv`;
          mimeType = 'text/csv';
        } else if (format === 'excel') {
          // For demo purposes, create a CSV that could be opened in Excel
          // In a real implementation, you would use a library like exceljs to create a real Excel file
          const headers = [
            'ID',
            'Respondent',
            'Email',
            'Form',
            'Source',
            'Status',
            'Submitted'
          ];
          const csvRows = [
            headers.join(','),
            ...responses.map((response) =>
              [
                response.id,
                response.data.name || response.data.fullName || 'Anonymous',
                response.data.email || 'N/A',
                getFormName(response.form_id),
                getSourceName(response.form_id),
                response.status,
                dateFormat(new Date(response.created_at), 'yyyy-MM-dd')
              ].join(',')
            )
          ];

          exportData = csvRows.join('\n');
          fileName = `responses-export-${new Date()
            .toISOString()
            .slice(0, 10)}.xlsx`;
          mimeType =
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        } else if (format === 'pdf') {
          // For demo purposes, just create a text representation
          // In a real implementation, you would use a library like jspdf to create a real PDF
          const content = responses
            .map(
              (response) =>
                `Response ID: ${response.id}\n` +
                `Respondent: ${
                  response.data.name || response.data.fullName || 'Anonymous'
                }\n` +
                `Email: ${response.data.email || 'N/A'}\n` +
                `Form: ${getFormName(response.form_id)}\n` +
                `Source: ${getSourceName(response.form_id)}\n` +
                `Status: ${response.status}\n` +
                `Submitted: ${dateFormat(
                  new Date(response.created_at),
                  'PPP'
                )}\n\n`
            )
            .join('---\n\n');

          exportData = content;
          fileName = `responses-export-${new Date()
            .toISOString()
            .slice(0, 10)}.pdf`;
          mimeType = 'application/pdf';
        }

        // Create a download link
        if (exportData && fileName) {
          const blob = new Blob([exportData], { type: mimeType });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }
      }
    } catch (error) {
      console.error('Export failed:', error);
      // In a real implementation, you would show an error toast or message
    } finally {
      setIsExporting(false);
    }
  };

  if (loading || loadingForms || loadingSources) {
    return (
      <div className='space-y-4'>
        <div className='flex items-center justify-between'>
          <Skeleton className='h-10 w-[300px]' />
        </div>

        <div className='space-y-2'>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className='h-20 w-full' />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='bg-red-50 p-4 rounded-md text-red-800'>
        <p className='font-medium'>Error loading responses</p>
        <p className='text-sm mt-1'>{error.message}</p>
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      {/* Search and Filter Top Bar */}
      <div className='flex flex-col md:flex-row items-start md:items-center justify-between gap-4'>
        <form className='w-full md:w-auto' onSubmit={handleSearch}>
          <div className='relative'>
            <Search className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground' />
            <Input
              type='search'
              placeholder='Search responses...'
              className='w-full md:w-[300px] pl-8'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </form>

        <div className='flex items-center gap-2 w-full md:w-auto'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => setShowFilters(!showFilters)}
            className='flex items-center gap-1 relative'
          >
            <Filter className='h-4 w-4' />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <Badge
                variant='secondary'
                className='absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-xs'
              >
                {activeFilterCount}
              </Badge>
            )}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant='outline'
                size='sm'
                disabled={isExporting || !responses || responses.length === 0}
              >
                <Download
                  className={`h-4 w-4 mr-1 ${
                    isExporting ? 'animate-spin' : ''
                  }`}
                />
                {isExporting ? 'Exporting...' : 'Export'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuLabel>Export Options</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleExport('csv')}>
                Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('excel')}>
                Export as Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('pdf')}>
                Export as PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Advanced Filters Section */}
      <Collapsible open={showFilters} onOpenChange={setShowFilters}>
        <CollapsibleContent>
          <Card className='mb-4'>
            <CardHeader className='pb-2'>
              <div className='flex items-center justify-between'>
                <CardTitle className='text-base'>Advanced Filters</CardTitle>
                {activeFilterCount > 0 && (
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={clearFilters}
                    className='h-8'
                  >
                    <X className='h-3.5 w-3.5 mr-1' /> Clear all
                  </Button>
                )}
              </div>
              <CardDescription>
                Filter responses by multiple criteria
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                {/* Status Filter */}
                <div className='space-y-2'>
                  <label className='text-sm font-medium'>Status</label>
                  <Select
                    value={filters.status}
                    onValueChange={(value) =>
                      handleFilterChange('status', value)
                    }
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue placeholder='All statuses' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>All statuses</SelectItem>
                      <SelectItem value='pending'>Pending</SelectItem>
                      <SelectItem value='contacted'>Contacted</SelectItem>
                      <SelectItem value='interested'>Interested</SelectItem>
                      <SelectItem value='not-interested'>
                        Not Interested
                      </SelectItem>
                      <SelectItem value='enrolled'>Enrolled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Source Filter */}
                <div className='space-y-2'>
                  <label className='text-sm font-medium'>Source</label>
                  <Select
                    value={filters.sourceId}
                    onValueChange={(value) =>
                      handleFilterChange('sourceId', value)
                    }
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue placeholder='All sources' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>All sources</SelectItem>
                      {sources &&
                        sources.map((source) => (
                          <SelectItem key={source.id} value={source.id}>
                            {source.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Date Range Filter */}
                <div className='space-y-2'>
                  <label className='text-sm font-medium'>Date Range</label>
                  <Select
                    value={filters.dateRange}
                    onValueChange={(value: any) =>
                      handleFilterChange('dateRange', value)
                    }
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue placeholder='All time' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>All time</SelectItem>
                      <SelectItem value='today'>Today</SelectItem>
                      <SelectItem value='week'>Last 7 days</SelectItem>
                      <SelectItem value='month'>Last 30 days</SelectItem>
                      <SelectItem value='custom'>Custom range</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Custom Date Range */}
                {filters.dateRange === 'custom' && (
                  <>
                    <div className='space-y-2'>
                      <label className='text-sm font-medium'>Start Date</label>
                      <Input
                        type='date'
                        value={filters.startDate || ''}
                        onChange={(e) =>
                          handleFilterChange('startDate', e.target.value)
                        }
                      />
                    </div>
                    <div className='space-y-2'>
                      <label className='text-sm font-medium'>End Date</label>
                      <Input
                        type='date'
                        value={filters.endDate || ''}
                        onChange={(e) =>
                          handleFilterChange('endDate', e.target.value)
                        }
                      />
                    </div>
                  </>
                )}

                {/* Form Filter */}
                <div className='space-y-2'>
                  <label className='text-sm font-medium'>Form</label>
                  <Select
                    value={filters.formId}
                    onValueChange={(value) =>
                      handleFilterChange('formId', value)
                    }
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue placeholder='All forms' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>All forms</SelectItem>
                      {forms &&
                        forms.map((form) => (
                          <SelectItem key={form.id} value={form.id}>
                            {form.title}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Active filters display */}
              {activeFilterCount > 0 && (
                <div className='mt-4 flex flex-wrap gap-2'>
                  {filters.status !== 'all' && (
                    <Badge
                      variant='secondary'
                      className='flex items-center gap-1'
                    >
                      Status: {filters.status}
                      <X
                        className='h-3 w-3 cursor-pointer'
                        onClick={() => handleFilterChange('status', 'all')}
                      />
                    </Badge>
                  )}
                  {filters.sourceId !== 'all' && sources && (
                    <Badge
                      variant='secondary'
                      className='flex items-center gap-1'
                    >
                      Source:{' '}
                      {sources.find((s) => s.id === filters.sourceId)?.name ||
                        filters.sourceId}
                      <X
                        className='h-3 w-3 cursor-pointer'
                        onClick={() => handleFilterChange('sourceId', 'all')}
                      />
                    </Badge>
                  )}
                  {filters.formId !== 'all' && forms && (
                    <Badge
                      variant='secondary'
                      className='flex items-center gap-1'
                    >
                      Form:{' '}
                      {forms.find((f) => f.id === filters.formId)?.title ||
                        filters.formId}
                      <X
                        className='h-3 w-3 cursor-pointer'
                        onClick={() => handleFilterChange('formId', 'all')}
                      />
                    </Badge>
                  )}
                  {filters.dateRange !== 'all' && (
                    <Badge
                      variant='secondary'
                      className='flex items-center gap-1'
                    >
                      Date:{' '}
                      {filters.dateRange === 'custom'
                        ? `${filters.startDate || 'Any'} to ${
                            filters.endDate || 'Any'
                          }`
                        : filters.dateRange}
                      <X
                        className='h-3 w-3 cursor-pointer'
                        onClick={() => {
                          handleFilterChange('dateRange', 'all');
                          handleFilterChange('startDate', null);
                          handleFilterChange('endDate', null);
                        }}
                      />
                    </Badge>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>S.No</TableHead>
              <TableHead>ID</TableHead>
              <TableHead className='hidden md:table-cell'>Form</TableHead>
              <TableHead className='hidden lg:table-cell'>Source</TableHead>
              <TableHead className='hidden md:table-cell'>Submitted</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className='text-right'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {responses && responses.length > 0 ? (
              responses.map((response, index) => (
                <TableRow key={response.id}>
                  <TableCell>{(page - 1) * perPage + index + 1}</TableCell>
                  <TableCell className='font-mono text-xs'>
                    {response.id.substring(0, 8)}
                  </TableCell>

                  <TableCell className='hidden md:table-cell'>
                    <Badge variant='outline'>
                      {getFormName(response.form_id)}
                    </Badge>
                  </TableCell>
                  <TableCell className='hidden lg:table-cell'>
                    <Badge variant='secondary'>
                      {getSourceName(response.form_id)}
                    </Badge>
                  </TableCell>
                  <TableCell className='hidden md:table-cell'>
                    <div className='flex items-center gap-1'>
                      <Clock className='h-3 w-3 text-muted-foreground' />
                      <span>
                        {dateFormat(new Date(response.created_at), 'PP')}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant='secondary'
                      className={getStatusColor(response.status)}
                    >
                      {response.status}
                    </Badge>
                  </TableCell>
                  <TableCell className='text-right'>
                    <div className='flex items-center justify-end gap-2'>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant='ghost'
                            size='icon'
                            onClick={() => setViewingResponse(response.id)}
                          >
                            <Eye className='h-4 w-4' />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className='max-w-3xl max-h-[90vh] overflow-y-auto bg-gradient-to-b from-white to-slate-50 dark:from-slate-900 dark:to-slate-950'>
                          <DialogHeader className='pb-4 border-b'>
                            <div className='flex items-center gap-2'>
                              <Badge
                                variant='outline'
                                className='bg-primary/10 text-primary'
                              >
                                Response #{response.id.substring(0, 6)}
                              </Badge>
                              <DialogTitle className='text-xl'>
                                Response Details
                              </DialogTitle>
                            </div>
                            <DialogDescription className='mt-2 flex items-center gap-2'>
                              <Clock className='h-4 w-4 text-muted-foreground' />
                              Submitted on{' '}
                              {dateFormat(
                                new Date(response.created_at),
                                'PPpp'
                              )}
                            </DialogDescription>
                          </DialogHeader>

                          <div className='mt-6 space-y-6'>
                            {/* Respondent Info Card */}
                            <div className='bg-white dark:bg-slate-900 rounded-lg border shadow-sm overflow-hidden'>
                              <div className='bg-primary/5 p-4 flex flex-col md:flex-row justify-between gap-4 border-b'>
                                <div className='space-y-1'>
                                  <h3 className='text-lg font-semibold flex items-center gap-2'>
                                    <span className='h-2 w-2 rounded-full bg-primary'></span>
                                    {response.data.name ||
                                      response.data.fullName ||
                                      response.data.email ||
                                      'Anonymous'}
                                  </h3>
                                  <div className='flex flex-col gap-1 text-sm text-muted-foreground'>
                                    {response.data.email && (
                                      <div className='flex items-center gap-2'>
                                        <svg
                                          xmlns='http://www.w3.org/2000/svg'
                                          width='14'
                                          height='14'
                                          viewBox='0 0 24 24'
                                          fill='none'
                                          stroke='currentColor'
                                          strokeWidth='2'
                                          strokeLinecap='round'
                                          strokeLinejoin='round'
                                        >
                                          <rect
                                            width='20'
                                            height='16'
                                            x='2'
                                            y='4'
                                            rx='2'
                                          />
                                          <path d='m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7' />
                                        </svg>
                                        {response.data.email}
                                      </div>
                                    )}
                                    {response.data.phone && (
                                      <div className='flex items-center gap-2'>
                                        <svg
                                          xmlns='http://www.w3.org/2000/svg'
                                          width='14'
                                          height='14'
                                          viewBox='0 0 24 24'
                                          fill='none'
                                          stroke='currentColor'
                                          strokeWidth='2'
                                          strokeLinecap='round'
                                          strokeLinejoin='round'
                                        >
                                          <path d='M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z' />
                                        </svg>
                                        {response.data.phone}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className='flex items-center gap-3'>
                                  <Badge
                                    variant='secondary'
                                    className={`py-1.5 px-3 ${getStatusColor(
                                      response.status
                                    )}`}
                                  >
                                    {response.status.charAt(0).toUpperCase() +
                                      response.status.slice(1)}
                                  </Badge>
                                </div>
                              </div>

                              <div className='p-4 grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8'>
                                <div>
                                  <h4 className='text-xs font-medium uppercase text-muted-foreground'>
                                    Form
                                  </h4>
                                  <p className='font-medium mt-1 flex items-center gap-2'>
                                    <svg
                                      xmlns='http://www.w3.org/2000/svg'
                                      width='16'
                                      height='16'
                                      viewBox='0 0 24 24'
                                      fill='none'
                                      stroke='currentColor'
                                      strokeWidth='2'
                                      strokeLinecap='round'
                                      strokeLinejoin='round'
                                    >
                                      <path d='M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z' />
                                      <path d='M13 2v7h7' />
                                    </svg>
                                    {getFormName(response.form_id)}
                                  </p>
                                </div>
                                <div>
                                  <h4 className='text-xs font-medium uppercase text-muted-foreground'>
                                    Source
                                  </h4>
                                  <p className='font-medium mt-1 flex items-center gap-2'>
                                    <svg
                                      xmlns='http://www.w3.org/2000/svg'
                                      width='16'
                                      height='16'
                                      viewBox='0 0 24 24'
                                      fill='none'
                                      stroke='currentColor'
                                      strokeWidth='2'
                                      strokeLinecap='round'
                                      strokeLinejoin='round'
                                    >
                                      <path d='M22 12h-4l-3 9L9 3l-3 9H2' />
                                    </svg>
                                    {getSourceName(response.form_id)}
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Form Data Card */}
                            <div className='bg-white dark:bg-slate-900 rounded-lg border shadow-sm overflow-hidden'>
                              <div className='bg-blue-50 dark:bg-blue-900/20 p-4 border-b flex items-center justify-between'>
                                <h4 className='font-medium text-blue-700 dark:text-blue-300 flex items-center gap-2'>
                                  <svg
                                    xmlns='http://www.w3.org/2000/svg'
                                    width='18'
                                    height='18'
                                    viewBox='0 0 24 24'
                                    fill='none'
                                    stroke='currentColor'
                                    strokeWidth='2'
                                    strokeLinecap='round'
                                    strokeLinejoin='round'
                                  >
                                    <path d='M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z' />
                                    <polyline points='14 2 14 8 20 8' />
                                    <path d='M16 13H8' />
                                    <path d='M16 17H8' />
                                    <path d='M10 9H8' />
                                  </svg>
                                  Form Data
                                </h4>
                              </div>
                              <div className='p-0'>
                                <Accordion
                                  type='single'
                                  collapsible
                                  className='w-full'
                                  defaultValue='data'
                                >
                                  <AccordionItem
                                    value='data'
                                    className='border-0'
                                  >
                                    <AccordionTrigger className='px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50'>
                                      <span className='text-sm'>
                                        View all submitted data
                                      </span>
                                    </AccordionTrigger>
                                    <AccordionContent className='max-h-[40vh] overflow-y-auto'>
                                      <div className='px-4 py-2'>
                                        {Object.entries(response.data).map(
                                          ([key, value], index) => (
                                            <div
                                              key={key}
                                              className={`grid grid-cols-1 md:grid-cols-3 gap-2 py-3 ${
                                                index !== 0 ? 'border-t' : ''
                                              }`}
                                            >
                                              <div className='font-medium text-slate-700 dark:text-slate-300 capitalize'>
                                                {key
                                                  .replace(/([A-Z])/g, ' $1')
                                                  .replace(/_/g, ' ')}
                                              </div>
                                              <div className='md:col-span-2 text-slate-900 dark:text-slate-100 break-words'>
                                                {formatFieldDisplay(key, value)}
                                              </div>
                                            </div>
                                          )
                                        )}
                                      </div>
                                    </AccordionContent>
                                  </AccordionItem>
                                </Accordion>
                              </div>
                            </div>

                            {/* Follow-up Notes Card */}
                            {response.follow_up_notes && (
                              <div className='bg-white dark:bg-slate-900 rounded-lg border shadow-sm overflow-hidden'>
                                <div className='bg-green-50 dark:bg-green-900/20 p-4 border-b'>
                                  <h4 className='font-medium text-green-700 dark:text-green-300 flex items-center gap-2'>
                                    <svg
                                      xmlns='http://www.w3.org/2000/svg'
                                      width='18'
                                      height='18'
                                      viewBox='0 0 24 24'
                                      fill='none'
                                      stroke='currentColor'
                                      strokeWidth='2'
                                      strokeLinecap='round'
                                      strokeLinejoin='round'
                                    >
                                      <path d='M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z' />
                                      <path d='M12 7c2 0 4 1 4 3' />
                                    </svg>
                                    Follow-up Notes
                                  </h4>
                                </div>
                                <div className='p-4'>
                                  <p className='text-sm whitespace-pre-line'>
                                    {response.follow_up_notes}
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* Next Follow-up Date */}
                            {response.next_follow_up_date && (
                              <div className='bg-white dark:bg-slate-900 rounded-lg border shadow-sm overflow-hidden'>
                                <div className='bg-purple-50 dark:bg-purple-900/20 p-4 flex items-center gap-3'>
                                  <div className='bg-purple-100 dark:bg-purple-800 h-10 w-10 rounded-full flex items-center justify-center'>
                                    <Calendar className='h-5 w-5 text-purple-700 dark:text-purple-300' />
                                  </div>
                                  <div>
                                    <h4 className='font-medium text-purple-700 dark:text-purple-300'>
                                      Next Follow-up
                                    </h4>
                                    <p className='text-sm mt-0.5'>
                                      {dateFormat(
                                        new Date(response.next_follow_up_date),
                                        'PPP'
                                      )}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={8} className='h-24 text-center'>
                  No responses found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className='flex justify-center mt-4'>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => handlePageChange(Math.max(1, page - 1))}
                  className={page === 1 ? 'pointer-events-none opacity-50' : ''}
                />
              </PaginationItem>

              {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                .filter((pageNum) => {
                  // Show first page, last page, current page, and pages around current page
                  return (
                    pageNum === 1 ||
                    pageNum === pagination.totalPages ||
                    Math.abs(pageNum - page) <= 1
                  );
                })
                .map((pageNum, i, filteredPages) => {
                  // Add ellipsis if there are gaps in the sequence
                  const prevPage = filteredPages[i - 1];
                  const needsEllipsisBefore =
                    prevPage && pageNum - prevPage > 1;

                  return (
                    <div key={pageNum} className='flex items-center'>
                      {needsEllipsisBefore && (
                        <PaginationItem>
                          <PaginationEllipsis />
                        </PaginationItem>
                      )}
                      <PaginationItem>
                        <PaginationLink
                          isActive={pageNum === page}
                          onClick={() => handlePageChange(pageNum)}
                        >
                          {pageNum}
                        </PaginationLink>
                      </PaginationItem>
                    </div>
                  );
                })}

              <PaginationItem>
                <PaginationNext
                  onClick={() =>
                    handlePageChange(Math.min(pagination.totalPages, page + 1))
                  }
                  className={
                    page === pagination.totalPages
                      ? 'pointer-events-none opacity-50'
                      : ''
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
}
