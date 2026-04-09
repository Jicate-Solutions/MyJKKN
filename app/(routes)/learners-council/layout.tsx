/**
 * Learners Council Module Layout
 * Provides consistent navigation across all LC module pages
 */

import { Suspense } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { getEnhancedUserProfile, createClient } from '@/lib/supabase/server';
import { getLCRole, canSeeSelectionTab } from '@/lib/learners-council/lc-roles';
import { LCNav } from './lc-nav';

interface LCLayoutProps {
  children: React.ReactNode;
}

export default async function LearnersCouncilLayout({ children }: LCLayoutProps) {
  const { profile } = await getEnhancedUserProfile();
  const supabase = await createClient();

  // Fetch LC membership with position details + yuva_role for role resolution
  let lcMembershipInfo: { position_category?: string | null; tier?: string | null; yuva_role?: string | null } | null = null;
  if (profile?.id) {
    const { data: lcMembership } = await supabase
      .from('lc_members')
      .select('id, yuva_role, position:lc_positions(category, tier)')
      .eq('user_id', profile.id)
      .eq('status', 'active')
      .maybeSingle();
    if (lcMembership) {
      const pos = lcMembership.position as any;
      lcMembershipInfo = {
        position_category: pos?.category,
        tier: pos?.tier,
        yuva_role: (lcMembership as any).yuva_role || null,
      };
    }
  }

  const lcRole = getLCRole(profile?.role || null, lcMembershipInfo);
  const showSelectionTab = canSeeSelectionTab(lcRole);

  return (
    <ContentLayout title="Learners Council">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learners Council', href: '/learners-council' }
        ]}
      />

      <div className="space-y-6 mt-4">
        <LCNav showSelectionTab={showSelectionTab} />

        <Suspense fallback={<div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
          {children}
        </Suspense>
      </div>
    </ContentLayout>
  );
}
