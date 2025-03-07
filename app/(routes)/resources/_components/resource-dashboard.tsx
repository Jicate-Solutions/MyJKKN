'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  Building2,
  Calendar,
  ClipboardList,
  FileBarChart,
  FolderTree,
  PlusCircle,
  Settings
} from 'lucide-react';

export function ResourceDashboard() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className='space-y-6'>
      <Tabs
        defaultValue='overview'
        value={activeTab}
        onValueChange={setActiveTab}
      >
        <div className='flex justify-between items-center'>
          <TabsList className='grid grid-cols-7 w-[800px]'>
            <TabsTrigger value='overview'>Overview</TabsTrigger>
            <TabsTrigger value='resources'>Resources</TabsTrigger>
            <TabsTrigger value='categories'>Categories</TabsTrigger>
            <TabsTrigger value='reservations'>Reservations</TabsTrigger>
            <TabsTrigger value='policies'>Policies</TabsTrigger>
            <TabsTrigger value='reports'>Reports</TabsTrigger>
            <TabsTrigger value='requests'>Requests</TabsTrigger>
          </TabsList>

          {activeTab === 'resources' && (
            <Link href='/resources/new'>
              <Button>
                <PlusCircle className='mr-2 h-4 w-4' />
                Add Resource
              </Button>
            </Link>
          )}

          {activeTab === 'categories' && (
            <Link href='/resources/categories/new'>
              <Button>
                <PlusCircle className='mr-2 h-4 w-4' />
                Add Category
              </Button>
            </Link>
          )}

          {activeTab === 'reservations' && (
            <Link href='/resources/reservations/new'>
              <Button>
                <PlusCircle className='mr-2 h-4 w-4' />
                New Reservation
              </Button>
            </Link>
          )}

          {activeTab === 'policies' && (
            <Link href='/resources/policies/new'>
              <Button>
                <PlusCircle className='mr-2 h-4 w-4' />
                Add Policy
              </Button>
            </Link>
          )}

          {activeTab === 'reports' && (
            <Link href='/resources/reports/new'>
              <Button>
                <PlusCircle className='mr-2 h-4 w-4' />
                Generate Report
              </Button>
            </Link>
          )}

          {activeTab === 'requests' && (
            <Link href='/resources/requests/new'>
              <Button>
                <PlusCircle className='mr-2 h-4 w-4' />
                New Request
              </Button>
            </Link>
          )}
        </div>

        <TabsContent value='overview' className='mt-6'>
          <div className='grid grid-cols-3 gap-6'>
            <Link href='/resources/resources' className='block'>
              <Card className='hover:bg-muted/50 transition-colors'>
                <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                  <CardTitle className='text-lg font-medium'>
                    Resources
                  </CardTitle>
                  <Building2 className='h-5 w-5 text-muted-foreground' />
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Manage equipment, facilities, vehicles, and other resources
                  </CardDescription>
                </CardContent>
              </Card>
            </Link>

            <Link href='/resources/categories' className='block'>
              <Card className='hover:bg-muted/50 transition-colors'>
                <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                  <CardTitle className='text-lg font-medium'>
                    Categories
                  </CardTitle>
                  <FolderTree className='h-5 w-5 text-muted-foreground' />
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Organize resources with hierarchical categories
                  </CardDescription>
                </CardContent>
              </Card>
            </Link>

            <Link href='/resources/reservations' className='block'>
              <Card className='hover:bg-muted/50 transition-colors'>
                <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                  <CardTitle className='text-lg font-medium'>
                    Reservations
                  </CardTitle>
                  <Calendar className='h-5 w-5 text-muted-foreground' />
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Schedule and manage resource bookings
                  </CardDescription>
                </CardContent>
              </Card>
            </Link>

            <Link href='/resources/policies' className='block'>
              <Card className='hover:bg-muted/50 transition-colors'>
                <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                  <CardTitle className='text-lg font-medium'>
                    Sharing Policies
                  </CardTitle>
                  <Settings className='h-5 w-5 text-muted-foreground' />
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Define rules for resource sharing and reservations
                  </CardDescription>
                </CardContent>
              </Card>
            </Link>

            <Link href='/resources/reports' className='block'>
              <Card className='hover:bg-muted/50 transition-colors'>
                <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                  <CardTitle className='text-lg font-medium'>
                    Usage Reports
                  </CardTitle>
                  <FileBarChart className='h-5 w-5 text-muted-foreground' />
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Analyze resource utilization and generate reports
                  </CardDescription>
                </CardContent>
              </Card>
            </Link>

            <Link href='/resources/requests' className='block'>
              <Card className='hover:bg-muted/50 transition-colors'>
                <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                  <CardTitle className='text-lg font-medium'>
                    Resource Requests
                  </CardTitle>
                  <ClipboardList className='h-5 w-5 text-muted-foreground' />
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Request new resources for your department or institution
                  </CardDescription>
                </CardContent>
              </Card>
            </Link>
          </div>
        </TabsContent>

        <TabsContent value='resources' className='mt-6'>
          <div className='text-center py-10'>
            <p className='text-muted-foreground'>
              Navigate to the Resources section to view and manage all resources
            </p>
            <Link href='/resources/resources'>
              <Button className='mt-4'>Go to Resources</Button>
            </Link>
          </div>
        </TabsContent>

        <TabsContent value='categories' className='mt-6'>
          <div className='text-center py-10'>
            <p className='text-muted-foreground'>
              Navigate to the Categories section to organize your resources
            </p>
            <Link href='/resources/categories'>
              <Button className='mt-4'>Go to Categories</Button>
            </Link>
          </div>
        </TabsContent>

        <TabsContent value='reservations' className='mt-6'>
          <div className='text-center py-10'>
            <p className='text-muted-foreground'>
              Navigate to the Reservations section to manage resource bookings
            </p>
            <Link href='/resources/reservations'>
              <Button className='mt-4'>Go to Reservations</Button>
            </Link>
          </div>
        </TabsContent>

        <TabsContent value='policies' className='mt-6'>
          <div className='text-center py-10'>
            <p className='text-muted-foreground'>
              Navigate to the Sharing Policies section to define resource
              sharing rules
            </p>
            <Link href='/resources/policies'>
              <Button className='mt-4'>Go to Policies</Button>
            </Link>
          </div>
        </TabsContent>

        <TabsContent value='reports' className='mt-6'>
          <div className='text-center py-10'>
            <p className='text-muted-foreground'>
              Navigate to the Usage Reports section to analyze resource
              utilization
            </p>
            <Link href='/resources/reports'>
              <Button className='mt-4'>Go to Reports</Button>
            </Link>
          </div>
        </TabsContent>

        <TabsContent value='requests' className='mt-6'>
          <div className='text-center py-10'>
            <p className='text-muted-foreground'>
              Navigate to the Resource Requests section to manage new resource
              requests
            </p>
            <Link href='/resources/requests'>
              <Button className='mt-4'>Go to Requests</Button>
            </Link>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
