'use client';

// hooks/learners-council/use-lc-communication.ts
// LC-002: Communication Hub - React Query Hooks

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { LCCommunicationService } from '@/lib/services/learners-council/communication-service';
import type {
  LCAnnouncement,
  LCPoll,
  LCPollVote,
  LCForumTopic,
  LCForumPost,
  LCChatChannel,
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
  ForumPostStatus,
  ForumReactionType,
  ModerationAction
} from '@/types/learners-council';

// ============================================================================
// QUERY KEY FACTORIES
// ============================================================================

export const lcAnnouncementKeys = {
  all: ['lc-announcements'] as const,
  lists: () => [...lcAnnouncementKeys.all, 'list'] as const,
  list: (filters: { scope?: string; status?: string; page?: number; limit?: number }) =>
    [...lcAnnouncementKeys.lists(), filters] as const,
  detail: (id: string) => [...lcAnnouncementKeys.all, 'detail', id] as const,
  readStats: (id: string) => [...lcAnnouncementKeys.all, 'readStats', id] as const
};

export const lcPollKeys = {
  all: ['lc-polls'] as const,
  lists: () => [...lcPollKeys.all, 'list'] as const,
  list: (filters: { scope?: string; status?: string; page?: number; limit?: number }) =>
    [...lcPollKeys.lists(), filters] as const,
  detail: (id: string) => [...lcPollKeys.all, 'detail', id] as const,
  userVote: (pollId: string, userId: string) =>
    [...lcPollKeys.all, 'vote', pollId, userId] as const,
  results: (pollId: string) => [...lcPollKeys.all, 'results', pollId] as const
};

export const lcForumKeys = {
  all: ['lc-forums'] as const,
  topics: () => [...lcForumKeys.all, 'topics'] as const,
  topicList: (filters: { category?: string; page?: number; limit?: number }) =>
    [...lcForumKeys.topics(), filters] as const,
  topicDetail: (id: string) => [...lcForumKeys.all, 'topic', id] as const,
  posts: (topicId: string, page?: number, limit?: number) =>
    [...lcForumKeys.all, 'posts', topicId, page, limit] as const,
  flaggedPosts: (filters: { status?: string; page?: number; limit?: number }) =>
    [...lcForumKeys.all, 'flagged', filters] as const
};

export const lcChatKeys = {
  all: ['lc-chat'] as const,
  channels: (userId: string) => [...lcChatKeys.all, 'channels', userId] as const,
  messages: (channelId: string, page?: number, limit?: number) =>
    [...lcChatKeys.all, 'messages', channelId, page, limit] as const
};

// ============================================================================
// ANNOUNCEMENT HOOKS
// ============================================================================

/**
 * Fetch announcements with filters
 */
export function useAnnouncements(filters: {
  scope?: AnnouncementScope;
  status?: AnnouncementStatus;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: lcAnnouncementKeys.list(filters),
    queryFn: () => LCCommunicationService.getAnnouncements(filters),
    staleTime: 60 * 1000 // 1 minute
  });
}

/**
 * Fetch a single announcement
 */
export function useAnnouncementDetail(id: string) {
  return useQuery({
    queryKey: lcAnnouncementKeys.detail(id),
    queryFn: () => LCCommunicationService.getAnnouncementById(id),
    enabled: !!id,
    staleTime: 60 * 1000
  });
}

/**
 * Create a new announcement
 */
export function useCreateAnnouncement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ data, userId }: { data: CreateAnnouncementDto; userId: string }) =>
      LCCommunicationService.createAnnouncement(data, userId),
    onSuccess: () => {
      toast.success('Announcement created as draft');
      queryClient.invalidateQueries({ queryKey: lcAnnouncementKeys.lists() });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create announcement');
    }
  });
}

/**
 * Update an announcement
 */
export function useUpdateAnnouncement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAnnouncementDto }) =>
      LCCommunicationService.updateAnnouncement(id, data),
    onSuccess: (updated) => {
      toast.success('Announcement updated');
      queryClient.invalidateQueries({ queryKey: lcAnnouncementKeys.detail(updated.id) });
      queryClient.invalidateQueries({ queryKey: lcAnnouncementKeys.lists() });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update announcement');
    }
  });
}

/**
 * Publish an announcement
 */
export function usePublishAnnouncement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reviewerId }: { id: string; reviewerId: string }) =>
      LCCommunicationService.publishAnnouncement(id, reviewerId),
    onSuccess: (published) => {
      toast.success('Announcement published');
      queryClient.invalidateQueries({ queryKey: lcAnnouncementKeys.detail(published.id) });
      queryClient.invalidateQueries({ queryKey: lcAnnouncementKeys.lists() });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to publish announcement');
    }
  });
}

