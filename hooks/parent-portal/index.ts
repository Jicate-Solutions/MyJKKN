// hooks/parent-portal/index.ts

// Profile hooks
export {
  parentProfileKeys,
  useParentProfiles,
  useParentProfile,
  useParentProfileByUser,
  useCreateParentProfile,
  useUpdateParentProfile,
  useVerifyParent,
} from './use-parent-profile';

// Learner hooks
export {
  parentLearnerKeys,
  useLinkedLearners,
  useLearnerAttendance,
  useLearnerFees,
  useLinkLearner,
  useUnlinkLearner,
  useVerifyLink,
  useSetPrimaryLink,
} from './use-parent-learners';

// Dashboard hooks
export {
  parentDashboardKeys,
  useParentDashboard,
} from './use-parent-dashboard';

// Communication hooks
export {
  parentCommunicationKeys,
  useParentCommunications,
  useParentCommunication,
  useUnreadCommunicationCount,
  useCreateCommunication,
  useMarkCommunicationRead,
  useMarkAllCommunicationsRead,
} from './use-parent-communications';

// Auth hooks
export {
  useRequestOTP,
  useVerifyOTP,
  useRegisterParent,
  useCompleteRegistration,
  useLogActivity,
} from './use-parent-auth';

// Admin Access Management hooks
export {
  parentAccessKeys,
  adminCommunicationKeys,
  useParentAccessRecords,
  useParentAccessRecord,
  useParentAccessStats,
  useCreateParentAccess,
  useUpdateParentAccess,
  useToggleParentAccess,
  useRegenerateAccessCode,
  useDeleteParentAccess,
  useAdminCommunications,
  useAdminCommunicationStats,
  useSendAdminCommunication,
  useDeleteAdminCommunication,
} from './use-parent-portal';
