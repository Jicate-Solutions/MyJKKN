// ============================================================================
// Industry Integration Module - Hook Exports
// ============================================================================

// Partner hooks
export {
  partnerKeys,
  useIndustryPartners,
  useIndustryPartner,
  usePartnerOptions,
  usePartnerSummaries,
  useCreatePartner,
  useUpdatePartner,
  useArchivePartner,
  useRestorePartner
} from './use-industry-partners';

// Mentor hooks
export {
  mentorKeys,
  useIndustryMentors,
  useIndustryMentor,
  useMentorsByPartner,
  useMentorOptions,
  useCreateMentor,
  useUpdateMentor,
  useArchiveMentor,
  useRestoreMentor
} from './use-industry-mentors';

// Project hooks
export {
  projectKeys,
  useIndustryProjects,
  useIndustryProject,
  useProjectsByPartner,
  useOpenProjects,
  useProjectOptions,
  useProjectSummaries,
  useCreateProject,
  useUpdateProject,
  useUpdateProjectStatus,
  useDeleteProject,
  useCancelProject
} from './use-industry-projects';

// Engagement hooks
export {
  engagementKeys,
  useIndustryEngagements,
  useIndustryEngagement,
  useEngagementsByLearner,
  useActiveLearnerEngagements,
  useIndustryStats,
  useCreateEngagement,
  useUpdateEngagement,
  useUpdateEngagementStatus,
  useAddEngagementFeedback,
  useLogEngagementHours,
  useAddDemonstratedCompetency
} from './use-industry-engagements';