/**
 * Mark an announcement as read
 */
export function useMarkAnnouncementRead() {
  return useMutation({
    mutationFn: ({
      announcementId,
      userId
    }: {
      announcementId: string;
      userId: string;
    }) => LCCommunicationService.markAnnouncementRead(announcementId, userId),
    // Silent - no toast for read tracking
    onError: () => {
      // Silent fail for read tracking
    }
  });
}

/**
 * Fetch read statistics for an announcement
 */
export function useAnnouncementReadStats(announcementId: string) {
  return useQuery({
    queryKey: lcAnnouncementKeys.readStats(announcementId),
    queryFn: () => LCCommunicationService.getAnnouncementReadStats(announcementId),
    enabled: !!announcementId,
    staleTime: 30 * 1000 // 30 seconds
  });
}

/**
 * Archive an announcement
 */
export function useArchiveAnnouncement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (announcementId: string) =>
      LCCommunicationService.archiveAnnouncement(announcementId),
    onSuccess: (archived) => {
      toast.success('Announcement archived');
      queryClient.invalidateQueries({ queryKey: lcAnnouncementKeys.detail(archived.id) });
      queryClient.invalidateQueries({ queryKey: lcAnnouncementKeys.lists() });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to archive announcement');
    }
  });
}

// ============================================================================
// POLL HOOKS
// ============================================================================

/**
 * Fetch polls with filters
 */
export function usePolls(filters: {
  scope?: PollScope;
  status?: PollStatus;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: lcPollKeys.list(filters),
    queryFn: () => LCCommunicationService.getPolls(filters),
    staleTime: 30 * 1000 // 30 seconds - polls change with votes
  });
}

/**
 * Fetch a single poll with vote counts
 */
export function usePollDetail(id: string) {
  return useQuery({
    queryKey: lcPollKeys.detail(id),
    queryFn: () => LCCommunicationService.getPollById(id),
    enabled: !!id,
    staleTime: 15 * 1000 // 15 seconds for live vote tracking
  });
}

/**
 * Check if user has voted on a poll
 */
export function useUserVote(pollId: string, userId: string) {
  return useQuery({
    queryKey: lcPollKeys.userVote(pollId, userId),
    queryFn: () => LCCommunicationService.getUserVote(pollId, userId),
    enabled: !!pollId && !!userId,
    staleTime: 60 * 1000
  });
}

/**
 * Create a new poll
 */
export function useCreatePoll() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ data, userId }: { data: CreatePollDto; userId: string }) =>
      LCCommunicationService.createPoll(data, userId),
    onSuccess: () => {
      toast.success('Poll created successfully');
      queryClient.invalidateQueries({ queryKey: lcPollKeys.lists() });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create poll');
    }
  });
}

/**
 * Cast a vote on a poll
 */
export function useVotePoll() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      pollId,
      optionId,
      userId
    }: {
      pollId: string;
      optionId: string;
      userId: string;
    }) => LCCommunicationService.votePoll(pollId, optionId, userId),
    onSuccess: (_vote, variables) => {
      toast.success('Vote recorded!');
      queryClient.invalidateQueries({ queryKey: lcPollKeys.detail(variables.pollId) });
      queryClient.invalidateQueries({ queryKey: lcPollKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: lcPollKeys.userVote(variables.pollId, variables.userId)
      });
      queryClient.invalidateQueries({
        queryKey: lcPollKeys.results(variables.pollId)
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to cast vote');
    }
  });
}

/**
 * Close a poll
 */
export function useClosePoll() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (pollId: string) => LCCommunicationService.closePoll(pollId),
    onSuccess: (poll) => {
      toast.success('Poll closed');
      queryClient.invalidateQueries({ queryKey: lcPollKeys.detail(poll.id) });
      queryClient.invalidateQueries({ queryKey: lcPollKeys.lists() });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to close poll');
    }
  });
}

/**
 * Activate a poll (draft -> active)
 */
export function useActivatePoll() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (pollId: string) => LCCommunicationService.activatePoll(pollId),
    onSuccess: (poll) => {
      toast.success('Poll activated');
      queryClient.invalidateQueries({ queryKey: lcPollKeys.detail(poll.id) });
      queryClient.invalidateQueries({ queryKey: lcPollKeys.lists() });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to activate poll');
    }
  });
}

/**
 * Pause a poll (active -> paused)
 */
export function usePausePoll() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (pollId: string) => LCCommunicationService.pausePoll(pollId),
    onSuccess: (poll) => {
      toast.success('Poll paused');
      queryClient.invalidateQueries({ queryKey: lcPollKeys.detail(poll.id) });
      queryClient.invalidateQueries({ queryKey: lcPollKeys.lists() });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to pause poll');
    }
  });
}

