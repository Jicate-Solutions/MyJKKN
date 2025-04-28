'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  Check,
  EyeIcon,
  FileEdit,
  Loader2,
  Search,
  SlidersHorizontal,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
} from '@/components/ui/pagination';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { useStudents } from '@/hooks/student/use-students';
import { StudentFilters } from '@/types/student';

export default function StudentsPage() {
  const router = useRouter();
  const [filters, setFilters] = useState<StudentFilters>({
    search: '',
    name: '',
    institution: '',
    program: '',
    department: '',
    is_profile_complete: undefined,
    page: 1,
    limit: 10
  });
  const [currentPage, setCurrentPage] = useState(1);
  const {
    data: studentsData,
    isLoading,
    refetch
  } = useStudents({
    ...filters,
    page: currentPage,
    limit: 10
  });

  const handleFilterChange = (newFilters: StudentFilters) => {
    console.log('Applying filters:', newFilters);
    setFilters(newFilters);
    if (newFilters.page === 1) {
      setCurrentPage(1);
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // Update the filter state when page changes
  useState(() => {
    setFilters((prev) => ({ ...prev, page: currentPage }));
  });

  const metadata = {
    currentPage,
    totalPages: studentsData?.metadata.totalPages || 1,
    pageSize: studentsData?.metadata.limit || 10,
    totalCount: studentsData?.metadata.total || 0
  };

  return (
    <ContentLayout title='Students'>
      <div className='space-y-6'>
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Students', href: '/students' },
            { label: 'Student Management' }
          ]}
        />
        <div className='flex flex-col md:flex-row justify-between items-start md:items-center gap-4'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>Students</h1>
            <p className='text-muted-foreground'>
              Manage enrolled student records
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Student Records</CardTitle>
            <CardDescription>
              View and manage all enrolled students
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='flex flex-col md:flex-row gap-4 mb-6'>
              <div className='flex-1'>
                <Input
                  placeholder='Search students...'
                  value={filters.search || ''}
                  onChange={(e) =>
                    handleFilterChange({
                      ...filters,
                      search: e.target.value,
                      page: 1
                    })
                  }
                  className='w-full'
                />
              </div>
              <Select
                value={
                  filters.is_profile_complete !== undefined
                    ? String(filters.is_profile_complete)
                    : 'all'
                }
                onValueChange={(value) => {
                  handleFilterChange({
                    ...filters,
                    is_profile_complete:
                      value === 'all' ? undefined : value === 'true',
                    page: 1
                  });
                }}
              >
                <SelectTrigger className='w-full md:w-[180px]'>
                  <SelectValue placeholder='Profile Status' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Profiles</SelectItem>
                  <SelectItem value='true'>Complete</SelectItem>
                  <SelectItem value='false'>Incomplete</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant='outline'
                className='w-full md:w-auto'
                onClick={() => {
                  setFilters({
                    search: '',
                    name: '',
                    institution: '',
                    program: '',
                    department: '',
                    is_profile_complete: undefined,
                    page: 1,
                    limit: 10
                  });
                  setCurrentPage(1);
                }}
              >
                Reset
              </Button>
            </div>

            {isLoading ? (
              <div className='flex flex-col items-center justify-center py-10'>
                <Loader2 className='h-8 w-8 animate-spin text-primary mb-4' />
                <p className='text-muted-foreground'>
                  Loading student records...
                </p>
              </div>
            ) : (
              <>
                <div className='border rounded-md'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student Name</TableHead>
                        <TableHead>Roll Number</TableHead>
                        <TableHead>Program</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className='text-right'>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {studentsData?.data && studentsData.data.length > 0 ? (
                        studentsData.data.map((student) => (
                          <TableRow key={student.id}>
                            <TableCell className='font-medium'>
                              {student.student_name}
                            </TableCell>
                            <TableCell>
                              {student.roll_number || (
                                <span className='text-muted-foreground italic'>
                                  Not assigned
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              {student.program?.program_name || 'N/A'}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  student.is_profile_complete
                                    ? 'default'
                                    : 'outline'
                                }
                                className={
                                  student.is_profile_complete
                                    ? 'bg-green-100 text-green-800'
                                    : ''
                                }
                              >
                                {student.is_profile_complete
                                  ? 'Complete'
                                  : 'Incomplete'}
                              </Badge>
                            </TableCell>
                            <TableCell className='text-right'>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant='ghost'
                                    className='h-8 w-8 p-0'
                                  >
                                    <span className='sr-only'>Open menu</span>
                                    <SlidersHorizontal className='h-4 w-4' />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align='end'>
                                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() =>
                                      router.push(`/students/${student.id}`)
                                    }
                                  >
                                    <EyeIcon className='h-4 w-4 mr-2' />
                                    View
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() =>
                                      router.push(
                                        `/students/${student.id}/edit`
                                      )
                                    }
                                  >
                                    <FileEdit className='h-4 w-4 mr-2' />
                                    Edit
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={5} className='h-24 text-center'>
                            No student records found.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                {studentsData?.data && studentsData.data.length > 0 && (
                  <div className='flex items-center justify-end space-x-2 py-4'>
                    <div className='text-sm text-muted-foreground'>
                      Showing{' '}
                      <span className='font-medium'>
                        {(currentPage - 1) * metadata.pageSize + 1}
                      </span>{' '}
                      to{' '}
                      <span className='font-medium'>
                        {Math.min(
                          currentPage * metadata.pageSize,
                          metadata.totalCount
                        )}
                      </span>{' '}
                      of{' '}
                      <span className='font-medium'>{metadata.totalCount}</span>{' '}
                      results
                    </div>
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            onClick={() => {
                              if (currentPage > 1) {
                                handlePageChange(currentPage - 1);
                              }
                            }}
                            className={
                              currentPage <= 1
                                ? 'pointer-events-none opacity-50'
                                : ''
                            }
                          />
                        </PaginationItem>
                        {Array.from(
                          { length: metadata.totalPages },
                          (_, i) => i + 1
                        )
                          .filter(
                            (page) =>
                              page === 1 ||
                              page === metadata.totalPages ||
                              Math.abs(page - currentPage) <= 1
                          )
                          .map((page, i, array) => {
                            const showEllipsis =
                              i > 0 && page - array[i - 1] > 1;
                            return (
                              <div key={page} className='flex items-center'>
                                {showEllipsis && (
                                  <PaginationItem>
                                    <span className='px-4'>...</span>
                                  </PaginationItem>
                                )}
                                <PaginationItem>
                                  <PaginationLink
                                    onClick={() => handlePageChange(page)}
                                    isActive={page === currentPage}
                                  >
                                    {page}
                                  </PaginationLink>
                                </PaginationItem>
                              </div>
                            );
                          })}
                        <PaginationItem>
                          <PaginationNext
                            onClick={() => {
                              if (currentPage < metadata.totalPages) {
                                handlePageChange(currentPage + 1);
                              }
                            }}
                            className={
                              currentPage >= metadata.totalPages
                                ? 'pointer-events-none opacity-50'
                                : ''
                            }
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
