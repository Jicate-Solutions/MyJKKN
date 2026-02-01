// hooks/grievance/index.ts
// F004: Grievance Ticketing System - Hooks Barrel Export

// Category hooks
export {
  grievanceCategoryKeys,
  useGrievanceCategories,
  useAllGrievanceCategories,
  useGrievanceCategory,
  useCreateGrievanceCategory,
  useUpdateGrievanceCategory,
  useDeleteGrievanceCategory,
  useSeedGrievanceCategories
} from './use-grievance-categories';

// Ticket hooks
export {
  grievanceTicketKeys,
  useGrievanceTickets,
  useGrievanceTicket,
  useGrievanceTicketByNumber,
  useMyGrievanceTickets,
  useAssignedGrievanceTickets,
  useCreateGrievanceTicket,
  useUpdateGrievanceTicket,
  useAssignGrievanceTicket,
  useResolveGrievanceTicket,
  useUpdateGrievanceTicketStatus,
  useRateGrievanceSatisfaction,
  useReopenGrievanceTicket
} from './use-grievance-tickets';

// Comment hooks
export {
  grievanceCommentKeys,
  useGrievanceComments,
  useAddGrievanceComment
} from './use-grievance-comments';

// Dashboard hooks
export {
  grievanceDashboardKeys,
  useGrievanceDashboardStats,
  useGrievanceSLAReport,
  useGrievanceHistory
} from './use-grievance-dashboard';