/**
 * Resume a poll (paused -> active)
 */
export function useResumePoll() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (pollId: string) => LCCommunicationService.resumePoll(pollId),
    onSuccess: (poll) => {
      toast.success('Poll resumed');
      queryClient.invalidateQueries({ queryKey: lcPollKeys.detail(poll.id) });
      queryClient.invalidateQueries({ queryKey: lcPollKeys.lists() });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to resume poll');
    }
  });
}

/**
 * Fetch poll results with demographic breakdown
 */
export function usePollResultsWithDemographics(pollId: string) {
  return useQuery({
    queryKey: lcPollKeys.results(pollId),
    queryFn: () => LCCommunicationService.getPollResultsWithDemographics(pollId),
    enabled: !!pollId,
    staleTime: 30 * 1000
  });
}

// ============================================================================
// FORUM HOOKS
// ============================================================================

/**
 * Fetch forum topics with filters
 */
export function useForumTopics(filters: {
  category?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: lcForumKeys.topicList(filters),
    queryFn: () => LCCommunicationService.getForumTopics(filters),
    staleTime: 60 * 1000
  });
}

/**
 * Fetch a single topic
 */
export function useTopicDetail(id: string) {
  return useQuery({
    queryKey: lcForumKeys.topicDetail(id),
    queryFn: () => LCCommunicationService.getTopicById(id),
    enabled: !!id,
    staleTime: 60 * 1000
  });
}

/**
 * Fetch posts for a topic
 */
export function useTopicPosts(topicId: string, page = 1, limit = 20) {
  return useQuery({
    queryKey: lcForumKeys.posts(topicId, page, limit),
    queryFn: () => LCCommunicationService.getTopicPosts(topicId, page, limit),
    enabled: !!topicId,
    staleTime: 30 * 1000
  });
}

/**
 * Create a new topic
 */
export function useCreateTopic() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ data, userId }: { data: CreateForumTopicDto; userId: string }) =>
      LCCommunicationService.createTopic(data, userId),
    onSuccess: () => {
      toast.success('Topic created');
      queryClient.invalidateQueries({ queryKey: lcForumKeys.topics() });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create topic');
    }
  });
}

/**
 * Create a post or reply
 */
export function useCreatePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ data, userId }: { data: CreateForumPostDto; userId: string }) =>
      LCCommunicationService.createPost(data, userId),
    onSuccess: (_post, variables) => {
      toast.success('Reply posted');
      queryClient.invalidateQueries({
        queryKey: lcForumKeys.posts(variables.data.topic_id)
      });
      queryClient.invalidateQueries({ queryKey: lcForumKeys.topics() });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to post reply');
    }
  });
}

/**
 * Edit a forum post
 */
export function useEditPost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (vars: {
      postId: string;
      content: string;
      editedBy: string;
      topicId: string;
    }) => LCCommunicationService.editPost(vars.postId, vars.content, vars.editedBy),
    onSuccess: (_post, variables) => {
      toast.success('Post updated');
      queryClient.invalidateQueries({
        queryKey: lcForumKeys.posts(variables.topicId)
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to edit post');
    }
  });
}

/**
 * React to a post (toggle like/save/flag)
 */
export function useReactToPost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      postId,
      userId,
      type
    }: {
      postId: string;
      userId: string;
      type: ForumReactionType;
      topicId: string;
    }) => LCCommunicationService.reactToPost(postId, userId, type),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        queryKey: lcForumKeys.posts(variables.topicId)
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to react');
    }
  });
}

/**
 * Moderate a forum post
 */
export function useModeratePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      postId,
      action,
      moderatorId,
      reason
    }: {
      postId: string;
      action: ModerationAction;
      moderatorId: string;
      reason: string;
      topicId: string;
    }) => LCCommunicationService.moderatePost(postId, action, moderatorId, reason),
    onSuccess: (_post, variables) => {
      toast.success('Post moderated');
      queryClient.invalidateQueries({
        queryKey: lcForumKeys.posts(variables.topicId)
      });
      queryClient.invalidateQueries({ queryKey: lcForumKeys.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to moderate post');
    }
  });
}

/**
 * Pin or unpin a forum topic
 */
export function usePinTopic() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ topicId, pinned }: { topicId: string; pinned: boolean }) =>
      LCCommunicationService.pinTopic(topicId, pinned),
    onSuccess: (topic) => {
      toast.success(topic.is_pinned ? 'Topic pinned' : 'Topic unpinned');
      queryClient.invalidateQueries({ queryKey: lcForumKeys.topicDetail(topic.id) });
      queryClient.invalidateQueries({ queryKey: lcForumKeys.topics() });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update topic');
    }
  });
}

/**
 * Lock or unlock a forum topic
 */
