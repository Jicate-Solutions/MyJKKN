'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { PermissionGuard } from '@/components/auth/permission-guard';
import { usePermissions } from '@/hooks/use-permissions';
import { useTemplates } from '@/hooks/use-templates';
import {
  ArrowLeft,
  TrendingUp,
  Users,
  Calendar,
  Star,
  Activity,
  BarChart3,
  PieChart,
  Clock
} from 'lucide-react';

export default function TemplateAnalyticsPage() {
  const router = useRouter();
  const { isSuperAdmin } = usePermissions();

  // Fetch all templates for analytics
  const { data: templatesData, isLoading } = useTemplates({
    limit: 1000 // Get all templates for analytics
  });

  const templates = templatesData?.data || [];

  // Calculate analytics
  const totalTemplates = templates.length;
  const activeTemplates = templates.filter((t) => t.is_active).length;
  const inactiveTemplates = totalTemplates - activeTemplates;
  const totalUsage = templates.reduce(
    (sum, t) => sum + (t.usage_count || 0),
    0
  );
  const avgUsage =
    totalTemplates > 0 ? (totalUsage / totalTemplates).toFixed(1) : '0';

  // Template usage distribution
  const highUsage = templates.filter((t) => (t.usage_count || 0) >= 10).length;
  const mediumUsage = templates.filter(
    (t) => (t.usage_count || 0) >= 5 && (t.usage_count || 0) < 10
  ).length;
  const lowUsage = templates.filter(
    (t) => (t.usage_count || 0) >= 1 && (t.usage_count || 0) < 5
  ).length;
  const unusedTemplates = templates.filter(
    (t) => (t.usage_count || 0) === 0
  ).length;

  // Institution-wise distribution
  const institutionStats = templates.reduce((acc, template) => {
    const institutionName = template.institution?.name || 'Unknown';
    if (!acc[institutionName]) {
      acc[institutionName] = { count: 0, usage: 0 };
    }
    acc[institutionName].count++;
    acc[institutionName].usage += template.usage_count || 0;
    return acc;
  }, {} as Record<string, { count: number; usage: number }>);

  // Most popular templates
  const popularTemplates = [...templates]
    .sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0))
    .slice(0, 5);

  return (
    <PermissionGuard module='academic.timetables' action='view'>
      <ContentLayout title='Template Analytics'>
        <div className='space-y-6'>
          {/* Breadcrumb */}
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href='/'>Dashboard</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href='/academic'>Academic</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href='/academic/timetables'>Timetables</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href='/academic/timetables/templates'>Templates</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Analytics</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Header */}
          <div className='flex items-center justify-between'>
            <div>
              <h1 className='text-2xl font-bold'>Template Analytics</h1>
              <p className='text-muted-foreground'>
                Comprehensive insights into template usage and performance
              </p>
            </div>
            <Button variant='outline' onClick={() => router.back()}>
              <ArrowLeft className='h-4 w-4 mr-2' />
              Back to Templates
            </Button>
          </div>

          {/* Overview Stats */}
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6'>
            <Card>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardTitle className='text-sm font-medium'>
                  Total Templates
                </CardTitle>
                <Star className='h-4 w-4 text-muted-foreground' />
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold'>{totalTemplates}</div>
                <p className='text-xs text-muted-foreground'>
                  All templates in the system
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardTitle className='text-sm font-medium'>
                  Active Templates
                </CardTitle>
                <Activity className='h-4 w-4 text-muted-foreground' />
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold'>{activeTemplates}</div>
                <p className='text-xs text-muted-foreground'>
                  Currently active templates
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardTitle className='text-sm font-medium'>
                  Total Usage
                </CardTitle>
                <TrendingUp className='h-4 w-4 text-muted-foreground' />
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold'>{totalUsage}</div>
                <p className='text-xs text-muted-foreground'>
                  Times templates have been used
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardTitle className='text-sm font-medium'>
                  Average Usage
                </CardTitle>
                <BarChart3 className='h-4 w-4 text-muted-foreground' />
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold'>{avgUsage}</div>
                <p className='text-xs text-muted-foreground'>
                  Average usage per template
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Usage Distribution */}
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <PieChart className='h-5 w-5' />
                  Usage Distribution
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='space-y-3'>
                  <div className='flex items-center justify-between p-3 bg-green-50 rounded-lg'>
                    <span className='font-medium text-green-800'>
                      High Usage (10+ times)
                    </span>
                    <span className='font-bold text-green-700'>
                      {highUsage}
                    </span>
                  </div>
                  <div className='flex items-center justify-between p-3 bg-blue-50 rounded-lg'>
                    <span className='font-medium text-blue-800'>
                      Medium Usage (5-9 times)
                    </span>
                    <span className='font-bold text-blue-700'>
                      {mediumUsage}
                    </span>
                  </div>
                  <div className='flex items-center justify-between p-3 bg-yellow-50 rounded-lg'>
                    <span className='font-medium text-yellow-800'>
                      Low Usage (1-4 times)
                    </span>
                    <span className='font-bold text-yellow-700'>
                      {lowUsage}
                    </span>
                  </div>
                  <div className='flex items-center justify-between p-3 bg-red-50 rounded-lg'>
                    <span className='font-medium text-red-800'>
                      Unused Templates
                    </span>
                    <span className='font-bold text-red-700'>
                      {unusedTemplates}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Users className='h-5 w-5' />
                  Institution Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className='space-y-3 max-h-64 overflow-y-auto'>
                  {Object.entries(institutionStats)
                    .sort((a, b) => b[1].count - a[1].count)
                    .map(([institution, stats]) => (
                      <div
                        key={institution}
                        className='flex items-center justify-between p-3 border rounded-lg'
                      >
                        <div>
                          <span className='font-medium'>{institution}</span>
                          <p className='text-sm text-muted-foreground'>
                            {stats.usage} total usage
                          </p>
                        </div>
                        <span className='font-bold'>
                          {stats.count} templates
                        </span>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Popular Templates */}
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <TrendingUp className='h-5 w-5' />
                Most Popular Templates
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='space-y-4'>
                {popularTemplates.map((template, index) => (
                  <div
                    key={template.id}
                    className='flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50'
                  >
                    <div className='flex items-center gap-4'>
                      <div className='flex items-center justify-center w-8 h-8 bg-blue-100 text-blue-700 rounded-full font-bold'>
                        {index + 1}
                      </div>
                      <div>
                        <h4 className='font-medium'>
                          {template.template_name || template.timetable_name}
                        </h4>
                        <p className='text-sm text-muted-foreground'>
                          {template.institution?.name} •{' '}
                          {template.program?.program_name}
                        </p>
                      </div>
                    </div>
                    <div className='text-right'>
                      <span className='text-lg font-bold'>
                        {template.usage_count || 0}
                      </span>
                      <p className='text-sm text-muted-foreground'>uses</p>
                    </div>
                  </div>
                ))}
                {popularTemplates.length === 0 && !isLoading && (
                  <div className='text-center py-8 text-muted-foreground'>
                    No template usage data available
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Status Overview */}
          <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Activity className='h-5 w-5' />
                  Template Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className='space-y-3'>
                  <div className='flex items-center justify-between'>
                    <span className='text-green-700'>Active Templates</span>
                    <div className='flex items-center gap-2'>
                      <div className='w-4 h-4 bg-green-500 rounded-full'></div>
                      <span className='font-bold'>{activeTemplates}</span>
                    </div>
                  </div>
                  <div className='flex items-center justify-between'>
                    <span className='text-gray-700'>Inactive Templates</span>
                    <div className='flex items-center gap-2'>
                      <div className='w-4 h-4 bg-gray-400 rounded-full'></div>
                      <span className='font-bold'>{inactiveTemplates}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Clock className='h-5 w-5' />
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-3'>
                <Button
                  variant='outline'
                  className='w-full justify-start'
                  onClick={() => router.push('/academic/timetables/templates')}
                >
                  View All Templates
                </Button>
                <Button
                  variant='outline'
                  className='w-full justify-start'
                  onClick={() => router.push('/academic/timetables/new')}
                >
                  Create New Template
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
