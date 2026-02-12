/**
 * Learners Council Module Layout
 * Provides consistent navigation across all LC module pages
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Crown,
  Network,
  Megaphone,
  CalendarCheck,
  ClipboardSignature,
  Vote,
  Kanban,
  Settings
} from 'lucide-react';
import { getEnhancedUserProfile, createClient } from '@/lib/supabase/server';

interface LCLayoutProps {
  children: React.ReactNode;
}

export default async function LearnersCouncilLayout({ children }: LCLayoutProps) {
  const { profile } = await getEnhancedUserProfile();

  const isStaffOrAdmin = ['admin', 'super_admin', 'staff', 'hod', 'principal'].includes(
    profile?.role || ''
  );

  // Check if user is an active LC member (for Selection tab visibility)
  let showSelectionTab = isStaffOrAdmin;
  if (!isStaffOrAdmin && profile?.id) {
    const supabase = await createClient();
    const { data: lcMembership } = await supabase
      .from('lc_members')
      .select('id')
      .eq('user_id', profile.id)
      .eq('status', 'active')
      .maybeSingle();
    showSelectionTab = !!lcMembership;
  }

  return (
    <ContentLayout title="Learners Council">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learners Council', href: '/learners-council' }
        ]}
      />

      <div className="space-y-6 mt-4">
        <Tabs defaultValue="dashboard" className="w-full">
          <TabsList className="flex flex-wrap gap-1 h-auto p-1 max-w-full">
            <TabsTrigger value="dashboard" asChild>
              <Link href="/learners-council" className="flex items-center gap-1.5 text-xs sm:text-sm">
                <Crown className="h-3.5 w-3.5" />
                Dashboard
              </Link>
            </TabsTrigger>
            <TabsTrigger value="structure" asChild>
              <Link href="/learners-council/structure" className="flex items-center gap-1.5 text-xs sm:text-sm">
                <Network className="h-3.5 w-3.5" />
                Structure
              </Link>
            </TabsTrigger>
            <TabsTrigger value="communication" asChild>
              <Link href="/learners-council/communication" className="flex items-center gap-1.5 text-xs sm:text-sm">
                <Megaphone className="h-3.5 w-3.5" />
                Communication
              </Link>
            </TabsTrigger>
            <TabsTrigger value="events" asChild>
              <Link href="/learners-council/events" className="flex items-center gap-1.5 text-xs sm:text-sm">
                <CalendarCheck className="h-3.5 w-3.5" />
                Events
              </Link>
            </TabsTrigger>
            <TabsTrigger value="od" asChild>
              <Link href="/learners-council/od" className="flex items-center gap-1.5 text-xs sm:text-sm">
                <ClipboardSignature className="h-3.5 w-3.5" />
                OD
              </Link>
            </TabsTrigger>
            {isStaffOrAdmin && (
              <TabsTrigger value="selection" asChild>
                <Link href="/learners-council/selection" className="flex items-center gap-1.5 text-xs sm:text-sm">
                  <Vote className="h-3.5 w-3.5" />
                  Selection
                </Link>
              </TabsTrigger>
            )}
            <TabsTrigger value="issues" asChild>
              <Link href="/learners-council/issues" className="flex items-center gap-1.5 text-xs sm:text-sm">
                <Kanban className="h-3.5 w-3.5" />
                Issues
              </Link>
            </TabsTrigger>
            <TabsTrigger value="settings" asChild>
              <Link href="/learners-council/settings" className="flex items-center gap-1.5 text-xs sm:text-sm">
                <Settings className="h-3.5 w-3.5" />
                Settings
              </Link>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Suspense fallback={<div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
          {children}
        </Suspense>
      </div>
    </ContentLayout>
  );
}
