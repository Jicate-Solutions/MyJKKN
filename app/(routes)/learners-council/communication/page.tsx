/**
 * Learners Council Communication Hub - Announcements Page
 * Lists published announcements with urgency badges, create form for LC members
 */

import { createClient } from '@/lib/supabase/server';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { AnnouncementsClient } from './announcements-client';

export default async function AnnouncementsPage() {
  const { profile } = await getEnhancedUserProfile();
  if (!profile) redirect('/');

  const supabase = await createClient();

  // Fetch initial announcements server-side
  const { data: announcements } = await supabase
    .from('lc_announcements')
    .select(
      `
      *,
      creator:profiles!lc_announcements_created_by_fkey(id, full_name, avatar_url),
      reviewer:profiles!lc_announcements_reviewed_by_fkey(id, full_name)
    `
    )
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(20);

  // Check if user is an LC member (for showing create button)
  const { data: lcMembership } = await supabase
    .from('lc_members')
    .select('id, position_id')
    .eq('user_id', profile.id)
    .eq('status', 'active')
    .maybeSingle();

  const isLCMember = !!lcMembership;
  const isStaffOrAdmin = ['admin', 'super_admin', 'staff', 'hod', 'principal'].includes(
    profile.role || ''
  );
  const canCreate = isLCMember || isStaffOrAdmin;

  return (
    <AnnouncementsClient
      initialAnnouncements={announcements || []}
      userId={profile.id}
      canCreate={canCreate}
    />
  );
}
