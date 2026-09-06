// types/grievance.ts
// ============================================================================
// Learners' Council issue-module view over the canonical grievance types.
//
// The LC issue surface (issues-kanban-client.tsx + issue-service.ts) was
// written against `@/types/grievance`, which did not exist — the canonical
// definitions live in `lib/types/grievance.ts`. This shim resolves that
// import path by re-exporting the canonical names.
//
// `GrievanceTicket` here aliases the canonical `GrievanceTicketDetail`:
// the LC service selects full rows (`select('*', …)`) and the kanban client
// renders detail fields (description, resolution, assigned_to, metadata),
// so the detail shape is what these callers actually receive and use.
// ============================================================================

export type {
  GrievanceCategory,
  GrievanceComment,
  GrievancePriority,
  GrievanceStatus,
} from '@/lib/types/grievance';

export type { GrievanceTicketDetail as GrievanceTicket } from '@/lib/types/grievance';
