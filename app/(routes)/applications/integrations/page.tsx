'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { Plus, Search, MoreVertical, Activity, PowerIcon } from 'lucide-react';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ContentLayout } from '@/components/layout/content-layout';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

// Types for API Integrations
interface APIIntegration {
  id: string;
  name: string;
  application_id: string;
  application_name: string;
  endpoint: string;
  auth_method: 'api_key' | 'oauth2' | 'bearer_token';
  status: 'active' | 'inactive' | 'error';
  last_sync: string;
  success_rate: number;
  created_at: string;
  updated_at: string;
  description: string;
}

// Form Schema
const integrationFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  application_id: z.string().min(1, 'Application is required'),
  endpoint: z.string().url('Must be a valid URL'),
  auth_method: z.enum(['api_key', 'oauth2', 'bearer_token']),
  api_key: z.string().optional(),
  oauth_client_id: z.string().optional(),
  oauth_client_secret: z.string().optional(),
  bearer_token: z.string().optional()
});

// Status Badge Colors
const statusColors = {
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-gray-100 text-gray-800',
  error: 'bg-red-100 text-red-800'
};

export default function APIIntegrationsPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [integrations, setIntegrations] = useState<APIIntegration[]>([
    {
      id: '1',
      name: 'Attendance API',
      application_id: '1',
      application_name: 'Online Attendance System',
      endpoint: 'https://api.attendance.myjkkn.edu',
      auth_method: 'bearer_token',
      status: 'active',
      last_sync: '2024-02-25T10:00:00Z',
      success_rate: 99.8,
      created_at: '2024-02-25T00:00:00Z',
      updated_at: '2024-02-25T10:00:00Z',
      description: 'Integration with attendance tracking system'
    }
    // Add more mock data as needed
  ]);

  const form = useForm<z.infer<typeof integrationFormSchema>>({
    resolver: zodResolver(integrationFormSchema),
    defaultValues: {
      name: '',
      description: '',
      application_id: '',
      endpoint: '',
      auth_method: 'api_key'
    }
  });

  // Filter integrations based on search
  const filteredIntegrations = integrations.filter(
    (integration) =>
      integration.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      integration.application_name
        .toLowerCase()
        .includes(searchQuery.toLowerCase())
  );

  const handleAddIntegration = async (
    values: z.infer<typeof integrationFormSchema>
  ) => {
    try {
      setIsLoading(true);

      // Here you would integrate with Supabase
      // const { data, error } = await supabase
      //   .from('api_integrations')
      //   .insert([values])
      //   .select()
      //   .single();

      // Mock new integration
      const newIntegration: APIIntegration = {
        id: (integrations.length + 1).toString(),
        name: values.name,
        application_id: values.application_id,
        application_name: 'Mock Application',
        endpoint: values.endpoint,
        auth_method: values.auth_method,
        status: 'active',
        last_sync: new Date().toISOString(),
        success_rate: 100,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        description: values.description
      };

      setIntegrations([...integrations, newIntegration]);
      setIsAddDialogOpen(false);
      form.reset();
      toast.success('API Integration added successfully');
    } catch (error) {
      console.error('Error adding integration:', error);
      toast.error('Failed to add integration');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    try {
      setIsLoading(true);
      const newStatus = currentStatus === 'active' ? 'inactive' : 'active';

      // Here you would integrate with Supabase
      // await supabase
      //   .from('api_integrations')
      //   .update({ status: newStatus })
      //   .eq('id', id);

      setIntegrations(
        integrations.map((integration) =>
          integration.id === id
            ? {
                ...integration,
                status: newStatus as 'active' | 'inactive' | 'error'
              }
            : integration
        )
      );

      toast.success(
        `Integration ${newStatus === 'active' ? 'activated' : 'deactivated'}`
      );
    } catch (error) {
      console.error('Error toggling integration status:', error);
      toast.error('Failed to update integration status');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ContentLayout title='API Integrations'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/'>Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/applications'>Applications</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>API Integrations</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='mt-6 space-y-4'>
        {/* Header Section */}
        <div className='flex justify-between items-center'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>
              API Integrations
            </h1>
            <p className='text-sm text-muted-foreground'>
              Manage API integrations for your applications
            </p>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className='mr-2 h-4 w-4' />
                Add Integration
              </Button>
            </DialogTrigger>
            <DialogContent className='max-w-xl'>
              <DialogHeader>
                <DialogTitle>Add New API Integration</DialogTitle>
                <DialogDescription>
                  Connect your application with an external API service.
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(handleAddIntegration)}
                  className='space-y-4'
                >
                  <FormField
                    control={form.control}
                    name='name'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Integration Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder='Enter integration name'
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name='description'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder='Describe the purpose of this integration'
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name='application_id'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Application</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder='Select application' />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value='1'>
                              Online Attendance System
                            </SelectItem>
                            <SelectItem value='2'>
                              Library Management
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name='endpoint'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>API Endpoint</FormLabel>
                        <FormControl>
                          <Input
                            placeholder='https://api.example.com'
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name='auth_method'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Authentication Method</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder='Select auth method' />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value='api_key'>API Key</SelectItem>
                            <SelectItem value='oauth2'>OAuth 2.0</SelectItem>
                            <SelectItem value='bearer_token'>
                              Bearer Token
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Conditional form fields based on auth method */}
                  {form.watch('auth_method') === 'api_key' && (
                    <FormField
                      control={form.control}
                      name='api_key'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>API Key</FormLabel>
                          <FormControl>
                            <Input type='password' {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {form.watch('auth_method') === 'oauth2' && (
                    <>
                      <FormField
                        control={form.control}
                        name='oauth_client_id'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Client ID</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name='oauth_client_secret'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Client Secret</FormLabel>
                            <FormControl>
                              <Input type='password' {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </>
                  )}

                  {form.watch('auth_method') === 'bearer_token' && (
                    <FormField
                      control={form.control}
                      name='bearer_token'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Bearer Token</FormLabel>
                          <FormControl>
                            <Input type='password' {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <DialogFooter>
                    <Button type='submit' disabled={isLoading}>
                      {isLoading ? 'Adding...' : 'Add Integration'}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Statistics Cards */}
        <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Total Integrations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{integrations.length}</div>
              <p className='text-xs text-muted-foreground'>
                Active and inactive
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Active Integrations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>
                {integrations.filter((i) => i.status === 'active').length}
              </div>
              <p className='text-xs text-muted-foreground'>Currently running</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Average Success Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>
                {Math.round(
                  integrations.reduce((sum, i) => sum + i.success_rate, 0) /
                    integrations.length
                )}
                %
              </div>
              <p className='text-xs text-muted-foreground'>Last 24 hours</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Failed Integrations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-red-600'>
                {integrations.filter((i) => i.status === 'error').length}
              </div>
              <p className='text-xs text-muted-foreground'>Require attention</p>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className='flex items-center space-x-4'>
          <div className='relative flex-1'>
            <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground' />
            <Input
              placeholder='Search integrations...'
              className='pl-10 w-full'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Integrations Table */}
        <Card>
          <CardContent className='p-0'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Integration</TableHead>
                  <TableHead>Application</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Auth Method</TableHead>
                  <TableHead>Success Rate</TableHead>
                  <TableHead>Last Sync</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredIntegrations.map((integration) => (
                  <TableRow key={integration.id}>
                    <TableCell>
                      <div>
                        <p className='font-medium'>{integration.name}</p>
                        <p className='text-sm text-muted-foreground'>
                          {integration.endpoint}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>{integration.application_name}</TableCell>
                    <TableCell>
                      <Badge
                        variant='secondary'
                        className={statusColors[integration.status]}
                      >
                        {integration.status.charAt(0).toUpperCase() +
                          integration.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant='outline'>
                        {integration.auth_method === 'api_key'
                          ? 'API Key'
                          : integration.auth_method === 'oauth2'
                          ? 'OAuth 2.0'
                          : 'Bearer Token'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className='flex items-center'>
                        <Activity className='w-4 h-4 mr-2 text-muted-foreground' />
                        <span
                          className={
                            integration.success_rate > 95
                              ? 'text-green-600'
                              : integration.success_rate > 90
                              ? 'text-yellow-600'
                              : 'text-red-600'
                          }
                        >
                          {integration.success_rate.toFixed(1)}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {new Date(integration.last_sync).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div className='flex items-center gap-2'>
                        <Button
                          variant='ghost'
                          size='icon'
                          onClick={() =>
                            handleToggleStatus(
                              integration.id,
                              integration.status
                            )
                          }
                          className={
                            integration.status === 'active'
                              ? 'text-green-600'
                              : 'text-gray-600'
                          }
                        >
                          <PowerIcon className='h-4 w-4' />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant='ghost' size='icon'>
                              <MoreVertical className='h-4 w-4' />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align='end'>
                            <DropdownMenuItem>View Details</DropdownMenuItem>
                            <DropdownMenuItem>
                              Edit Configuration
                            </DropdownMenuItem>
                            <DropdownMenuItem>View Logs</DropdownMenuItem>
                            <DropdownMenuItem>Test Connection</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className='text-red-600'>
                              Delete Integration
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
