'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BeatLoader } from 'react-spinners';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { Building2, Users, LibrarySquare, LayoutDashboard } from 'lucide-react';
import { ApplicationService } from '@/lib/services/application/application-service';
import { UserService } from '@/lib/services/users/user-service';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { OrganizationService } from '@/lib/services/organization/organization-service';

interface DashboardMetrics {
  totalInstitutions: number;
  activeInstitutions: number;
  totalUsers: number;
  activeUsers: number;
  totalApplications: number;
  activeApplications: number;
  applicationsByCategory: { name: string; count: number }[];
  usersByRole: { name: string; count: number }[];
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDashboardMetrics = async () => {
      try {
        setLoading(true);

        // Fetch institutions data
        const institutionsResult = await OrganizationService.getInstitutions();
        const institutions = institutionsResult.data;
        const activeInstitutions = institutions.filter((i) => i.is_active);

        // Fetch applications data
        const applicationsResult = await ApplicationService.getApplications();
        const applications = applicationsResult.data;
        const activeApplications = applications.filter((a) => a.is_active);

        // Fetch users data
        const usersResult = await UserService.getUsers();
        const users = usersResult.data;
        const activeUsers = users.filter((u) => true); // Assuming all users are active

        // Calculate application categories
        const categoryCounts = applications.reduce(
          (acc: { [key: string]: number }, app) => {
            const category = app.category?.name || 'Uncategorized';
            acc[category] = (acc[category] || 0) + 1;
            return acc;
          },
          {}
        );

        // Calculate user roles
        const roleCounts = users.reduce(
          (acc: { [key: string]: number }, user) => {
            acc[user.role] = (acc[user.role] || 0) + 1;
            return acc;
          },
          {}
        );

        setMetrics({
          totalInstitutions: institutions.length,
          activeInstitutions: activeInstitutions.length,
          totalUsers: users.length,
          activeUsers: activeUsers.length,
          totalApplications: applications.length,
          activeApplications: activeApplications.length,
          applicationsByCategory: Object.entries(categoryCounts).map(
            ([name, count]) => ({
              name,
              count
            })
          ),
          usersByRole: Object.entries(roleCounts).map(([name, count]) => ({
            name,
            count
          }))
        });
      } catch (err) {
        console.error('Error fetching dashboard metrics:', err);
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to load dashboard metrics'
        );
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardMetrics();
  }, []);

  if (error) {
    return (
      <ContentLayout title='Dashboard'>
        <div className='flex flex-col items-center justify-center min-h-[400px]'>
          <p className='text-destructive text-lg mb-4'>{error}</p>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Dashboard'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>Dashboard</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl py-1 font-bold'>Dashboard</h1>
          <p className='text-muted-foreground'>
            Overview of your system metrics and statistics
          </p>
        </div>

        {loading ? (
          <div className='flex justify-center items-center min-h-[400px]'>
            <BeatLoader color='#00e902' />
          </div>
        ) : metrics ? (
          <div className='space-y-6'>
            {/* Quick Stats */}
            <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
              <Card>
                <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                  <CardTitle className='text-sm font-medium'>
                    Total Institutions
                  </CardTitle>
                  <Building2 className='h-4 w-4 text-muted-foreground' />
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-bold'>
                    {metrics.totalInstitutions}
                  </div>
                  <p className='text-xs text-muted-foreground'>
                    {metrics.activeInstitutions} active
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                  <CardTitle className='text-sm font-medium'>
                    Total Users
                  </CardTitle>
                  <Users className='h-4 w-4 text-muted-foreground' />
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-bold'>{metrics.totalUsers}</div>
                  <p className='text-xs text-muted-foreground'>
                    {metrics.activeUsers} active
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                  <CardTitle className='text-sm font-medium'>
                    Total Applications
                  </CardTitle>
                  <LayoutDashboard className='h-4 w-4 text-muted-foreground' />
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-bold'>
                    {metrics.totalApplications}
                  </div>
                  <p className='text-xs text-muted-foreground'>
                    {metrics.activeApplications} active
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Charts */}
            <div className='grid gap-4 md:grid-cols-2'>
              <Card>
                <CardHeader>
                  <CardTitle>Applications by Category</CardTitle>
                  <CardDescription>
                    Distribution of applications across categories
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className='h-[300px]'>
                    <ResponsiveContainer width='100%' height='100%'>
                      <BarChart data={metrics.applicationsByCategory}>
                        <CartesianGrid strokeDasharray='3 3' />
                        <XAxis dataKey='name' />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey='count' fill='hsl(var(--primary))' />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Users by Role</CardTitle>
                  <CardDescription>
                    Distribution of users across different roles
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className='h-[300px]'>
                    <ResponsiveContainer width='100%' height='100%'>
                      <BarChart data={metrics.usersByRole}>
                        <CartesianGrid strokeDasharray='3 3' />
                        <XAxis dataKey='name' />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey='count' fill='hsl(var(--primary))' />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Common tasks and actions</CardDescription>
              </CardHeader>
              <CardContent className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
                <Button asChild className='w-full'>
                  <Link href='/organizations/institutions/new'>
                    Add Institution
                  </Link>
                </Button>
                <Button asChild className='w-full'>
                  <Link href='/applications/new'>Add Application</Link>
                </Button>
                <Button asChild className='w-full'>
                  <Link href='/users/new'>Add User</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </ContentLayout>
  );
}
