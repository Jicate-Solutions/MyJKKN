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
  MessageCircle
} from 'lucide-react';
import { format } from 'date-fns';
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
import { useFetchFormResponses } from '@/app/hooks/crm/use-fetch-form-responses';

interface ResponsesTabProps {
  apiKey: string;
}

export function ResponsesTab({ apiKey }: ResponsesTabProps) {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [selectedFormId, setSelectedFormId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewingResponse, setViewingResponse] = useState<string | null>(null);

  const {
    data: responses,
    pagination,
    loading,
    error
  } = useFetchFormResponses({
    apiKey,
    formId: selectedFormId === 'all' ? undefined : selectedFormId,
    page,
    perPage
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // Search would be handled here in a real implementation
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
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

  if (loading) {
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

        <Select value={selectedFormId} onValueChange={setSelectedFormId}>
          <SelectTrigger className='w-full md:w-[250px]'>
            <SelectValue placeholder='Filter by form' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All forms</SelectItem>
            {/* This would be populated with available forms */}
            <SelectItem value='form-1'>Undergraduate Admission</SelectItem>
            <SelectItem value='form-2'>Graduate Admission</SelectItem>
            <SelectItem value='form-3'>International Students</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className='w-[250px]'>Respondent</TableHead>
              <TableHead className='hidden md:table-cell'>Form</TableHead>
              <TableHead className='hidden md:table-cell'>Submitted</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className='text-right'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {responses && responses.length > 0 ? (
              responses.map((response) => (
                <TableRow key={response.id}>
                  <TableCell className='font-medium'>
                    <div className='flex flex-col'>
                      <span>
                        {response.data.name ||
                          response.data.fullName ||
                          response.data.email ||
                          'Anonymous'}
                      </span>
                      {response.data.email && (
                        <span className='text-xs text-muted-foreground truncate max-w-[220px]'>
                          {response.data.email}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className='hidden md:table-cell'>
                    <Badge variant='outline'>{response.form_id}</Badge>
                  </TableCell>
                  <TableCell className='hidden md:table-cell'>
                    <div className='flex items-center gap-1'>
                      <Clock className='h-3 w-3 text-muted-foreground' />
                      <span>{format(new Date(response.created_at), 'PP')}</span>
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
                            <MessageCircle className='h-4 w-4' />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className='max-w-3xl'>
                          <DialogHeader>
                            <DialogTitle>Response Details</DialogTitle>
                            <DialogDescription>
                              Form response submitted on{' '}
                              {format(new Date(response.created_at), 'PPpp')}
                            </DialogDescription>
                          </DialogHeader>

                          <div className='mt-4 space-y-4'>
                            <div className='flex flex-col md:flex-row justify-between gap-4 pb-2 border-b'>
                              <div>
                                <h3 className='font-medium'>
                                  {response.data.name ||
                                    response.data.fullName ||
                                    response.data.email ||
                                    'Anonymous'}
                                </h3>
                                {response.data.email && (
                                  <p className='text-sm text-muted-foreground'>
                                    {response.data.email}
                                  </p>
                                )}
                                {response.data.phone && (
                                  <p className='text-sm text-muted-foreground'>
                                    {response.data.phone}
                                  </p>
                                )}
                              </div>
                              <div className='flex flex-col items-end'>
                                <Badge
                                  variant='secondary'
                                  className={getStatusColor(response.status)}
                                >
                                  {response.status}
                                </Badge>
                                <span className='text-xs text-muted-foreground mt-1'>
                                  ID: {response.id}
                                </span>
                              </div>
                            </div>

                            <div className='space-y-4'>
                              <h4 className='font-medium'>Form Data</h4>
                              <div className='rounded-md border p-4 bg-muted/10'>
                                <Accordion
                                  type='single'
                                  collapsible
                                  className='w-full'
                                >
                                  <AccordionItem value='data'>
                                    <AccordionTrigger>
                                      View all submitted data
                                    </AccordionTrigger>
                                    <AccordionContent>
                                      <div className='space-y-2'>
                                        {Object.entries(response.data).map(
                                          ([key, value]) => (
                                            <div
                                              key={key}
                                              className='grid grid-cols-1 md:grid-cols-3 gap-2 py-2 border-t'
                                            >
                                              <div className='font-medium'>
                                                {key}
                                              </div>
                                              <div className='md:col-span-2'>
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

                            {response.follow_up_notes && (
                              <div className='space-y-2'>
                                <h4 className='font-medium'>Follow-up Notes</h4>
                                <div className='rounded-md border p-4 bg-muted/10'>
                                  <p className='text-sm whitespace-pre-line'>
                                    {response.follow_up_notes}
                                  </p>
                                </div>
                              </div>
                            )}

                            {response.next_follow_up_date && (
                              <div className='flex items-center gap-2 text-sm'>
                                <Calendar className='h-4 w-4 text-muted-foreground' />
                                <span>
                                  Next follow-up:{' '}
                                  {format(
                                    new Date(response.next_follow_up_date),
                                    'PPP'
                                  )}
                                </span>
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
                <TableCell colSpan={5} className='h-24 text-center'>
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

      <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-8'>
        {responses &&
          responses.slice(0, 3).map((response) => (
            <Card key={`card-${response.id}`}>
              <CardHeader>
                <div className='flex justify-between items-start'>
                  <div>
                    <CardTitle className='text-lg'>
                      {response.data.name ||
                        response.data.fullName ||
                        response.data.email ||
                        'Anonymous'}
                    </CardTitle>
                    <CardDescription>
                      {response.data.email || 'No email provided'}
                    </CardDescription>
                  </div>
                  <Badge
                    variant='secondary'
                    className={getStatusColor(response.status)}
                  >
                    {response.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className='space-y-3'>
                  <div className='space-y-1'>
                    <div className='text-sm text-muted-foreground'>Form</div>
                    <div className='font-medium'>{response.form_id}</div>
                  </div>

                  <div className='space-y-1'>
                    <div className='text-sm text-muted-foreground'>
                      Submitted on
                    </div>
                    <div className='font-medium'>
                      {format(new Date(response.created_at), 'PPP')}
                    </div>
                  </div>

                  {response.data.message && (
                    <div className='space-y-1'>
                      <div className='text-sm text-muted-foreground'>
                        Message
                      </div>
                      <div className='text-sm line-clamp-3'>
                        {response.data.message}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
              <CardFooter>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant='outline' size='sm' className='w-full'>
                      <MessageSquare className='h-3.5 w-3.5 mr-2' />
                      View Full Response
                    </Button>
                  </DialogTrigger>
                  <DialogContent className='max-w-3xl'>
                    {/* Dialog content would be same as above */}
                  </DialogContent>
                </Dialog>
              </CardFooter>
            </Card>
          ))}
      </div>
    </div>
  );
}
