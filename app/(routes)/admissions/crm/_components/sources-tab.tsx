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
  User,
  Building2,
  Calendar
} from 'lucide-react';
import { format } from 'date-fns';
import { useFetchAdmissionSources } from '@/app/hooks/crm/use-fetch-admission-sources';
import { Skeleton } from '@/components/ui/skeleton';

interface SourcesTabProps {
  apiKey: string;
}

export function SourcesTab({ apiKey }: SourcesTabProps) {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  const {
    data: sources,
    pagination,
    loading,
    error
  } = useFetchAdmissionSources({
    apiKey,
    page,
    perPage,
    searchQuery
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // Search is handled by the state update and hook dependency
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
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
        <p className='font-medium'>Error loading sources</p>
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
              placeholder='Search sources...'
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
              <TableHead className='w-[250px]'>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className='hidden md:table-cell'>Contact</TableHead>
              <TableHead className='hidden md:table-cell'>Start Date</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sources && sources.length > 0 ? (
              sources.map((source, index) => (
                <TableRow key={source.id}>
                  <TableCell className='font-medium'>{index + 1}</TableCell>
                  <TableCell className='font-medium'>
                    <div className='flex flex-col'>
                      <span>{source.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant='outline'>{source.type}</Badge>
                  </TableCell>
                  <TableCell className='hidden md:table-cell'>
                    {source.contact_name ? (
                      <div className='flex flex-col text-sm'>
                        <div className='flex items-center gap-1 mb-1'>
                          <User className='h-3 w-3' />
                          <span>{source.contact_name}</span>
                        </div>
                        <div className='flex flex-col gap-1'>
                          {source.contact_email && (
                            <span className='text-sm text-muted-foreground truncate max-w-[150px]'>
                              {source.contact_email}
                            </span>
                          )}
                          {source.contact_phone && (
                            <span className='text-sm text-muted-foreground'>
                              {source.contact_phone}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className='text-muted-foreground text-xs'>
                        No contact info
                      </span>
                    )}
                  </TableCell>
                  <TableCell className='hidden md:table-cell'>
                    {source.start_date ? (
                      <div className='flex items-center gap-1'>
                        <Calendar className='h-3 w-3 text-muted-foreground' />
                        <span>{format(new Date(source.start_date), 'PP')}</span>
                      </div>
                    ) : (
                      <span className='text-muted-foreground text-xs'>
                        Not specified
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={source.is_active ? 'default' : 'secondary'}
                      className={
                        source.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }
                    >
                      {source.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className='h-24 text-center'>
                  No sources found
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