export function useLockTopic() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ topicId, locked }: { topicId: string; locked: boolean }) =>
      LCCommunicationService.lockTopic(topicId, locked),
    onSuccess: (topic) => {
      toast.success(topic.is_locked ? 'Topic locked' : 'Topic unlocked');
      queryClient.invalidateQueries({ queryKey: lcForumKeys.topicDetail(topic.id) });
      queryClient.invalidateQueries({ queryKey: lcForumKeys.topics() });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update topic');
    }
  });
}

/**
 * Fetch flagged posts for moderator view
 */
export function useFlaggedPosts(filters: {
  status?: ForumPostStatus;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: lcForumKeys.flaggedPosts(filters),
    queryFn: () => LCCommunicationService.getFlaggedPosts(filters),
    staleTime: 30 * 1000
  });
}

// ============================================================================
// CHAT HOOKS
// ============================================================================

/**
 * Fetch channels for a user
 */
export function useChatChannels(userId: string) {
  return useQuery({
    queryKey: lcChatKeys.channels(userId),
    queryFn: () => LCCommunicationService.getChannels(userId),
    enabled: !!userId,
    staleTime: 15 * 1000, // 15 seconds
    refetchInterval: 30 * 1000 // Poll every 30 seconds
  });
}

/**
 * Fetch messages for a channel
 */
export function useChannelMessages(channelId: string, page = 1, limit = 50) {
  return useQuery({
    queryKey: lcChatKeys.messages(channelId, page, limit),
    queryFn: () => LCCommunicationService.getChannelMessages(channelId, page, limit),
    enabled: !!channelId,
    staleTime: 10 * 1000, // 10 seconds
    refetchInterval: 15 * 1000 // Poll every 15 seconds for new messages
  });
}

/**
 * Create a new channel
 */
export function useCreateChannel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ data, userId }: { data: CreateChatChannelDto; userId: string }) =>
      LCCommunicationService.createChannel(data, userId),
    onSuccess: (_channel, variables) => {
      toast.success('Channel created');
      queryClient.invalidateQueries({
        queryKey: lcChatKeys.channels(variables.userId)
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create channel');
    }
  });
}

/**
 * Send a message
 */
export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ data, userId }: { data: SendChatMessageDto; userId: string }) =>
      LCCommunicationService.sendMessage(data, userId),
    onSuccess: (_message, variables) => {
      queryClient.invalidateQueries({
        queryKey: lcChatKeys.messages(variables.data.channel_id)
      });
      queryClient.invalidateQueries({
        queryKey: lcChatKeys.channels(variables.userId)
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to send message');
    }
  });
}

/**
 * Mark a channel as read
 */
export function useMarkChannelRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ channelId, userId }: { channelId: string; userId: string }) =>
      LCCommunicationService.markChannelRead(channelId, userId),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        queryKey: lcChatKeys.channels(variables.userId)
      });
    }
  });
}

/**
 * Edit a chat message
 */
export function useEditMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (vars: {
      messageId: string;
      content: string;
      channelId: string;
    }) => LCCommunicationService.editMessage(vars.messageId, vars.content),
    onSuccess: (_msg, variables) => {
      toast.success('Message edited');
      queryClient.invalidateQueries({
        queryKey: lcChatKeys.messages(variables.channelId)
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to edit message');
    }
  });
}

/**
 * Delete (soft-delete) a chat message
 */
export function useDeleteMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (vars: {
      messageId: string;
      channelId: string;
    }) => LCCommunicationService.deleteMessage(vars.messageId),
    onSuccess: (_result, variables) => {
      toast.success('Message deleted');
      queryClient.invalidateQueries({
        queryKey: lcChatKeys.messages(variables.channelId)
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete message');
    }
  });
}

/**
 * Add a member to a chat channel
 */
export function useAddChannelMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      channelId,
      userId,
      role
    }: {
      channelId: string;
      userId: string;
      role?: 'admin' | 'member';
      currentUserId: string;
    }) => LCCommunicationService.addChannelMember(channelId, userId, role),
    onSuccess: (_member, variables) => {
      toast.success('Member added to channel');
      queryClient.invalidateQueries({
        queryKey: lcChatKeys.channels(variables.currentUserId)
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add member');
    }
  });
}

/**
 * Remove a member from a chat channel
 */
export function useRemoveChannelMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      channelId,
      userId
    }: {
      channelId: string;
      userId: string;
      currentUserId: string;
    }) => LCCommunicationService.removeChannelMember(channelId, userId),
    onSuccess: (_result, variables) => {
      toast.success('Member removed from channel');
      queryClient.invalidateQueries({
        queryKey: lcChatKeys.channels(variables.currentUserId)
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove member');
    }
  });
}
