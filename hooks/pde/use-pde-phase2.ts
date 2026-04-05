// hooks/pde/use-pde-phase2.ts
// PDE Phase 2 Hooks — Channels, Reputation, Quests Admin, Capabilities
// These hooks connect to Phase 2 service methods (built in parallel)

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  PDEChannel, PDEMessage, PDEReputation, PDEBadge, PDELearnerBadge,
  PDEQuest, PDECapability, LeaderboardEntry, QuestFilters,
  CreateQuestInput, UpdateQuestInput, CreateCapabilityInput,
  PostMessageInput, QuestStatus,
} from '@/types/pde';

// Helper to get untyped supabase client for PDE tables (not yet in generated types)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSupabase = (): any => createClientSupabaseClient();

// ============================================
// Query Keys
// ============================================

export const pdePhase2Keys = {
  all: ['pde-p2'] as const,
  // Channels
  channels: () => [...pdePhase2Keys.all, 'channels'] as const,
  channelDetail: (id: string) => [...pdePhase2Keys.channels(), id] as const,
  channelMessages: (channelId: string) => [...pdePhase2Keys.channels(), channelId, 'messages'] as const,
  // Reputation
  reputation: () => [...pdePhase2Keys.all, 'reputation'] as const,
  learnerReputation: (learnerId: string) => [...pdePhase2Keys.reputation(), learnerId] as const,
  learnerBadges: (learnerId: string) => [...pdePhase2Keys.reputation(), 'badges', learnerId] as const,
  leaderboard: (filter?: string) => [...pdePhase2Keys.reputation(), 'leaderboard', filter] as const,
  // Quests (admin)
  adminQuests: (filters?: QuestFilters) => [...pdePhase2Keys.all, 'admin-quests', filters] as const,
  questDetail: (id: string) => [...pdePhase2Keys.all, 'quest-detail', id] as const,
  // Capabilities
  allCapabilities: () => [...pdePhase2Keys.all, 'capabilities'] as const,
};

// ============================================
// Channel Queries
// ============================================

export function useChannels() {
  return useQuery({
    queryKey: pdePhase2Keys.channels(),
    queryFn: async (): Promise<PDEChannel[]> => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('pde_channels')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data || [];
    },
    staleTime: 30000,
  });
}

export function useChannelDetail(channelId: string | undefined) {
  return useQuery({
    queryKey: pdePhase2Keys.channelDetail(channelId || ''),
    queryFn: async (): Promise<PDEChannel | null> => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('pde_channels')
        .select('*')
        .eq('id', channelId)
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!channelId,
    staleTime: 60000,
  });
}

export function useChannelMessages(channelId: string | undefined) {
  return useQuery({
    queryKey: pdePhase2Keys.channelMessages(channelId || ''),
    queryFn: async (): Promise<PDEMessage[]> => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('pde_messages')
        .select('*, author:profiles!pde_messages_author_id_fkey(full_name, avatar_url)')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      return (data || []).map((msg: Record<string, unknown>) => ({
        ...msg,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        author_name: (msg.author as any)?.full_name || 'Unknown',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        author_avatar: (msg.author as any)?.avatar_url || null,
      }));
    },
    enabled: !!channelId,
    staleTime: 10000, // short — real-time-ish
    refetchInterval: 15000, // poll every 15s
  });
}

// ============================================
// Channel Mutations
// ============================================

export function usePostMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PostMessageInput) => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('pde_messages')
        .insert({
          channel_id: input.channel_id,
          author_id: input.author_id,
          content: input.content,
          message_type: input.message_type || 'text',
          parent_id: input.parent_id || null,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: pdePhase2Keys.channelMessages(data.channel_id) });
    },
  });
}

export function useTogglePin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (messageId: string) => {
      const supabase = getSupabase();
      // Get current state
      const { data: msg } = await supabase
        .from('pde_messages')
        .select('is_pinned, channel_id')
        .eq('id', messageId)
        .single();
      if (!msg) throw new Error('Message not found');
      // Toggle
      const { error } = await supabase
        .from('pde_messages')
        .update({ is_pinned: !msg.is_pinned })
        .eq('id', messageId);
      if (error) throw new Error(error.message);
      return msg.channel_id;
    },
    onSuccess: (channelId) => {
      qc.invalidateQueries({ queryKey: pdePhase2Keys.channelMessages(channelId) });
    },
  });
}

export function useMarkAsAnswer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (messageId: string) => {
      const supabase = getSupabase();
      const { data: msg } = await supabase
        .from('pde_messages')
        .select('is_answer, channel_id')
        .eq('id', messageId)
        .single();
      if (!msg) throw new Error('Message not found');
      const { error } = await supabase
        .from('pde_messages')
        .update({ is_answer: !msg.is_answer })
        .eq('id', messageId);
      if (error) throw new Error(error.message);
      return msg.channel_id;
    },
    onSuccess: (channelId) => {
      qc.invalidateQueries({ queryKey: pdePhase2Keys.channelMessages(channelId) });
    },
  });
}

export function useToggleReaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId, emoji, userId }: { messageId: string; emoji: string; userId: string }) => {
      const supabase = getSupabase();
      const { data: msg } = await supabase
        .from('pde_messages')
        .select('reactions, channel_id')
        .eq('id', messageId)
        .single();
      if (!msg) throw new Error('Message not found');

      const reactions = msg.reactions || {};
      const current: string[] = reactions[emoji] || [];
      const idx = current.indexOf(userId);
      if (idx >= 0) {
        current.splice(idx, 1);
      } else {
        current.push(userId);
      }
      reactions[emoji] = current;

      const { error } = await supabase
        .from('pde_messages')
        .update({ reactions })
        .eq('id', messageId);
      if (error) throw new Error(error.message);
      return msg.channel_id;
    },
    onSuccess: (channelId) => {
      qc.invalidateQueries({ queryKey: pdePhase2Keys.channelMessages(channelId) });
    },
  });
}

