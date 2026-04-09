/**
 * Learners Council Communication Hub - Chat Page (Phase 1)
 * LC/YUVA channels, message view with polling (real-time can be added later)
 */

import { createClient } from '@/lib/supabase/server';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ChatClient } from './chat-client';

export default async function ChatPage() {
  const { profile } = await getEnhancedUserProfile();
  if (!profile) redirect('/');

  const supabase = await createClient();

  // Fetch user's chat channel memberships
  const { data: memberships } = await supabase
    .from('lc_chat_members')
    .select('channel_id')
    .eq('user_id', profile.id);

  const channelIds = (memberships || []).map((m: { channel_id: string }) => m.channel_id);

  // Fetch channels with members
  let initialChannels: any[] = [];
  if (channelIds.length > 0) {
    const { data: channels } = await supabase
      .from('lc_chat_channels')
      .select(
        `
        *,
        members:lc_chat_members(id, channel_id, user_id, role, last_read_at, user:profiles(id, full_name, avatar_url))
      `
      )
      .in('id', channelIds)
      .eq('is_active', true)
      .order('updated_at', { ascending: false });

    initialChannels = channels || [];
  }

  // Check if user is LC member for channel creation
  const { data: lcMembership } = await supabase
    .from('lc_members')
    .select('id')
    .eq('user_id', profile.id)
    .eq('status', 'active')
    .maybeSingle();

  const isLCMember = !!lcMembership;
  const isStaffOrAdmin = ['admin', 'super_admin', 'staff', 'hod', 'principal'].includes(
    profile.role || ''
  );
  const canCreateChannel = isLCMember || isStaffOrAdmin;

  return (
    <ChatClient
      initialChannels={initialChannels}
      userId={profile.id}
      userName={profile.full_name || 'Learner'}
      canCreateChannel={canCreateChannel}
    />
  );
}
