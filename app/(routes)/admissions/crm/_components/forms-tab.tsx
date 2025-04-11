'use client';

import { useState, useEffect } from 'react';
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
  ExternalLink,
  FileText,
  ListFilter,
  LayoutList,
  Eye,
  Clock
} from 'lucide-react';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { useFetchForms } from '@/app/hooks/crm/use-fetch-forms';
import { useFetchAdmissionSources } from '@/app/hooks/crm/use-fetch-admission-sources';
import Link from 'next/link';

interface FormsTabProps {
  apiKey: string;
}

// Public form base URL - in a real app, this would be from env variable
const PUBLIC_FORM_BASE_URL =
  'https://jkkn-admission-managements.vercel.app/form/';

export function FormsTab({ apiKey }: FormsTabProps) {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  const {
    data: forms,
    pagination,
    loading,
    error
  } = useFetchForms({
    apiKey,
    page,
    perPage
  });

  // Fetch sources to map source_id to source name
  const { data: sources, loading: loadingSources } = useFetchAdmissionSources({
    apiKey,
    perPage: 100 // Get all sources to ensure we have the mapping
  });

  // Function to get source name from source_id
  const getSourceName = (sourceId: string) => {
    if (!sources) return sourceId;
    const source = sources.find((source) => source.id === sourceId);
    return source ? source.name : sourceId;
  };

  // Function to get full published URL
  const getFullPublishedUrl = (endpoint: string | null) => {
    if (!endpoint) return '';
    // If the URL already starts with http or https, return as is
    if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
      return endpoint;
    }
    // Otherwise, prepend the base URL
    return `${PUBLIC_FORM_BASE_URL}${endpoint}`;
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // Search would be handled here in a real implementation
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  if (loading || loadingSources) {
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
        <p className='font-medium'>Error loading forms</p>
        <p className='text-sm mt-1'>{error.message}</p>
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between flex-col md:flex-row gap-4'>
        <form className='w-full md:w-auto' onSubmit={handleSearch}>
          <div className='relative'>
            <Search className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground' />
            <Input
              type='search'
              placeholder='Search forms...'
              className='w-full md:w-[300px] pl-8'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </form>
      </div>

      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>S.No</TableHead>
              <TableHead className='w-[300px]'>Form Title</TableHead>
              <TableHead className='hidden md:table-cell'>Source</TableHead>
              <TableHead className='hidden md:table-cell'>Created</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className='text-right'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {forms && forms.length > 0 ? (
              forms.map((form, index) => (
                <TableRow key={form.id}>
                  <TableCell>{(page - 1) * perPage + index + 1}</TableCell>
                  <TableCell className='font-medium'>{form.title}</TableCell>
                  <TableCell className='hidden md:table-cell'>
                    <Badge variant='outline'>
                      {getSourceName(form.source_id)}
                    </Badge>
                  </TableCell>
                  <TableCell className='hidden md:table-cell'>
                    <div className='flex items-center gap-1'>
                      <Clock className='h-3 w-3 text-muted-foreground' />
                      <span>{format(new Date(form.created_at), 'PP')}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={form.is_published ? 'default' : 'secondary'}
                      className={
                        form.is_published
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }
                    >
                      {form.is_published ? 'Published' : 'Draft'}
                    </Badge>
                  </TableCell>
                  <TableCell className='text-right'>
                    <div className='flex items-center justify-end gap-2'>
                      {form.published_url && (
                        <Button variant='ghost' size='icon' asChild>
                          <a
                            href={getFullPublishedUrl(form.published_url)}
                            target='_blank'
                            rel='noopener noreferrer'
                            title='View published form'
                          >
                            <Eye className='h-4 w-4' />
                          </a>
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className='h-24 text-center'>
                  No forms found
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
