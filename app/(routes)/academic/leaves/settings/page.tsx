'use client';

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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Palette, GitBranch } from 'lucide-react';

export default function LeaveSettingsPage() {
  return (
    <PermissionGuard module='academic.leaves' action='manage'>
      <ContentLayout title='Leave Settings'>
        <div className='space-y-6'>
          {/* Breadcrumb */}
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href='/'>Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href='/academic'>Academic</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href='/academic/leaves'>Leaves</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Settings</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Settings Cards */}
          <div className='grid gap-6 md:grid-cols-2'>
            {/* Leave Types */}
            <Link href='/academic/leaves/settings/types'>
              <Card className='hover:border-primary/50 transition-colors cursor-pointer h-full'>
                <CardHeader>
                  <div className='flex items-center gap-3'>
                    <div className='p-2 bg-primary/10 rounded-lg'>
                      <Palette className='h-6 w-6 text-primary' />
                    </div>
                    <div>
                      <CardTitle>Leave Types</CardTitle>
                      <CardDescription>
                        Manage leave categories and their color codes
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className='text-sm text-muted-foreground'>
                    Configure leave types such as Gazetted Holidays, Study Leave,
                    Emergency Closure, etc. Set color codes for calendar display.
                  </p>
                </CardContent>
              </Card>
            </Link>

            {/* Approval Workflows */}
            <Link href='/academic/leaves/settings/workflows'>
              <Card className='hover:border-primary/50 transition-colors cursor-pointer h-full'>
                <CardHeader>
                  <div className='flex items-center gap-3'>
                    <div className='p-2 bg-primary/10 rounded-lg'>
                      <GitBranch className='h-6 w-6 text-primary' />
                    </div>
                    <div>
                      <CardTitle>Approval Workflows</CardTitle>
                      <CardDescription>
                        Configure approval chains for leave requests
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className='text-sm text-muted-foreground'>
                    Set up approval workflows based on leave type and scope level.
                    Define who can approve department, semester, or institution-wide leaves.
                  </p>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