// ============================================
// Reputation Queries
// ============================================

export function useLearnerReputation(learnerId: string | undefined) {
  return useQuery({
    queryKey: pdePhase2Keys.learnerReputation(learnerId || ''),
    queryFn: async (): Promise<PDEReputation | null> => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('pde_reputation')
        .select('*')
        .eq('learner_id', learnerId)
        .single();
      if (error && error.code !== 'PGRST116') throw new Error(error.message);
      return data || null;
    },
    enabled: !!learnerId,
    staleTime: 60000,
  });
}

export function useLearnerBadges(learnerId: string | undefined) {
  return useQuery({
    queryKey: pdePhase2Keys.learnerBadges(learnerId || ''),
    queryFn: async () => {
      const supabase = getSupabase();
      // Get all badges
      const { data: allBadges, error: bErr } = await supabase
        .from('pde_badges')
        .select('*')
        .order('category', { ascending: true });
      if (bErr) throw new Error(bErr.message);

      // Get earned badges
      const { data: earned, error: eErr } = await supabase
        .from('pde_learner_badges')
        .select('*, badge:pde_badges(*)')
        .eq('learner_id', learnerId);
      if (eErr) throw new Error(eErr.message);

      return {
        allBadges: allBadges || [],
        earnedBadges: earned || [],
      };
    },
    enabled: !!learnerId,
    staleTime: 60000,
  });
}

export function useLeaderboard(filterInstitution?: string) {
  return useQuery({
    queryKey: pdePhase2Keys.leaderboard(filterInstitution),
    queryFn: async (): Promise<LeaderboardEntry[]> => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('pde_reputation')
        .select('*, learner:profiles!pde_reputation_learner_id_fkey(full_name, avatar_url)')
        .order('total_points', { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return (data || []).map((row: Record<string, unknown>, idx: number) => ({
        ...row,
        rank: idx + 1,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        learner_name: (row.learner as any)?.full_name || 'Unknown',
        badges_count: 0, // Would need a join — leave as 0 for now
      }));
    },
    staleTime: 5 * 60 * 1000, // 5 min
  });
}

// ============================================
// Admin Quest Queries & Mutations
// ============================================

export function useAdminQuests(filters?: QuestFilters) {
  return useQuery({
    queryKey: pdePhase2Keys.adminQuests(filters),
    queryFn: async (): Promise<PDEQuest[]> => {
      const supabase = getSupabase();
      let query = supabase
        .from('pde_quests')
        .select('*')
        .order('created_at', { ascending: false });

      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.quest_type) query = query.eq('quest_type', filters.quest_type);
      if (filters?.difficulty) query = query.eq('difficulty', filters.difficulty);
      if (filters?.source_type) query = query.eq('source_type', filters.source_type);

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data || [];
    },
    staleTime: 30000,
  });
}

export function useQuestDetail(questId: string | undefined) {
  return useQuery({
    queryKey: pdePhase2Keys.questDetail(questId || ''),
    queryFn: async (): Promise<PDEQuest | null> => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('pde_quests')
        .select('*')
        .eq('id', questId)
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!questId,
    staleTime: 30000,
  });
}

export function useCreateQuest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateQuestInput) => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('pde_quests')
        .insert(input)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pdePhase2Keys.adminQuests() });
    },
  });
}

export function useUpdateQuest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<CreateQuestInput> }) => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('pde_quests')
        .update(input)
        .eq('id', id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: pdePhase2Keys.adminQuests() });
      qc.invalidateQueries({ queryKey: pdePhase2Keys.questDetail(data.id) });
    },
  });
}

export function useUpdateQuestStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: QuestStatus }) => {
      const supabase = getSupabase();
      const { error } = await supabase
        .from('pde_quests')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pdePhase2Keys.adminQuests() });
    },
  });
}

// ============================================
// Capability Queries & Mutations
// ============================================

export function useAllCapabilities() {
  return useQuery({
    queryKey: pdePhase2Keys.allCapabilities(),
    queryFn: async (): Promise<PDECapability[]> => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('pde_capabilities')
        .select('*')
        .order('category', { ascending: true })
        .order('level', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw new Error(error.message);
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateCapability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCapabilityInput) => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('pde_capabilities')
        .insert(input)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pdePhase2Keys.allCapabilities() });
    },
  });
}

export function useUpdateCapability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<CreateCapabilityInput> }) => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('pde_capabilities')
        .update(input)
        .eq('id', id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pdePhase2Keys.allCapabilities() });
    },
  });
}

// ============================================
// Notification Helper (PDE-specific)
// ============================================

export async function sendPDENotification(
  userId: string,
  type: 'quest_available' | 'capability_unlocked' | 'badge_earned' | 'streak_milestone' | 'peer_review_assigned',
  title: string,
  body: string,
  url?: string
) {
  const supabase = getSupabase();

  // Insert into notifications table
  const { data: notification, error: nErr } = await supabase
    .from('notifications')
    .insert({
      title,
      body,
      url: url || null,
      category: 'pde',
      priority: 'normal',
      metadata: { pde_type: type },
    })
    .select()
    .single();

  if (nErr) throw new Error(nErr.message);

  // Link to user
  const { error: uErr } = await supabase
    .from('user_notifications')
    .insert({
      user_id: userId,
      notification_id: notification.id,
    });

  if (uErr) throw new Error(uErr.message);

  return notification;
}
