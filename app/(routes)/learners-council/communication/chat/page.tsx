/**
 * Learners Council Communication Hub - Chat Page (Phase 1)
 * LC/YUVA channels, message view with polling (real-time can be added later)
 */

import { createClient } from '@/lib/supabase/server';
import { ChatClient } from './chat-client';

export default async function ChatPage() {
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
