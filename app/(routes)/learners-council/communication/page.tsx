/**
 * Learners Council Communication Hub - Announcements Page
 * Lists published announcements with urgency badges, create form for LC members
 */

import { createClient } from '@/lib/supabase/server';
import { AnnouncementsClient } from './announcements-client';
import { getLCRole, canCreateAnnouncements } from '@/lib/learners-council/lc-roles';
import Link from 'next/link';

export default async function AnnouncementsPage({
  searchParams
}: {
  searchParams?: Promise<{ scope?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return <div className="flex items-center justify-center py-20"><p className="text-muted-foreground">Please sign in to access this page.</p></div>;
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, institution_id, full_name, avatar_url, email')
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
  const lcRole = getLCRole(profile.role || null, membershipInfo);
  const canCreate = canCreateAnnouncements(lcRole);
  const isMD = lcRole === 'md';

  // Resolve scope
  const params = searchParams ? await searchParams : {};
  const scopeParam = params.scope;
  const scopeAll = isMD ? (scopeParam !== 'institution') : (scopeParam === 'lc_wide');

  // Fetch initial announcements server-side (institution-scoped by default)
  let query = supabase
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

  if (!scopeAll) {
    if (profile.institution_id) {
      query = query.eq('institution_id', profile.institution_id);
    } else {
      // If no institution_id, only show LC-wide announcements to prevent data leak
      query = query.eq('scope', 'lc_wide');
    }
  }

  const { data: announcements } = await query;

  return (
    <div className="space-y-4">
      {/* Scope Toggle */}
      <div className="flex justify-end">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Viewing:</span>
          <div className="flex rounded-md border overflow-hidden">
            <Link
              href="/learners-council/communication?scope=institution"
              className={`px-3 py-1.5 text-sm ${!scopeAll ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-accent'}`}
            >
              My Institution
            </Link>
            <Link
              href="/learners-council/communication?scope=lc_wide"
              className={`px-3 py-1.5 text-sm border-l ${scopeAll ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-accent'}`}
            >
              LC-Wide
            </Link>
          </div>
        </div>
      </div>

      <AnnouncementsClient
        initialAnnouncements={announcements || []}
        userId={profile.id}
        canCreate={canCreate}
      />
    </div>
  );
}
