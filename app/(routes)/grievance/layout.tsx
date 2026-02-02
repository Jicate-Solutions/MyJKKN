/**
 * Grievance Module Layout - Tab Navigation
 * F004: Grievance Ticketing System
 *
 * Provides consistent navigation across grievance module pages
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LayoutDashboard, Ticket, TrendingUp } from 'lucide-react';
import { getEnhancedUserProfile } from '@/lib/supabase/server';

interface GrievanceLayoutProps {
  children: React.ReactNode;
}

export default async function GrievanceLayout({ children }: GrievanceLayoutProps) {
  const { profile } = await getEnhancedUserProfile();

  // Check if user is staff
  const isStaff = ['admin', 'super_admin', 'staff', 'hod', 'principal'].includes(
    profile?.role || ''
  );

  return (
    <ContentLayout title="Grievance Management">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Grievance', href: '/grievance' }
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Tab Navigation */}
        <Tabs defaultValue="dashboard" className="w-full">
          <TabsList className="grid w-full grid-cols-3 max-w-[600px]">
            <TabsTrigger value="dashboard" asChild>
              <Link href="/grievance/dashboard" className="flex items-center gap-2">
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </Link>
            </TabsTrigger>
            <TabsTrigger value="tickets" asChild>
              <Link href="/grievance" className="flex items-center gap-2">
                <Ticket className="h-4 w-4" />
                Tickets
              </Link>
            </TabsTrigger>
            {isStaff && (
              <TabsTrigger value="sla" asChild>
                <Link href="/grievance/sla" className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  SLA
                </Link>
              </TabsTrigger>
            )}
          </TabsList>
        </Tabs>

        {/* Page Content */}
        <Suspense fallback={<div>Loading...</div>}>{children}</Suspense>
      </div>
    </ContentLayout>
  );
}
