'use client';

import { memo, useCallback, useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import {
  PlusCircle,
  Search,
  MoreVertical,
  Download,
  Trash2,
  Pencil,
  Eye
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import BeatLoader from 'react-spinners/BeatLoader';
import { toast } from 'react-hot-toast';
import { utils, writeFile } from 'xlsx';

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
import { useAuth } from '@/providers/auth-provider';
import { Badge } from '@/components/ui/badge';
import { useApplications } from '@/hooks/use-applications';

// Types
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
  created_by?: string;
  created_at: string;
  updated_at: string;
}

interface ApplicationStats {
  total: number;
  active: number;
  internal: number;
  external: number;
}

const initialStats: ApplicationStats = {
  total: 0,
  active: 0,
  internal: 0,
  external: 0
};

export default function ApplicationsPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const { user } = useAuth();

  // State
  const {
    applications,
    stats,
    isLoading,
    isError,
    fetchApplications,
    deleteApplication
  } = useApplications();

  const [searchQuery, setSearchQuery] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  // Initial fetch
  useEffect(() => {
    if (user) {
      fetchApplications();
    }
  }, [user, fetchApplications]);

  // Handle delete
  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('applications')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Application deleted successfully');
      await fetchApplications(); // Refresh list
    } catch (error) {
      console.error('Error deleting application:', error);
      toast.error('Failed to delete application');
    }
  };

  // Handle export with loading state
  const handleExport = async () => {
    try {
      setIsExporting(true);

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
        'Support Contact': `${app.support_contact?.name || ''} (${
          app.support_contact?.email || ''
        })`,
        'Supported Platforms': app.supported_platforms,
        'Application Type': app.application_type,
        'Data Sensitivity Level': app.data_sensitivity_level,
        'Created At': new Date(app.created_at).toLocaleDateString(),
        'Updated At': new Date(app.updated_at).toLocaleDateString()
      }));

      // Create and save Excel file
      const ws = utils.json_to_sheet(exportData);
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, 'Applications');

      // Generate filename with date
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `applications_export_${dateStr}.xlsx`;

      writeFile(wb, filename);
      toast.success('Export completed successfully');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export applications');
    } finally {
      setIsExporting(false);
    }
  };

  // Filter applications based on search
  const filteredApplications = applications.filter(
    (app) =>
      app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (Array.isArray(app.tags) &&
        app.tags.some((tag) =>
          tag.toLowerCase().includes(searchQuery.toLowerCase())
        ))
  );

  // Loading state
  if (isLoading) {
    return (
      <ContentLayout title='Applications'>
        <div className='flex items-center justify-center min-h-screen'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  // Error state
  if (isError) {
    return (
      <ContentLayout title='Applications'>
        <div className='flex flex-col items-center justify-center min-h-screen gap-4'>
          <h2 className='text-lg font-semibold'>Failed to load applications</h2>
          <Button onClick={fetchApplications}>Try Again</Button>
        </div>
      </ContentLayout>
    );
  }

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
        {/* Header Section */}
        <div className='flex flex-col sm:flex-row justify-between sm:items-center gap-4'>
          <div>
            <h1 className='text-xl sm:text-2xl font-bold tracking-tight'>
              Applications
            </h1>
            <p className='text-sm text-muted-foreground'>
              Manage and monitor applications
            </p>
          </div>
          <div className='flex flex-col sm:flex-row gap-2'>
            <Button
              variant='outline'
              onClick={handleExport}
              disabled={isExporting}
            >
              <Download className='mr-2 h-4 w-4' />
              {isExporting ? 'Exporting...' : 'Export'}
            </Button>
            <Link href='/applications/new'>
              <Button>
                <PlusCircle className='mr-2 h-4 w-4' />
                Add Application
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats Cards */}
        <div className='grid grid-cols-2 lg:grid-cols-4 gap-4'>
          <StatsCard title='Total Applications' value={stats.total} />
          <StatsCard
            title='Active Applications'
            value={stats.active}
            subValue={`${((stats.active / stats.total) * 100).toFixed(1)}%`}
          />
          <StatsCard title='Internal Applications' value={stats.internal} />
          <StatsCard title='External Applications' value={stats.external} />
        </div>

        {/* Search */}
        <div className='relative'>
          <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground' />
          <Input
            placeholder='Search applications...'
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className='pl-10'
          />
        </div>

        {/* Applications Table */}
        <ApplicationsTable
          applications={filteredApplications}
          onDelete={handleDelete}
        />
      </div>
    </ContentLayout>
  );
}

// Separate components for better performance
const StatsCard = memo(function StatsCard({
  title,
  value,
  subValue
}: {
  title: string;
  value: number;
  subValue?: string;
}) {
  return (
    <Card>
      <CardHeader className='pb-2'>
        <CardTitle className='text-sm font-medium'>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className='text-2xl font-bold'>{value}</div>
        {subValue && (
          <p className='text-xs text-muted-foreground'>{subValue}</p>
        )}
      </CardContent>
    </Card>
  );
});

const ApplicationsTable = memo(function ApplicationsTable({
  applications,
  onDelete
}: {
  applications: Application[];
  onDelete: (id: string) => Promise<void>;
}) {
  const router = useRouter();

  return (
    <Card>
      <CardContent className='p-0'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className='hidden md:table-cell'>Platform</TableHead>
              <TableHead className='hidden md:table-cell'>
                Last Updated
              </TableHead>
              <TableHead className='w-[50px]'></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {applications.map((app) => (
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
                <TableCell>{app.integration_type}</TableCell>
                <TableCell>
                  <Badge variant={app.is_active ? 'default' : 'secondary'}>
                    {app.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell className='hidden md:table-cell'>
                  {app.supported_platforms}
                </TableCell>
                <TableCell className='hidden md:table-cell'>
                  {new Date(app.updated_at).toLocaleDateString()}
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
                      <DropdownMenuItem asChild>
                        <Link
                          href={`/applications/${app.id}`}
                          className='cursor-pointer flex items-center'
                        >
                          <Eye className='mr-2 h-4 w-4' />
                          View Details
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link
                          href={`/applications/${app.id}/edit`}
                          className='cursor-pointer flex items-center'
                        >
                          <Pencil className='mr-2 h-4 w-4' />
                          Edit
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => onDelete(app.id)}
                        className='text-destructive focus:text-destructive flex items-center'
                      >
                        <Trash2 className='mr-2 h-4 w-4' />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
});
