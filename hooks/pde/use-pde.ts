// hooks/pde/use-pde.ts
// PDE Phase 1 Hooks — follows pattern from hooks/vac/use-vac.ts

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PDEService } from '@/lib/services/pde-service';
import type {
  CreateAssessmentInput, CreateQuestionInput, SubmissionAnswer,
  LogEngagementInput, GenerateCertificateInput,
  // Phase 2
  CreateQuestInput, UpdateQuestInput, CreateQuestSubmissionInput,
  DemonstrateCapabilityInput, StartBuildSessionInput, EndBuildSessionInput,
  LogAIInteractionInput, PostMessageInput, AddReputationPointsInput, AwardBadgeInput,
  QuestFilters, CapabilityCategory,
  // Phase 3
  SendCoachMessageInput, CoachContextType,
} from '@/types/pde';
import type { LearnNotifyBody } from '@/types/learn';

// ──────────────────────────────────────────────────────────────────────────────
// Notification integration — fire-and-forget dispatch to /api/learn/notify.
// Integration site: called from useEnrollInQuest, useDemonstrateCapability,
// useAwardBadge onSuccess handlers (see below).
// LEARN_NOTIFY_API_KEY must be set in the environment for dispatches to succeed.
// ──────────────────────────────────────────────────────────────────────────────
async function dispatchLearnNotification(body: LearnNotifyBody): Promise<void> {
  try {
    const apiKey = process.env.NEXT_PUBLIC_LEARN_NOTIFY_API_KEY;
    if (!apiKey) return; // silently skip in environments without the key
    await fetch(`/api/learn/notify?type=${body.type}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(body),
    });
  } catch {
    // Notification failure must never break the primary action
  }
}

// ============================================
// Query Keys
// ============================================

export const pdeQueryKeys = {
  all: ['pde'] as const,
  // Assessments
  assessments: () => [...pdeQueryKeys.all, 'assessments'] as const,
  assessmentsByLesson: (lessonId: string) => [...pdeQueryKeys.assessments(), 'lesson', lessonId] as const,
  assessmentsByCourse: (courseId: string) => [...pdeQueryKeys.assessments(), 'course', courseId] as const,
  assessmentDetail: (id: string) => [...pdeQueryKeys.assessments(), 'detail', id] as const,
  // Submissions
  submissions: () => [...pdeQueryKeys.all, 'submissions'] as const,
  submissionResults: (id: string) => [...pdeQueryKeys.submissions(), 'results', id] as const,
  learnerSubmissions: (learnerId: string, assessmentId: string) =>
    [...pdeQueryKeys.submissions(), 'learner', learnerId, assessmentId] as const,
  // Engagement
  engagement: () => [...pdeQueryKeys.all, 'engagement'] as const,
  engagementSummary: (learnerId: string, courseId?: string) =>
    [...pdeQueryKeys.engagement(), 'summary', learnerId, courseId] as const,
  atRisk: (courseId?: string) => [...pdeQueryKeys.engagement(), 'at-risk', courseId] as const,
  // Certificates
  certificates: () => [...pdeQueryKeys.all, 'certificates'] as const,
  certificate: (id: string) => [...pdeQueryKeys.certificates(), id] as const,
  verifyCertificate: (number: string) => [...pdeQueryKeys.certificates(), 'verify', number] as const,
  learnerCertificates: (learnerId: string) => [...pdeQueryKeys.certificates(), 'learner', learnerId] as const,
  // Phase 2: Quests
  quests: () => [...pdeQueryKeys.all, 'quests'] as const,
  questList: (filters?: QuestFilters) => [...pdeQueryKeys.quests(), 'list', filters] as const,
  questDetail: (id: string) => [...pdeQueryKeys.quests(), 'detail', id] as const,
  questEnrollments: (questId: string) => [...pdeQueryKeys.quests(), 'enrollments', questId] as const,
  questSubmissions: (questId: string) => [...pdeQueryKeys.quests(), 'submissions', questId] as const,
  learnerEnrollments: (learnerId: string) => [...pdeQueryKeys.quests(), 'learner-enrollments', learnerId] as const,
  learnerQuestSubmissions: (learnerId: string, questId?: string) =>
    [...pdeQueryKeys.quests(), 'learner-submissions', learnerId, questId] as const,
  // Phase 2: Capabilities
  capabilities: () => [...pdeQueryKeys.all, 'capabilities'] as const,
  capabilityList: (category?: string) => [...pdeQueryKeys.capabilities(), 'list', category] as const,
  capabilityDetail: (id: string) => [...pdeQueryKeys.capabilities(), 'detail', id] as const,
  learnerCapabilities: (learnerId: string) => [...pdeQueryKeys.capabilities(), 'learner', learnerId] as const,
  // Phase 2: Build Arena
  buildSessions: () => [...pdeQueryKeys.all, 'build-sessions'] as const,
  learnerBuildSessions: (learnerId: string, questId?: string) =>
    [...pdeQueryKeys.buildSessions(), learnerId, questId] as const,
  // Phase 2: Channels
  channels: () => [...pdeQueryKeys.all, 'channels'] as const,
  channelList: (type?: string, referenceId?: string) => [...pdeQueryKeys.channels(), 'list', type, referenceId] as const,
  channelMessages: (channelId: string) => [...pdeQueryKeys.channels(), 'messages', channelId] as const,
  // Phase 2: Reputation
  reputation: () => [...pdeQueryKeys.all, 'reputation'] as const,
  learnerReputation: (learnerId: string) => [...pdeQueryKeys.reputation(), learnerId] as const,
  leaderboard: (limit?: number) => [...pdeQueryKeys.reputation(), 'leaderboard', limit] as const,
  // Phase 2: Badges
  badges: () => [...pdeQueryKeys.all, 'badges'] as const,
  badgeList: () => [...pdeQueryKeys.badges(), 'list'] as const,
  learnerBadges: (learnerId: string) => [...pdeQueryKeys.badges(), 'learner', learnerId] as const,
  // Phase 3: AI Coach
  coach: () => [...pdeQueryKeys.all, 'coach'] as const,
  coachConversation: (learnerId: string, contextType: string, contextId: string) =>
    [...pdeQueryKeys.coach(), 'conversation', learnerId, contextType, contextId] as const,
  coachHistory: (learnerId: string) => [...pdeQueryKeys.coach(), 'history', learnerId] as const,
  // Phase 3: Agency Index
  agency: () => [...pdeQueryKeys.all, 'agency'] as const,
  agencyIndex: (learnerId: string, courseId?: string) =>
    [...pdeQueryKeys.agency(), 'index', learnerId, courseId] as const,
  agencyTrends: (learnerId: string) => [...pdeQueryKeys.agency(), 'trends', learnerId] as const,
  // Activity
  activity: () => [...pdeQueryKeys.all, 'activity'] as const,
  recentActivity: (learnerId: string, limit?: number) =>
    [...pdeQueryKeys.activity(), 'recent', learnerId, limit] as const,
};

// ============================================
// Assessment Queries
// ============================================

export function useAssessmentsByLesson(lessonId: string | undefined) {
  return useQuery({
    queryKey: pdeQueryKeys.assessmentsByLesson(lessonId || ''),
    queryFn: () => PDEService.getAssessmentsByLesson(lessonId!),
    enabled: !!lessonId,
    staleTime: 60000,
    gcTime: 5 * 60 * 1000,
  });
}

export function useAssessmentsByCourse(courseId: string | undefined) {
  return useQuery({
    queryKey: pdeQueryKeys.assessmentsByCourse(courseId || ''),
    queryFn: () => PDEService.getAssessmentsByCourse(courseId!),
    enabled: !!courseId,
    staleTime: 60000,
    gcTime: 5 * 60 * 1000,
  });
}

export function useAssessmentDetail(assessmentId: string | undefined) {
  return useQuery({
    queryKey: pdeQueryKeys.assessmentDetail(assessmentId || ''),
    queryFn: () => PDEService.getAssessmentWithQuestions(assessmentId!),
    enabled: !!assessmentId,
    staleTime: 30000,
  });
}

export function useLearnerSubmissions(learnerId: string | undefined, assessmentId: string | undefined) {
  return useQuery({
    queryKey: pdeQueryKeys.learnerSubmissions(learnerId || '', assessmentId || ''),
    queryFn: () => PDEService.getLearnerSubmissions(learnerId!, assessmentId!),
    enabled: !!learnerId && !!assessmentId,
    staleTime: 10000,
  });
}

export function useSubmissionResults(submissionId: string | undefined) {
  return useQuery({
    queryKey: pdeQueryKeys.submissionResults(submissionId || ''),
    queryFn: () => PDEService.getSubmissionResults(submissionId!),
    enabled: !!submissionId,
    staleTime: 30000,
  });
}

// ============================================
// Assessment Mutations
// ============================================

export function useCreateAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAssessmentInput) => PDEService.createAssessment(input),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: pdeQueryKeys.assessmentsByCourse(variables.course_id) });
      if (variables.lesson_id) {
        qc.invalidateQueries({ queryKey: pdeQueryKeys.assessmentsByLesson(variables.lesson_id) });
      }
    },
  });
}

export function useUpdateAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CreateAssessmentInput> }) =>
      PDEService.updateAssessment(id, input),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: pdeQueryKeys.assessmentDetail(data.id) });
      qc.invalidateQueries({ queryKey: pdeQueryKeys.assessmentsByCourse(data.course_id) });
    },
  });
}

export function useDeleteAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => PDEService.deleteAssessment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pdeQueryKeys.assessments() });
    },
  });
}

export function useAddQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ assessmentId, input }: { assessmentId: string; input: CreateQuestionInput }) =>
      PDEService.addQuestion(assessmentId, input),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: pdeQueryKeys.assessmentDetail(variables.assessmentId) });
    },
  });
}

export function useAddQuestionsBulk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ assessmentId, questions }: { assessmentId: string; questions: CreateQuestionInput[] }) =>
      PDEService.addQuestionsBulk(assessmentId, questions),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: pdeQueryKeys.assessmentDetail(variables.assessmentId) });
    },
  });
}

// ============================================
// Submission Mutations
// ============================================

export function useStartAttempt() {
  return useMutation({
    mutationFn: ({ assessmentId, learnerId }: { assessmentId: string; learnerId: string }) =>
      PDEService.startAttempt(assessmentId, learnerId),
  });
}

export function useSubmitAnswers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ submissionId, answers, timeSpentSeconds }: {
      submissionId: string;
      answers: SubmissionAnswer[];
      timeSpentSeconds: number;
    }) => PDEService.submitAnswers(submissionId, answers, timeSpentSeconds),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: pdeQueryKeys.submissionResults(data.id) });
      qc.invalidateQueries({ queryKey: pdeQueryKeys.submissions() });
    },
  });
}

// ============================================
// Engagement Hooks
// ============================================

export function useLogEngagement() {
  return useMutation({
    mutationFn: (input: LogEngagementInput) => PDEService.logEngagement(input),
  });
}

export function useEngagementSummary(learnerId: string | undefined, courseId?: string) {
  return useQuery({
    queryKey: pdeQueryKeys.engagementSummary(learnerId || '', courseId),
    queryFn: () => PDEService.getEngagementSummary(learnerId!, courseId),
    enabled: !!learnerId,
    staleTime: 60000,
  });
}

export function useAtRiskLearners(courseId?: string) {
  return useQuery({
    queryKey: pdeQueryKeys.atRisk(courseId),
    queryFn: () => PDEService.getAtRiskLearners(courseId),
    staleTime: 5 * 60 * 1000, // 5 min (expensive query)
  });
}

// ============================================
// Certificate Hooks
// ============================================

export function useGenerateCertificate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GenerateCertificateInput) => PDEService.generateCertificate(input),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: pdeQueryKeys.learnerCertificates(data.learner_id) });
    },
  });
}

export function useCertificate(certificateId: string | undefined) {
  return useQuery({
    queryKey: pdeQueryKeys.certificate(certificateId || ''),
    queryFn: () => PDEService.getCertificate(certificateId!),
    enabled: !!certificateId,
  });
}

export function useVerifyCertificate(certificateNumber: string | undefined) {
  return useQuery({
    queryKey: pdeQueryKeys.verifyCertificate(certificateNumber || ''),
    queryFn: () => PDEService.verifyCertificate(certificateNumber!),
    enabled: !!certificateNumber,
  });
}

export function useLearnerCertificates(learnerId: string | undefined) {
  return useQuery({
    queryKey: pdeQueryKeys.learnerCertificates(learnerId || ''),
    queryFn: () => PDEService.getLearnerCertificates(learnerId!),
    enabled: !!learnerId,
    staleTime: 60000,
  });
}

/**
 * Auto-check and generate certificate when conditions are met.
 * Call after lesson completion or assessment submission.
 */
export function useCheckAndGenerateCertificate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ learnerId, courseId }: { learnerId: string; courseId: string }) =>
      PDEService.checkAndGenerateCertificate(learnerId, courseId),
    onSuccess: (data, variables) => {
      if (data) {
        // Certificate was generated — invalidate certificate queries
        qc.invalidateQueries({ queryKey: pdeQueryKeys.learnerCertificates(variables.learnerId) });
        qc.invalidateQueries({ queryKey: pdeQueryKeys.certificates() });
      }
    },
  });
}

// ============================================
// Phase 2: Quest Hooks
// ============================================

export function useQuests(filters?: QuestFilters) {
  return useQuery({
    queryKey: pdeQueryKeys.questList(filters),
    queryFn: () => PDEService.getQuests(filters),
    staleTime: 60000,
  });
}

export function useQuestDetail(questId: string | undefined) {
  return useQuery({
    queryKey: pdeQueryKeys.questDetail(questId || ''),
    queryFn: () => PDEService.getQuestById(questId!),
    enabled: !!questId,
    staleTime: 30000,
  });
}

export function useQuestEnrollments(questId: string | undefined) {
  return useQuery({
    queryKey: pdeQueryKeys.questEnrollments(questId || ''),
    queryFn: () => PDEService.getQuestEnrollments(questId!),
    enabled: !!questId,
    staleTime: 30000,
  });
}

export function useLearnerQuestEnrollments(learnerId: string | undefined) {
  return useQuery({
    queryKey: pdeQueryKeys.learnerEnrollments(learnerId || ''),
    queryFn: () => PDEService.getLearnerQuestEnrollments(learnerId!),
    enabled: !!learnerId,
    staleTime: 30000,
  });
}

export function useQuestSubmissions(questId: string | undefined) {
  return useQuery({
    queryKey: pdeQueryKeys.questSubmissions(questId || ''),
    queryFn: () => PDEService.getQuestSubmissions(questId!),
    enabled: !!questId,
    staleTime: 30000,
  });
}

export function useLearnerQuestSubmissions(learnerId: string | undefined, questId?: string) {
  return useQuery({
    queryKey: pdeQueryKeys.learnerQuestSubmissions(learnerId || '', questId),
    queryFn: () => PDEService.getLearnerQuestSubmissions(learnerId!, questId),
    enabled: !!learnerId,
    staleTime: 30000,
  });
}

// useCreateQuest and useUpdateQuest moved to use-pde-phase2.ts

export function useEnrollInQuest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ questId, learnerId, teamId }: { questId: string; learnerId: string; teamId?: string }) =>
      PDEService.enrollInQuest(questId, learnerId, teamId),
    onSuccess: (data, variables) => {
      qc.invalidateQueries({ queryKey: pdeQueryKeys.questEnrollments(data.quest_id) });
      qc.invalidateQueries({ queryKey: pdeQueryKeys.learnerEnrollments(data.learner_id) });
      // Integration site 1: quest_unlocked — notify learner that their quest is now active
      void dispatchLearnNotification({
        type: 'quest_unlocked',
        quest_id: data.quest_id,
        quest_title: 'your new quest', // TODO: pass quest title through enrollInQuest or fetch from cache
        learner_id: variables.learnerId,
        action_url: `/learn/quests/${data.quest_id}`,
      });
    },
  });
}

export function useSubmitQuestWork() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateQuestSubmissionInput) => PDEService.submitQuestWork(input),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: pdeQueryKeys.questSubmissions(data.quest_id) });
      qc.invalidateQueries({ queryKey: pdeQueryKeys.learnerQuestSubmissions(data.learner_id) });
    },
  });
}

// ============================================
// Phase 2: Capability Hooks
// ============================================

export function useCapabilities(category?: string) {
  return useQuery({
    queryKey: pdeQueryKeys.capabilityList(category),
    queryFn: () => PDEService.getCapabilities(category),
    staleTime: 5 * 60 * 1000, // Capabilities rarely change
  });
}

export function useCapabilityDetail(capabilityId: string | undefined) {
  return useQuery({
    queryKey: pdeQueryKeys.capabilityDetail(capabilityId || ''),
    queryFn: () => PDEService.getCapabilityById(capabilityId!),
    enabled: !!capabilityId,
    staleTime: 60000,
  });
}

export function useLearnerCapabilities(learnerId: string | undefined) {
  return useQuery({
    queryKey: pdeQueryKeys.learnerCapabilities(learnerId || ''),
    queryFn: () => PDEService.getLearnerCapabilities(learnerId!),
    enabled: !!learnerId,
    staleTime: 30000,
  });
}

export function useUpdateCapabilityStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ learnerId, capabilityId, status }: { learnerId: string; capabilityId: string; status: string }) =>
      PDEService.updateCapabilityStatus(learnerId, capabilityId, status),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: pdeQueryKeys.learnerCapabilities(variables.learnerId) });
    },
  });
}

export function useDemonstrateCapability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ learnerId, capabilityId, evidence }: {
      learnerId: string;
      capabilityId: string;
      evidence: DemonstrateCapabilityInput;
    }) => PDEService.demonstrateCapability(learnerId, capabilityId, evidence),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: pdeQueryKeys.learnerCapabilities(variables.learnerId) });
      // Integration site 2: capability_level_up — notify learner + optional mentor
      void dispatchLearnNotification({
        type: 'capability_level_up',
        capability_id: variables.capabilityId,
        capability_name: 'your capability', // TODO: pass capability name via variables or fetch from cache
        learner_id: variables.learnerId,
        new_status: 'demonstrated',
        action_url: `/learn/capabilities/${variables.capabilityId}`,
      });
    },
  });
}

export function useLearnerCapabilityStatus(learnerId: string | undefined, capabilityId: string | undefined) {
  return useQuery({
    queryKey: [...pdeQueryKeys.learnerCapabilities(learnerId || ''), 'status', capabilityId],
    queryFn: async () => {
      const all = await PDEService.getLearnerCapabilities(learnerId!);
      return all.find((c: { capability_id: string }) => c.capability_id === capabilityId) || null;
    },
    enabled: !!learnerId && !!capabilityId,
    staleTime: 30000,
  });
}

export function useCapabilityLessons(capabilityId: string | undefined) {
  return useQuery({
    queryKey: [...pdeQueryKeys.capabilityDetail(capabilityId || ''), 'lessons'],
    queryFn: () => PDEService.getCapabilityLessons(capabilityId!),
    enabled: !!capabilityId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useStartCapability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ learnerId, capabilityId }: { learnerId: string; capabilityId: string }) =>
      PDEService.updateCapabilityStatus(learnerId, capabilityId, 'in_progress'),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: pdeQueryKeys.learnerCapabilities(variables.learnerId) });
    },
  });
}

// ============================================
// Phase 2: Build Arena Hooks
// ============================================

export function useBuildSessions(learnerId: string | undefined, questId?: string) {
  return useQuery({
    queryKey: pdeQueryKeys.learnerBuildSessions(learnerId || '', questId),
    queryFn: () => PDEService.getBuildSessions(learnerId!, questId),
    enabled: !!learnerId,
    staleTime: 30000,
  });
}

export function useStartBuildSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: StartBuildSessionInput) => PDEService.startBuildSession(input),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: pdeQueryKeys.learnerBuildSessions(data.learner_id) });
    },
  });
}

export function useEndBuildSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, input }: { sessionId: string; input: EndBuildSessionInput }) =>
      PDEService.endBuildSession(sessionId, input),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: pdeQueryKeys.learnerBuildSessions(data.learner_id) });
    },
  });
}

export function useLogAIInteraction() {
  return useMutation({
    mutationFn: ({ sessionId, interaction }: { sessionId: string; interaction: LogAIInteractionInput }) =>
      PDEService.logAIInteraction(sessionId, interaction),
  });
}

// ============================================
// Phase 2: Channel Hooks (moved to use-pde-phase2.ts)
// Import useChannels, useChannelMessages, usePostMessage, useToggleReaction from use-pde-phase2.ts
// ============================================

// ============================================
// Phase 2: Reputation Hooks
// ============================================

export function useReputation(learnerId: string | undefined) {
  return useQuery({
    queryKey: pdeQueryKeys.learnerReputation(learnerId || ''),
    queryFn: () => PDEService.getReputation(learnerId!),
    enabled: !!learnerId,
    staleTime: 30000,
  });
}

export function useAddReputationPoints() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddReputationPointsInput) => PDEService.addPoints(input),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: pdeQueryKeys.learnerReputation(data.learner_id) });
      qc.invalidateQueries({ queryKey: pdeQueryKeys.leaderboard() });
    },
  });
}

// useLeaderboard moved to use-pde-phase2.ts

// ============================================
// Phase 2: Badge Hooks
// ============================================

export function useBadges() {
  return useQuery({
    queryKey: pdeQueryKeys.badgeList(),
    queryFn: () => PDEService.getBadges(),
    staleTime: 5 * 60 * 1000, // Badges rarely change
  });
}

export function useLearnerBadges(learnerId: string | undefined) {
  return useQuery({
    queryKey: pdeQueryKeys.learnerBadges(learnerId || ''),
    queryFn: () => PDEService.getLearnerBadges(learnerId!),
    enabled: !!learnerId,
    staleTime: 60000,
  });
}

export function useAwardBadge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AwardBadgeInput) => PDEService.awardBadge(input),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: pdeQueryKeys.learnerBadges(data.learner_id) });
      qc.invalidateQueries({ queryKey: pdeQueryKeys.badges() });
      // Integration site 3: achievement_badge_earned — notify learner
      void dispatchLearnNotification({
        type: 'achievement_badge_earned',
        badge_id: data.badge_id,
        badge_name: data.badge?.name ?? 'a badge', // badge joined via PDELearnerBadge.badge
        learner_id: data.learner_id,
        action_url: '/learn/profile',
      });
    },
  });
}

// ============================================
// Phase 3: AI Coach Hooks
// ============================================

export function useCoachConversation(
  learnerId: string | undefined,
  contextType: string | undefined,
  contextId: string | undefined
) {
  return useQuery({
    queryKey: pdeQueryKeys.coachConversation(learnerId || '', contextType || '', contextId || ''),
    queryFn: () => PDEService.getCoachConversation(learnerId!, contextType!, contextId!),
    enabled: !!learnerId && !!contextType && !!contextId,
    staleTime: 10000,
  });
}

export function useSendCoachMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SendCoachMessageInput) =>
      PDEService.sendCoachMessage(input.learner_id, input.context_type, input.context_id, input.message),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({
        queryKey: pdeQueryKeys.coachConversation(variables.learner_id, variables.context_type, variables.context_id),
      });
      qc.invalidateQueries({ queryKey: pdeQueryKeys.coachHistory(variables.learner_id) });
    },
  });
}

export function useCoachHistory(learnerId: string | undefined, limit = 20) {
  return useQuery({
    queryKey: pdeQueryKeys.coachHistory(learnerId || ''),
    queryFn: () => PDEService.getCoachHistory(learnerId!, limit),
    enabled: !!learnerId,
    staleTime: 30000,
  });
}

// ============================================
// Phase 3: Agency Index Hooks
// ============================================

export function useAgencyIndex(learnerId: string | undefined, courseId?: string) {
  return useQuery({
    queryKey: pdeQueryKeys.agencyIndex(learnerId || '', courseId),
    queryFn: () => PDEService.getAgencyIndex(learnerId!, courseId),
    enabled: !!learnerId,
    staleTime: 60000,
  });
}

export function useCalculateAgencyIndex() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ learnerId, courseId }: { learnerId: string; courseId: string }) =>
      PDEService.calculateAgencyIndex(learnerId, courseId),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: pdeQueryKeys.agencyIndex(data.learner_id, data.course_id) });
      qc.invalidateQueries({ queryKey: pdeQueryKeys.agencyTrends(data.learner_id) });
    },
  });
}

export function useAgencyTrends(learnerId: string | undefined) {
  return useQuery({
    queryKey: pdeQueryKeys.agencyTrends(learnerId || ''),
    queryFn: () => PDEService.getAgencyTrends(learnerId!),
    enabled: !!learnerId,
    staleTime: 60000,
  });
}

// ============================================
// Activity Feed Hook
// ============================================

export function useRecentActivity(learnerId: string | undefined, limit = 20) {
  return useQuery({
    queryKey: pdeQueryKeys.recentActivity(learnerId || '', limit),
    queryFn: () => PDEService.getRecentActivity(learnerId!, limit),
    enabled: !!learnerId,
    staleTime: 30000,
  });
}
