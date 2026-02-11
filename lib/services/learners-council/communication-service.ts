// lib/services/learners-council/communication-service.ts
// LC-002: Communication Hub - Service Layer
// Handles announcements, polls, forums, and chat

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  LCAnnouncement,
  LCAnnouncementRead,
  LCPoll,
  LCPollOption,
  LCPollVote,
  LCForumTopic,
  LCForumPost,
  LCForumReaction,
  LCChatChannel,
  LCChatMessage,
  CreateAnnouncementDto,
  UpdateAnnouncementDto,
  CreatePollDto,
  CreateForumTopicDto,
  CreateForumPostDto,
  CreateChatChannelDto,
  SendChatMessageDto,
  AnnouncementScope,
  AnnouncementStatus,
  PollScope,
  PollStatus,
  ForumReactionType,
  ModerationAction
} from '@/types/learners-council';

export class LCCommunicationService {
  private static supabase: any = createClientSupabaseClient();

  // ============================================================================
  // ANNOUNCEMENTS
  // ============================================================================

  /**
   * Get announcements with filters and pagination
   */
  static async getAnnouncements(filters: {
    scope?: AnnouncementScope;
    status?: AnnouncementStatus;
    page?: number;
    limit?: number;
  }): Promise<{ data: LCAnnouncement[]; total: number }> {
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = (this.supabase as any)
      .from('lc_announcements')
      .select(
        `
        *,
        creator:profiles!lc_announcements_created_by_fkey(id, full_name, avatar_url),
        reviewer:profiles!lc_announcements_reviewed_by_fkey(id, full_name)
      `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(from, to);

    if (filters.scope) {
      query = query.eq('scope', filters.scope);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    const { data, count, error } = await query;

    if (error) {
      console.error('[lc/communication] Error fetching announcements:', error);
      throw new Error(`Failed to fetch announcements: ${error.message}`);
    }

    return { data: (data || []) as LCAnnouncement[], total: count || 0 };
  }

  /**
   * Get a single announcement by ID and optionally track read
   */
  static async getAnnouncementById(id: string): Promise<LCAnnouncement> {
    const { data, error } = await (this.supabase as any)
      .from('lc_announcements')
      .select(
        `
        *,
        creator:profiles!lc_announcements_created_by_fkey(id, full_name, avatar_url),
        reviewer:profiles!lc_announcements_reviewed_by_fkey(id, full_name)
      `
      )
      .eq('id', id)
      .single();

    if (error) {
      console.error('[lc/communication] Error fetching announcement:', error);
      throw new Error('Failed to fetch announcement');
    }

    return data as LCAnnouncement;
  }

  /**
   * Create a new announcement as draft
   */
  static async createAnnouncement(
    data: CreateAnnouncementDto,
    userId: string
  ): Promise<LCAnnouncement> {
    const { data: created, error } = await (this.supabase as any)
      .from('lc_announcements')
      .insert({
        title: data.title,
        content: data.content,
        type: data.type,
        urgency: data.urgency,
        scope: data.scope,
        scope_id: data.scope_id || null,
        attachments: data.attachments || null,
        status: 'draft' as AnnouncementStatus,
        created_by: userId,
        read_count: 0
      })
      .select()
      .single();

    if (error) {
      console.error('[lc/communication] Error creating announcement:', error);
      throw new Error(`Failed to create announcement: ${error.message}`);
    }

    return created as LCAnnouncement;
  }

  /**
   * Update an announcement
   */
  static async updateAnnouncement(
    id: string,
    data: UpdateAnnouncementDto
  ): Promise<LCAnnouncement> {
    const updatePayload: Record<string, unknown> = {};
    if (data.title !== undefined) updatePayload.title = data.title;
    if (data.content !== undefined) updatePayload.content = data.content;
    if (data.type !== undefined) updatePayload.type = data.type;
    if (data.urgency !== undefined) updatePayload.urgency = data.urgency;
    if (data.scope !== undefined) updatePayload.scope = data.scope;
    if (data.scope_id !== undefined) updatePayload.scope_id = data.scope_id;
    if (data.attachments !== undefined) updatePayload.attachments = data.attachments;
    if (data.status !== undefined) updatePayload.status = data.status;

    const { data: updated, error } = await (this.supabase as any)
      .from('lc_announcements')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[lc/communication] Error updating announcement:', error);
      throw new Error(`Failed to update announcement: ${error.message}`);
    }

    return updated as LCAnnouncement;
  }

  /**
   * Publish an announcement (set status to published)
   */
  static async publishAnnouncement(
    id: string,
    reviewerId: string
  ): Promise<LCAnnouncement> {
    const { data, error } = await (this.supabase as any)
      .from('lc_announcements')
      .update({
        status: 'published' as AnnouncementStatus,
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
        published_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[lc/communication] Error publishing announcement:', error);
      throw new Error(`Failed to publish announcement: ${error.message}`);
    }

    return data as LCAnnouncement;
  }

  /**
   * Mark an announcement as read by a user
   */
  static async markAnnouncementRead(
    announcementId: string,
    userId: string
  ): Promise<void> {
    // Upsert to avoid duplicates
    const { error } = await (this.supabase as any)
      .from('lc_announcement_reads')
      .upsert(
        {
          announcement_id: announcementId,
          user_id: userId,
          read_at: new Date().toISOString()
        },
        { onConflict: 'announcement_id,user_id' }
      );

    if (error) {
      console.error('[lc/communication] Error marking announcement read:', error);
      // Non-critical, don't throw
    }

    // Increment read count on the announcement
    const { error: rpcError } = await (this.supabase as any).rpc('increment_field', {
      table_name: 'lc_announcements',
      field_name: 'read_count',
      row_id: announcementId
    });

    // If RPC doesn't exist, try direct update
    if (rpcError) {
      await (this.supabase as any)
        .from('lc_announcements')
        .update({ read_count: this.supabase.rpc ? undefined : 0 })
        .eq('id', announcementId);
    }
  }

  // ============================================================================
  // POLLS
  // ============================================================================

  /**
   * Get polls with filters
   */
  static async getPolls(filters: {
    scope?: PollScope;
    status?: PollStatus;
    page?: number;
    limit?: number;
  }): Promise<{ data: LCPoll[]; total: number }> {
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = (this.supabase as any)
      .from('lc_polls')
      .select(
        `
        *,
        options:lc_poll_options(id, poll_id, label, sort_order, vote_count),
        creator:profiles!lc_polls_created_by_fkey(id, full_name)
      `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(from, to);

    if (filters.scope) {
      query = query.eq('scope', filters.scope);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    const { data, count, error } = await query;

    if (error) {
      console.error('[lc/communication] Error fetching polls:', error);
      throw new Error(`Failed to fetch polls: ${error.message}`);
    }

    return { data: (data || []) as LCPoll[], total: count || 0 };
  }

  /**
   * Get a single poll by ID with options and vote counts
   */
  static async getPollById(id: string): Promise<LCPoll> {
    const { data, error } = await (this.supabase as any)
      .from('lc_polls')
      .select(
        `
        *,
        options:lc_poll_options(id, poll_id, label, sort_order, vote_count),
        creator:profiles!lc_polls_created_by_fkey(id, full_name)
      `
      )
      .eq('id', id)
      .single();

    if (error) {
      console.error('[lc/communication] Error fetching poll:', error);
      throw new Error('Failed to fetch poll');
    }

    return data as LCPoll;
  }

  /**
   * Create a poll with its options
   */
  static async createPoll(
    data: CreatePollDto,
    userId: string
  ): Promise<LCPoll> {
    // Create the poll first
    const { data: poll, error: pollError } = await (this.supabase as any)
      .from('lc_polls')
      .insert({
        title: data.title,
        description: data.description || null,
        type: data.type,
        status: 'draft' as PollStatus,
        scope: data.scope,
        scope_id: data.scope_id || null,
        is_anonymous: data.is_anonymous ?? false,
        allows_multiple: data.allows_multiple ?? false,
        max_selections: data.max_selections || null,
        starts_at: data.starts_at,
        ends_at: data.ends_at,
        created_by: userId,
        total_votes: 0
      })
      .select()
      .single();

    if (pollError) {
      console.error('[lc/communication] Error creating poll:', pollError);
      throw new Error(`Failed to create poll: ${pollError.message}`);
    }

    // Insert poll options
    if (data.options && data.options.length > 0) {
      const optionRows = data.options.map((opt, idx) => ({
        poll_id: poll.id,
        label: opt.label,
        sort_order: idx,
        vote_count: 0
      }));

      const { error: optError } = await (this.supabase as any)
        .from('lc_poll_options')
        .insert(optionRows);

      if (optError) {
        console.error('[lc/communication] Error creating poll options:', optError);
        // Try to clean up the poll
        await (this.supabase as any).from('lc_polls').delete().eq('id', poll.id);
        throw new Error(`Failed to create poll options: ${optError.message}`);
      }
    }

    // Return poll with options
    return this.getPollById(poll.id);
  }

  /**
   * Cast a vote on a poll
   */
  static async votePoll(
    pollId: string,
    optionId: string,
    userId: string
  ): Promise<LCPollVote> {
    // Check if user already voted (for single-vote polls)
    const { data: existingVote } = await (this.supabase as any)
      .from('lc_poll_votes')
      .select('id')
      .eq('poll_id', pollId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existingVote) {
      throw new Error('You have already voted on this poll');
    }

    // Insert vote
    const { data: vote, error: voteError } = await (this.supabase as any)
      .from('lc_poll_votes')
      .insert({
        poll_id: pollId,
        option_id: optionId,
        user_id: userId,
        voted_at: new Date().toISOString()
      })
      .select()
      .single();

    if (voteError) {
      console.error('[lc/communication] Error casting vote:', voteError);
      throw new Error(`Failed to cast vote: ${voteError.message}`);
    }

    // Increment option vote count
    const { data: option } = await (this.supabase as any)
      .from('lc_poll_options')
      .select('vote_count')
      .eq('id', optionId)
      .single();

    if (option) {
      await (this.supabase as any)
        .from('lc_poll_options')
        .update({ vote_count: (option.vote_count || 0) + 1 })
        .eq('id', optionId);
    }

    // Increment poll total votes
    const { data: poll } = await (this.supabase as any)
      .from('lc_polls')
      .select('total_votes')
      .eq('id', pollId)
      .single();

    if (poll) {
      await (this.supabase as any)
        .from('lc_polls')
        .update({ total_votes: (poll.total_votes || 0) + 1 })
        .eq('id', pollId);
    }

    return vote as LCPollVote;
  }

  /**
   * Close a poll
   */
  static async closePoll(pollId: string): Promise<LCPoll> {
    const { data, error } = await (this.supabase as any)
      .from('lc_polls')
      .update({ status: 'closed' as PollStatus })
      .eq('id', pollId)
      .select()
      .single();

    if (error) {
      console.error('[lc/communication] Error closing poll:', error);
      throw new Error(`Failed to close poll: ${error.message}`);
    }

    return data as LCPoll;
  }

  /**
   * Check if a user has already voted on a poll
   */
  static async getUserVote(
    pollId: string,
    userId: string
  ): Promise<LCPollVote | null> {
    const { data, error } = await (this.supabase as any)
      .from('lc_poll_votes')
      .select('*')
      .eq('poll_id', pollId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('[lc/communication] Error checking user vote:', error);
      return null;
    }

    return data as LCPollVote | null;
  }

  // ============================================================================
  // FORUMS
  // ============================================================================

  /**
   * Get forum topics with filters and pagination
   */
  static async getForumTopics(filters: {
    category?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: LCForumTopic[]; total: number }> {
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = (this.supabase as any)
      .from('lc_forum_topics')
      .select(
        `
        *,
        creator:profiles!lc_forum_topics_created_by_fkey(id, full_name, avatar_url)
      `,
        { count: 'exact' }
      )
      .order('is_pinned', { ascending: false })
      .order('last_post_at', { ascending: false, nullsFirst: false })
      .range(from, to);

    if (filters.category) {
      query = query.eq('category', filters.category);
    }

    const { data, count, error } = await query;

    if (error) {
      console.error('[lc/communication] Error fetching forum topics:', error);
      throw new Error(`Failed to fetch forum topics: ${error.message}`);
    }

    return { data: (data || []) as LCForumTopic[], total: count || 0 };
  }

  /**
   * Get a single forum topic by ID
   */
  static async getTopicById(id: string): Promise<LCForumTopic> {
    const { data, error } = await (this.supabase as any)
      .from('lc_forum_topics')
      .select(
        `
        *,
        creator:profiles!lc_forum_topics_created_by_fkey(id, full_name, avatar_url)
      `
      )
      .eq('id', id)
      .single();

    if (error) {
      console.error('[lc/communication] Error fetching topic:', error);
      throw new Error('Failed to fetch topic');
    }

    return data as LCForumTopic;
  }

  /**
   * Create a new forum topic
   */
  static async createTopic(
    data: CreateForumTopicDto,
    userId: string
  ): Promise<LCForumTopic> {
    const { data: topic, error } = await (this.supabase as any)
      .from('lc_forum_topics')
      .insert({
        title: data.title,
        category: data.category,
        description: data.description || null,
        created_by: userId,
        is_pinned: false,
        is_locked: false,
        post_count: 0,
        last_post_at: null
      })
      .select()
      .single();

    if (error) {
      console.error('[lc/communication] Error creating topic:', error);
      throw new Error(`Failed to create topic: ${error.message}`);
    }

    return topic as LCForumTopic;
  }

  /**
   * Get posts for a topic with pagination
   */
  static async getTopicPosts(
    topicId: string,
    page = 1,
    limit = 20
  ): Promise<{ data: LCForumPost[]; total: number }> {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, count, error } = await (this.supabase as any)
      .from('lc_forum_posts')
      .select(
        `
        *,
        author:profiles!lc_forum_posts_author_id_fkey(id, full_name, avatar_url),
        reactions:lc_forum_reactions(id, post_id, user_id, type)
      `,
        { count: 'exact' }
      )
      .eq('topic_id', topicId)
      .is('parent_id', null) // Only top-level posts
      .neq('status', 'deleted')
      .order('created_at', { ascending: true })
      .range(from, to);

    if (error) {
      console.error('[lc/communication] Error fetching topic posts:', error);
      throw new Error(`Failed to fetch posts: ${error.message}`);
    }

    // For each top-level post, also fetch replies
    const posts = (data || []) as LCForumPost[];
    for (const post of posts) {
      const { data: replies } = await (this.supabase as any)
        .from('lc_forum_posts')
        .select(
          `
          *,
          author:profiles!lc_forum_posts_author_id_fkey(id, full_name, avatar_url),
          reactions:lc_forum_reactions(id, post_id, user_id, type)
        `
        )
        .eq('parent_id', post.id)
        .neq('status', 'deleted')
        .order('created_at', { ascending: true });

      post.replies = (replies || []) as LCForumPost[];

      // Calculate reaction counts
      const reactions = (post.reactions || []) as LCForumReaction[];
      post.reaction_counts = {
        like: reactions.filter((r) => r.type === 'like').length,
        save: reactions.filter((r) => r.type === 'save').length,
        flag: reactions.filter((r) => r.type === 'flag').length
      };
    }

    return { data: posts, total: count || 0 };
  }

  /**
   * Create a new post or reply
   */
  static async createPost(
    data: CreateForumPostDto,
    userId: string
  ): Promise<LCForumPost> {
    const { data: post, error } = await (this.supabase as any)
      .from('lc_forum_posts')
      .insert({
        topic_id: data.topic_id,
        parent_id: data.parent_id || null,
        content: data.content,
        author_id: userId,
        status: 'published'
      })
      .select()
      .single();

    if (error) {
      console.error('[lc/communication] Error creating post:', error);
      throw new Error(`Failed to create post: ${error.message}`);
    }

    // Update topic post_count and last_post_at
    const { data: topic } = await (this.supabase as any)
      .from('lc_forum_topics')
      .select('post_count')
      .eq('id', data.topic_id)
      .single();

    if (topic) {
      await (this.supabase as any)
        .from('lc_forum_topics')
        .update({
          post_count: (topic.post_count || 0) + 1,
          last_post_at: new Date().toISOString()
        })
        .eq('id', data.topic_id);
    }

    return post as LCForumPost;
  }

  /**
   * Toggle a reaction on a post (like, save, flag)
   */
  static async reactToPost(
    postId: string,
    userId: string,
    type: ForumReactionType
  ): Promise<{ added: boolean }> {
    // Check if reaction exists
    const { data: existing } = await (this.supabase as any)
      .from('lc_forum_reactions')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .eq('type', type)
      .maybeSingle();

    if (existing) {
      // Remove reaction
      await (this.supabase as any)
        .from('lc_forum_reactions')
        .delete()
        .eq('id', existing.id);
      return { added: false };
    } else {
      // Add reaction
      const { error } = await (this.supabase as any)
        .from('lc_forum_reactions')
        .insert({
          post_id: postId,
          user_id: userId,
          type
        });

      if (error) {
        console.error('[lc/communication] Error reacting to post:', error);
        throw new Error(`Failed to react to post: ${error.message}`);
      }
      return { added: true };
    }
  }

  /**
   * Moderate a forum post (approve, hide, delete, escalate)
   */
  static async moderatePost(
    postId: string,
    action: ModerationAction,
    moderatorId: string,
    reason: string
  ): Promise<LCForumPost> {
    let newStatus: string;
    switch (action) {
      case 'approve':
        newStatus = 'published';
        break;
      case 'hide':
        newStatus = 'hidden';
        break;
      case 'delete':
        newStatus = 'deleted';
        break;
      case 'escalate':
        newStatus = 'flagged';
        break;
      default:
        newStatus = 'flagged';
    }

    const { data, error } = await (this.supabase as any)
      .from('lc_forum_posts')
      .update({
        status: newStatus,
        moderation_reason: reason,
        moderated_by: moderatorId
      })
      .eq('id', postId)
      .select()
      .single();

    if (error) {
      console.error('[lc/communication] Error moderating post:', error);
      throw new Error(`Failed to moderate post: ${error.message}`);
    }

    return data as LCForumPost;
  }

  // ============================================================================
  // CHAT
  // ============================================================================

  /**
   * Get channels for a user with last message
   */
  static async getChannels(
    userId: string
  ): Promise<LCChatChannel[]> {
    // Get channel IDs for this user
    const { data: memberships, error: memError } = await (this.supabase as any)
      .from('lc_chat_members')
      .select('channel_id')
      .eq('user_id', userId);

    if (memError) {
      console.error('[lc/communication] Error fetching memberships:', memError);
      throw new Error(`Failed to fetch channels: ${memError.message}`);
    }

    if (!memberships || memberships.length === 0) {
      return [];
    }

    const channelIds = memberships.map((m: { channel_id: string }) => m.channel_id);

    // Get channels with details
    const { data: channels, error } = await (this.supabase as any)
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

    if (error) {
      console.error('[lc/communication] Error fetching channels:', error);
      throw new Error(`Failed to fetch channels: ${error.message}`);
    }

    // Fetch last message for each channel
    const enrichedChannels: LCChatChannel[] = [];
    for (const channel of channels || []) {
      const { data: lastMsg } = await (this.supabase as any)
        .from('lc_chat_messages')
        .select(
          `
          *,
          sender:profiles!lc_chat_messages_sender_id_fkey(id, full_name, avatar_url)
        `
        )
        .eq('channel_id', channel.id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      enrichedChannels.push({
        ...channel,
        last_message: lastMsg || null
      } as LCChatChannel);
    }

    return enrichedChannels;
  }

  /**
   * Get messages for a channel with pagination
   */
  static async getChannelMessages(
    channelId: string,
    page = 1,
    limit = 50
  ): Promise<{ data: LCChatMessage[]; total: number }> {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, count, error } = await (this.supabase as any)
      .from('lc_chat_messages')
      .select(
        `
        *,
        sender:profiles!lc_chat_messages_sender_id_fkey(id, full_name, avatar_url)
      `,
        { count: 'exact' }
      )
      .eq('channel_id', channelId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('[lc/communication] Error fetching messages:', error);
      throw new Error(`Failed to fetch messages: ${error.message}`);
    }

    // Reverse to show oldest first in UI
    const messages = (data || []).reverse() as LCChatMessage[];

    return { data: messages, total: count || 0 };
  }

  /**
   * Create a new chat channel
   */
  static async createChannel(
    data: CreateChatChannelDto,
    userId: string
  ): Promise<LCChatChannel> {
    // Create channel
    const { data: channel, error: chError } = await (this.supabase as any)
      .from('lc_chat_channels')
      .insert({
        name: data.name,
        type: data.type,
        description: data.description || null,
        reference_id: data.reference_id || null,
        is_active: true,
        created_by: userId
      })
      .select()
      .single();

    if (chError) {
      console.error('[lc/communication] Error creating channel:', chError);
      throw new Error(`Failed to create channel: ${chError.message}`);
    }

    // Add creator as admin member
    const memberRows = [
      {
        channel_id: channel.id,
        user_id: userId,
        role: 'admin' as const,
        joined_at: new Date().toISOString()
      },
      // Add other members
      ...data.member_ids
        .filter((mid: string) => mid !== userId)
        .map((mid: string) => ({
          channel_id: channel.id,
          user_id: mid,
          role: 'member' as const,
          joined_at: new Date().toISOString()
        }))
    ];

    const { error: memError } = await (this.supabase as any)
      .from('lc_chat_members')
      .insert(memberRows);

    if (memError) {
      console.error('[lc/communication] Error adding channel members:', memError);
      // Don't fail - channel is created
    }

    return channel as LCChatChannel;
  }

  /**
   * Send a message in a channel
   */
  static async sendMessage(
    data: SendChatMessageDto,
    userId: string
  ): Promise<LCChatMessage> {
    const { data: message, error } = await (this.supabase as any)
      .from('lc_chat_messages')
      .insert({
        channel_id: data.channel_id,
        sender_id: userId,
        content: data.content,
        reply_to_id: data.reply_to_id || null,
        attachments: data.attachments || null,
        is_edited: false,
        is_deleted: false
      })
      .select(
        `
        *,
        sender:profiles!lc_chat_messages_sender_id_fkey(id, full_name, avatar_url)
      `
      )
      .single();

    if (error) {
      console.error('[lc/communication] Error sending message:', error);
      throw new Error(`Failed to send message: ${error.message}`);
    }

    // Update channel updated_at timestamp
    await (this.supabase as any)
      .from('lc_chat_channels')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', data.channel_id);

    return message as LCChatMessage;
  }

  /**
   * Mark a channel as read for a user
   */
  static async markChannelRead(
    channelId: string,
    userId: string
  ): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('lc_chat_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('channel_id', channelId)
      .eq('user_id', userId);

    if (error) {
      console.error('[lc/communication] Error marking channel read:', error);
      // Non-critical
    }
  }
}
