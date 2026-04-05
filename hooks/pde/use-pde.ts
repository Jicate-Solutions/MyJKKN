// hooks/pde/use-pde.ts
// PDE Phase 1 Hooks — follows pattern from hooks/vac/use-vac.ts

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PDEService } from '@/lib/services/pde-service';
import type {
  CreateAssessmentInput, CreateQuestionInput, SubmissionAnswer,
  LogEngagementInput, GenerateCertificateInput
} from '@/types/pde';

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
