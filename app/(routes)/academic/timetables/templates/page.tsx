'use client';

import { useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
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
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { usePermissions } from '@/hooks/use-permissions';
import { 
  Plus, 
  Eye, 
  Edit, 
  Trash2, 
  Copy, 
  Calendar,
  Users,
  Clock,
  TrendingUp,
  Star,
  Activity,
  BarChart3,
  Filter,
  Search,
  Grid3x3,
  List,
  ChevronDown,
  Settings,
  Download,
  Upload
} from 'lucide-react';
import { TemplateLibraryDataTable } from './_components/template-library-data-table';
import { TemplateFilters } from './_components/template-filters';
import { TemplatePreviewModal } from './_components/template-preview-modal';
import { TemplateStatsCard } from './_components/template-stats-card';
import { cn } from '@/lib/utils';

export default function TemplateLibraryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isSuperAdmin, canAccess } = usePermissions();
  
  // UI state
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Permission checks
  const canCreateTemplate = isSuperAdmin || canAccess('academic.timetables', 'create');
  const canManageTemplates = isSuperAdmin || canAccess('academic.timetables', 'edit');

  // Parse current search parameters
  const currentSearch = Object.fromEntries(searchParams?.entries() ?? []);

  // Handle filter changes by updating URL
  const handleFilterChange = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');

      if (value && value !== 'all') {
        params.set(key, value);
      } else {
        params.delete(key);
      }

      // Reset page to 1 when filters change
      params.set('page', '1');

      router.push(`/academic/timetables/templates?${params.toString()}`);
    },
    [router, searchParams]
  );

  // Handle clearing all filters
  const handleClearFilters = useCallback(() => {
    const params = new URLSearchParams();
    params.set('page', '1');
    const pageSize = searchParams?.get('pageSize');
    if (pageSize) {
      params.set('pageSize', pageSize);
    }
    router.push(`/academic/timetables/templates?${params.toString()}`);
  }, [router, searchParams]);

  return (
    <PermissionGuard module='academic.timetables' action='view'>
      <ContentLayout title='Template Library'>
        <div className='space-y-4 md:space-y-6'>
          {/* Header Section - Improved responsiveness */}
          <div className='flex flex-col space-y-4'>
            {/* Super Admin Controls - Better mobile layout */}
            {isSuperAdmin && (
              <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 md:p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl shadow-sm'>
                <div className='flex flex-col sm:flex-row sm:items-center gap-2'>
                  <Badge variant='default' className='gap-1 bg-gradient-to-r from-blue-600 to-indigo-600 shadow-sm w-fit'>
                    <Users className='h-3 w-3' />
                    Super Admin
                  </Badge>
                  <span className='text-xs sm:text-sm text-blue-700 font-medium'>
                    Managing templates across all institutions
                  </span>
                </div>
                <div className='flex items-center gap-2'>
                  <Button
                    variant='outline'
                    size='sm'
                    className='gap-2 border-blue-300 text-blue-700 hover:bg-blue-100 transition-all duration-200 shadow-sm'
                    onClick={() => router.push('/academic/timetables/templates/analytics')}
                  >
                    <TrendingUp className='h-3 w-3' />
                    <span className='hidden sm:inline'>Analytics</span>
                  </Button>
                </div>
              </div>
            )}

            {/* Breadcrumb - Enhanced styling */}
            <div className='bg-white p-3 rounded-lg border shadow-sm'>
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link href='/' className='text-muted-foreground hover:text-primary transition-colors'>
                        Dashboard
                      </Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link href='/academic' className='text-muted-foreground hover:text-primary transition-colors'>
                        Academic
                      </Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link href='/academic/timetables' className='text-muted-foreground hover:text-primary transition-colors'>
                        Timetables
                      </Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage className='font-semibold text-primary'>Templates</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>

            {/* Page Title and Actions - Enhanced layout */}
            <div className='flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 p-4 bg-white rounded-xl border shadow-sm'>
              <div className='space-y-1'>
                <h1 className='text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2'>
                  <Star className='h-5 w-5 md:h-6 md:w-6 text-yellow-500' />
                  Template Library
                </h1>
                <p className='text-sm md:text-base text-muted-foreground'>
                  Browse, preview, and manage reusable timetable templates
                </p>
              </div>
              
              {canCreateTemplate && (
                <div className='flex flex-col sm:flex-row gap-2'>
                  <Button
                    onClick={() => router.push('/academic/timetables/new?create_as_template=true')}
                    size='sm'
                    className='gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 shadow-sm transition-all duration-200'
                  >
                    <Plus className='h-4 w-4' />
                    <span className='hidden sm:inline'>Create Template</span>
                    <span className='sm:hidden'>Create</span>
                  </Button>
                  <Button
                    variant='outline'
                    onClick={() => router.push('/academic/timetables?is_template=true')}
                    size='sm'
                    className='gap-2 hover:bg-gray-50 transition-all duration-200 shadow-sm'
                  >
                    <Eye className='h-4 w-4' />
                    <span className='hidden sm:inline'>View All</span>
                    <span className='sm:hidden'>View</span>
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Statistics Cards - Improved responsive grid */}
          <div className='grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4'>
            <TemplateStatsCard />
          </div>

          {/* Search and Filter Section - Redesigned */}
          <Card className='shadow-sm border-0 bg-gradient-to-br from-gray-50 to-white'>
            <CardHeader className='pb-4'>
              <div className='flex flex-col md:flex-row md:items-center md:justify-between gap-4'>
                <CardTitle className='text-lg font-semibold flex items-center gap-2'>
                  <Search className='h-5 w-5 text-blue-600' />
                  Search & Filter Templates
                </CardTitle>
                <div className='flex items-center gap-2'>
                  {/* View Mode Toggle */}
                  <div className='hidden lg:flex items-center gap-1 p-1 bg-white rounded-lg border shadow-sm'>
                    <Button
                      variant={viewMode === 'list' ? 'default' : 'ghost'}
                      size='sm'
                      onClick={() => setViewMode('list')}
                      className='h-8 w-8 p-0'
                    >
                      <List className='h-4 w-4' />
                    </Button>
                    <Button
                      variant={viewMode === 'grid' ? 'default' : 'ghost'}
                      size='sm'
                      onClick={() => setViewMode('grid')}
                      className='h-8 w-8 p-0'
                    >
                      <Grid3x3 className='h-4 w-4' />
                    </Button>
                  </div>
                  
                  {/* Filter Toggle */}
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => setShowFilters(!showFilters)}
                    className={cn(
                      'gap-2 transition-all duration-200',
                      showFilters && 'bg-blue-50 border-blue-200 text-blue-700'
                    )}
                  >
                    <Filter className='h-4 w-4' />
                    <span className='hidden sm:inline'>Filters</span>
                    <ChevronDown className={cn(
                      'h-3 w-3 transition-transform duration-200',
                      showFilters && 'rotate-180'
                    )} />
                  </Button>
                </div>
              </div>
              
              {/* Enhanced Search Bar */}
              <div className='relative'>
                <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400' />
                <Input
                  placeholder='Search templates by name, description, or tags...'
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className='pl-10 h-11 bg-white border-gray-200 focus:border-blue-500 focus:ring-blue-500 shadow-sm'
                />
              </div>
            </CardHeader>
            
            {/* Collapsible Filters */}
            {showFilters && (
              <CardContent className='pt-0 border-t bg-white rounded-b-lg'>
                <TemplateFilters
                  searchParams={currentSearch}
                  onFilterChange={handleFilterChange}
                  onClearFilters={handleClearFilters}
                />
              </CardContent>
            )}
          </Card>

          {/* Main Content Area - Enhanced */}
          <Card className='shadow-sm'>
            <CardHeader className='border-b bg-gradient-to-r from-gray-50 to-white'>
              <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3'>
                <div className='space-y-1'>
                  <CardTitle className='text-lg font-semibold text-gray-900'>
                    Available Templates
                  </CardTitle>
                  <p className='text-sm text-muted-foreground'>
                    Manage and organize your timetable templates
                  </p>
                </div>
                
                {/* Additional Actions */}
                <div className='flex items-center gap-2'>
                  <Button
                    variant='outline'
                    size='sm'
                    className='gap-2 hover:bg-gray-50 transition-all duration-200'
                  >
                    <Download className='h-4 w-4' />
                    <span className='hidden sm:inline'>Export</span>
                  </Button>
                  <Button
                    variant='outline'
                    size='sm'
                    className='gap-2 hover:bg-gray-50 transition-all duration-200'
                  >
                    <Upload className='h-4 w-4' />
                    <span className='hidden sm:inline'>Import</span>
                  </Button>
                  <Button
                    variant='outline'
                    size='sm'
                    className='gap-2 hover:bg-gray-50 transition-all duration-200'
                  >
                    <Settings className='h-4 w-4' />
                    <span className='hidden lg:inline'>Settings</span>
                  </Button>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className='p-0'>
              {/* Templates Data Table */}
              <div className='overflow-hidden'>
                <TemplateLibraryDataTable search={currentSearch} />
              </div>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}