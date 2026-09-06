/**
 * Learners Council Communication Hub - Announcements Page
 * Lists published announcements with urgency badges, create form for LC members
 */

import { createClient } from '@/lib/supabase/server';
import { AnnouncementsClient } from './announcements-client';
import { getLCAccess, canDraftAnnouncements, canPublishAnnouncements } from '@/lib/learners-council/lc-roles';

export default async function AnnouncementsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return <div className="flex items-center justify-center py-20"><p className="text-muted-foreground">Please sign in to access this page.</p></div>;
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, institution_id, is_super_admin, full_name, avatar_url, email')
    .eq('id', user.id)
    .single();
  if (!profile) {
    return <div className="flex items-center justify-center py-20"><p className="text-muted-foreground">Please sign in to access this page.</p></div>;
  }

  // Check if user is an LC member and their position category
  const { data: lcMembership } = await supabase
    .from('lc_members')
    .select('id, position_id, position:lc_positions(id, category, tier)')
    .eq('user_id', profile.id)
    .eq('status', 'active')
    .maybeSingle();

  const membershipInfo = lcMembership
    ? { position_category: (lcMembership.position as any)?.category, tier: (lcMembership.position as any)?.tier }
    : null;
  const access = getLCAccess(profile, membershipInfo);
  const canDraft = canDraftAnnouncements(access);
  const canPublish = canPublishAnnouncements(access);

  // The Council is one body across every JKKN institution, so members see all of its
  // announcements. (The previous "My Institution" scope filtered on
  // lc_announcements.institution_id -- a column that does not exist on this table -- so
  // it errored and returned nothing on every default page load. The audience of an
  // announcement is carried on scope/scope_id, and is used for notification targeting.)
  const { data: announcements, error: announcementsError } = await supabase
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

  if (announcementsError) {
    console.error('[lc/communication] Error fetching announcements:', announcementsError);
  }

  return (
    <div className="space-y-4">
      <AnnouncementsClient
        initialAnnouncements={announcements || []}
        userId={profile.id}
        canDraft={canDraft}
        canPublish={canPublish}
      />
    </div>
  );
}
