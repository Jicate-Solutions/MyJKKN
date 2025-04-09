'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  Check,
  Clock,
  EyeIcon,
  FileEdit,
  Loader2,
  Plus,
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
} from '@/components/ui/pagination';
import { getSupabaseClient } from '@/lib/supabase/client';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { useAdmissions } from '@/hooks/admission/use-admissions';
import { AdmissionFilters } from '@/types/admission';
import { AdmissionFilter } from './_components/admission-filters';
import { AdmissionList } from './_components/admission-list';

// Status badge color mapping
const statusColorMap: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  waitlisted: 'bg-blue-100 text-blue-800',
  enrolled: 'bg-purple-100 text-purple-800'
};

// Status icon mapping
const StatusIcon = ({ status }: { status: string }) => {
  switch (status) {
    case 'approved':
      return <Check className='h-4 w-4' />;
    case 'rejected':
      return <X className='h-4 w-4' />;
    case 'pending':
    case 'waitlisted':
    default:
      return <Clock className='h-4 w-4' />;
  }
};

export default function AdmissionsPage() {
  const router = useRouter();
  const [filters, setFilters] = useState<AdmissionFilters>({
    search: '',
    name: '',
    status: '',
    institution: '',
    course: '',
    page: 1,
    limit: 10
  });
  const [currentPage, setCurrentPage] = useState(1);
  const {
    data: admissionsData,
    isLoading,
    refetch
  } = useAdmissions({
    ...filters,
    page: currentPage,
    limit: 10
  });

  const handleFilterChange = (newFilters: AdmissionFilters) => {
    console.log('Applying filters:', newFilters);
    setFilters(newFilters);
    // If the filter component is setting page to 1, we should update our local state
    if (newFilters.page === 1) {
      setCurrentPage(1);
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // Update the filter state when page changes
  useEffect(() => {
    setFilters((prev) => ({ ...prev, page: currentPage }));
  }, [currentPage]);

  const metadata = {
    currentPage,
    totalPages: admissionsData?.metadata.totalPages || 1,
    pageSize: admissionsData?.metadata.limit || 10,
    totalCount: admissionsData?.metadata.total || 0
  };

  return (
    <ContentLayout title='Admissions'>
      <div className='space-y-6'>
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Admissions', href: '/admissions' },
            { label: 'Admissions' }
          ]}
        />
        <div className='flex flex-col md:flex-row justify-between items-start md:items-center gap-4'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>Admissions</h1>
            <p className='text-muted-foreground'>
              Manage student admission applications
            </p>
          </div>
          <Button onClick={() => router.push('/admissions/new')}>
            <Plus className='mr-2 h-4 w-4' />
            New Admission
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Admission Applications</CardTitle>
            <CardDescription>
              View and manage all admission applications
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AdmissionFilter
              filters={filters}
              onFilterChange={handleFilterChange}
            />

            {isLoading ? (
              <div className='flex flex-col items-center justify-center py-10'>
                <Loader2 className='h-8 w-8 animate-spin text-primary mb-4' />
                <p className='text-muted-foreground'>
                  Loading admission applications...
                </p>
              </div>
            ) : (
              <AdmissionList
                admissions={admissionsData?.data || []}
                metadata={metadata}
                onPageChange={handlePageChange}
                onRefresh={refetch}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
