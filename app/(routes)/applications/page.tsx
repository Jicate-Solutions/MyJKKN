'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  PlusCircle,
  Search,
  MoreVertical,
  Download,
  ChevronDown
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import BeatLoader from 'react-spinners/BeatLoader';

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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { ContentLayout } from '@/components/layout/content-layout';
import { toast } from 'react-hot-toast';
import { utils, writeFile } from 'xlsx';
import { useAuth } from '@/providers/auth-provider';

interface Application {
  id: string;
  name: string;
  description: string;
  url: string;
  category: string;
  subcategory: string;
  integration_type: string;
  authentication_method: string;
  display_order: number;
  is_active: boolean;
  tags: string[];
  access_permissions: string[];
  support_contact: {
    name: string;
    email: string;
    phone?: string;
  };
  supported_platforms: string;
  application_type: string;
  data_sensitivity_level: string;
  api_endpoints?: Array<{
    name: string;
    endpoint: string;
    method: string;
    description?: string;
  }>;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export default function ApplicationsPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const { user, loading: authLoading } = useAuth(); // Add auth context
  const [isLoading, setIsLoading] = useState(true);
  const [applications, setApplications] = useState<Application[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    internal: 0,
    external: 0
  });

  const fetchApplications = useCallback(async () => {
    try {
      if (!user) return;
      setIsLoading(true);
      const { data, error } = await supabase
        .from('applications')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) throw error;

      setApplications(data || []);
      setStats({
        total: data?.length || 0,
        active: data?.filter((app) => app.is_active).length || 0,
        internal:
          data?.filter((app) => app.application_type === 'Internal').length ||
          0,
        external:
          data?.filter((app) => app.application_type === 'External').length || 0
      });
    } catch (error) {
      console.error('Error fetching applications:', error);
      toast.error('Failed to load applications');
    } finally {
      setIsLoading(false);
    }
  }, [user, supabase]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/login');
      return;
    }

    if (user) {
      fetchApplications();
    }
  }, [user, authLoading, router, fetchApplications]);

  // Filter applications based on search query
  const filteredApplications = applications.filter(
    (app) =>
      app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.tags.some((tag) =>
        tag.toLowerCase().includes(searchQuery.toLowerCase())
      )
  );

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('applications')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Application deleted successfully');
      fetchApplications(); // Refresh the list
    } catch (error) {
      console.error('Error deleting application:', error);
      toast.error('Failed to delete application');
    }
  };

  // Loading states
  if (authLoading || (!user && isLoading)) {
    return (
      <ContentLayout title='Applications'>
        <div className='flex items-center justify-center h-screen w-full'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  // Not authenticated
  if (!user) {
    return null;
  }

  // Check if data is loading
  if (isLoading) {
    return (
      <ContentLayout title='Applications'>
        <div className='flex items-center justify-center h-screen w-full'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  // Add this function inside your component
  const handleExport = () => {
    try {
      // Prepare data for export
      const exportData = applications.map((app) => ({
        'Application Name': app.name,
        Description: app.description,
        URL: app.url,
        Category: app.category,
        Subcategory: app.subcategory,
        'Integration Type': app.integration_type,
        'Authentication Method': app.authentication_method,
        'Display Order': app.display_order,
        Status: app.is_active ? 'Active' : 'Inactive',
        Tags: Array.isArray(app.tags) ? app.tags.join(', ') : app.tags,
        'Access Permissions': Array.isArray(app.access_permissions)
          ? app.access_permissions.join(', ')
          : app.access_permissions,
        'Support Contact Name': app.support_contact?.name || '',
        'Support Contact Email': app.support_contact?.email || '',
        'Support Contact Phone': app.support_contact?.phone || '',
        'Supported Platforms': app.supported_platforms,
        'Application Type': app.application_type,
        'Data Sensitivity Level': app.data_sensitivity_level,
        'API Endpoints': app.api_endpoints
          ? app.api_endpoints
              .map(
                (endpoint) =>
                  `${endpoint.name} (${endpoint.method}): ${endpoint.endpoint}`
              )
              .join('\n')
          : '',
        'Created At': formatDate(app.created_at),
        'Created By': app.created_by || '',
        'Last Updated': formatDate(app.updated_at)
      }));

      // Set column widths
      const wsColWidths = [
        { wch: 20 }, // Application Name
        { wch: 30 }, // Description
        { wch: 30 }, // URL
        { wch: 15 }, // Category
        { wch: 15 }, // Subcategory
        { wch: 15 }, // Integration Type
        { wch: 20 }, // Authentication Method
        { wch: 10 }, // Display Order
        { wch: 10 }, // Status
        { wch: 20 }, // Tags
        { wch: 25 }, // Access Permissions
        { wch: 20 }, // Support Contact Name
        { wch: 25 }, // Support Contact Email
        { wch: 15 }, // Support Contact Phone
        { wch: 15 }, // Supported Platforms
        { wch: 15 }, // Application Type
        { wch: 20 }, // Data Sensitivity Level
        { wch: 40 }, // API Endpoints
        { wch: 20 }, // Created At
        { wch: 20 }, // Created By
        { wch: 20 } // Last Updated
      ];

      // Create workbook and worksheet
      const ws = utils.json_to_sheet(exportData);

      // Apply column widths
      ws['!cols'] = wsColWidths;

      // Apply styles for better readability
      const range = utils.decode_range(ws['!ref'] || 'A1');
      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cell_address = utils.encode_cell({ r: R, c: C });
          if (!ws[cell_address]) continue;

          // Style header row
          if (R === 0) {
            ws[cell_address].s = {
              font: { bold: true },
              fill: { fgColor: { rgb: 'EFEFEF' } },
              alignment: { vertical: 'center', horizontal: 'center' }
            };
          } else {
            // Style data cells
            ws[cell_address].s = {
              alignment: { vertical: 'center', wrapText: true }
            };
          }
        }
      }

      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, 'Applications');

      // Generate filename with current date
      const currentDate = new Date().toISOString().split('T')[0];
      const filename = `applications_export_${currentDate}.xlsx`;

      // Save file
      writeFile(wb, filename);
      toast.success('Applications exported successfully');
    } catch (error) {
      console.error('Error exporting applications:', error);
      toast.error('Failed to export applications');
    }
  };

  return (
    <ContentLayout title='Applications'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/'>Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Applications</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-4 px-1 sm:px-2 py-4'>
        {/* Header Section - Improved mobile layout */}
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center'>
          <div>
            <h1 className='text-xl sm:text-2xl font-bold tracking-tight'>
              Applications
            </h1>
            <p className='text-sm text-muted-foreground'>
              Manage and monitor all applications
            </p>
          </div>
          <div className='flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4'>
            <Button
              variant='outline'
              onClick={handleExport}
              className='w-full sm:w-auto justify-center'
            >
              <Download className='mr-2 h-4 w-4' />
              Export
            </Button>
            <Link href='/applications/new' className='w-full sm:w-auto'>
              <Button className='w-full sm:w-auto justify-center'>
                <PlusCircle className='mr-2 h-4 w-4' />
                Add New Application
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats Cards */}
        <div className='grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4'>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-xs sm:text-sm font-medium'>
                Total Applications
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-lg sm:text-2xl font-bold'>{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-xs sm:text-sm font-medium'>
                Active Applications
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-lg sm:text-2xl font-bold'>
                {stats.active}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-xs sm:text-sm font-medium'>
                Internal Applications
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-lg sm:text-2xl font-bold'>
                {stats.internal}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-xs sm:text-sm font-medium'>
                External Applications
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-lg sm:text-2xl font-bold'>
                {stats.external}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search - Full width on mobile */}
        <div className='flex items-center w-full'>
          <div className='relative flex-1'>
            <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground' />
            <Input
              placeholder='Search applications...'
              className='pl-10 w-full'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Responsive Table */}
        <Card>
          <CardContent className='p-0 overflow-auto'>
            {/* Mobile List View */}
            <div className='block sm:hidden'>
              {filteredApplications.map((app) => (
                <div key={app.id} className='border-b p-4 space-y-3'>
                  <div className='flex justify-between items-start'>
                    <div className='space-y-1'>
                      <p className='font-medium'>{app.name}</p>
                      <p className='text-sm text-muted-foreground line-clamp-2'>
                        {app.description}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant='ghost' className='h-8 w-8 p-0'>
                          <ChevronDown className='h-4 w-4' />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align='end'>
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem
                          onClick={() => router.push(`/applications/${app.id}`)}
                        >
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            router.push(`/applications/${app.id}/edit`)
                          }
                        >
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className='text-red-600'
                          onClick={() => handleDelete(app.id)}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className='grid grid-cols-2 gap-2 text-sm'>
                    <div>
                      <p className='text-muted-foreground'>Category</p>
                      <p>
                        {app.category} / {app.subcategory}
                      </p>
                    </div>
                    <div>
                      <p className='text-muted-foreground'>Type</p>
                      <p>{app.integration_type}</p>
                    </div>
                    <div>
                      <p className='text-muted-foreground'>Status</p>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          app.is_active
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {app.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div>
                      <p className='text-muted-foreground'>Platform</p>
                      <p>{app.supported_platforms}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className='hidden sm:block min-w-full'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className='hidden md:table-cell'>
                      Platform
                    </TableHead>
                    <TableHead className='hidden md:table-cell'>
                      Last Updated
                    </TableHead>
                    <TableHead className='w-[50px]'></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredApplications.map((app) => (
                    <TableRow key={app.id}>
                      <TableCell className='font-medium'>
                        <div>
                          <p className='font-medium'>{app.name}</p>
                          <p className='text-sm text-muted-foreground line-clamp-1 md:line-clamp-2'>
                            {app.description}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p>{app.category}</p>
                          <p className='text-sm text-muted-foreground'>
                            {app.subcategory}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className='whitespace-nowrap'>
                        {app.integration_type}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            app.is_active
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {app.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </TableCell>
                      <TableCell className='hidden md:table-cell whitespace-nowrap'>
                        {app.supported_platforms}
                      </TableCell>
                      <TableCell className='hidden md:table-cell whitespace-nowrap'>
                        {formatDate(app.updated_at)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant='ghost' className='h-8 w-8 p-0'>
                              <MoreVertical className='h-4 w-4' />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align='end'>
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem
                              onClick={() =>
                                router.push(`/applications/${app.id}`)
                              }
                            >
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                router.push(`/applications/${app.id}/edit`)
                              }
                            >
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className='text-red-600'
                              onClick={() => handleDelete(app.id)}
                            >
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
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
