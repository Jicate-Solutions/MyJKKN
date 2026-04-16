// types/profile.ts
// Profile-module types. First code in this module; scope is intentionally
// minimal — just the notification event-type union shipped 2026-04-16.
// Expanded by future profile-module PRs (verification flows, change requests).

/**
 * Profile-module notification event types. Dispatched via
 * POST /api/profile/notify?type=<event_type> and routed into the core
 * `notifications` + `user_notifications` tables with `type = 'profile'`.
 *
 * Phase 1 (MVP) ships two event types. Phase 2 will add:
 *   - profile_change_requested
 *   - profile_change_decided
 *   - verification_rejected (with reason)
 */
export type ProfileNotificationEventType =
  | 'verification_submitted'
  | 'verification_completed';

/** Payload contract for /api/profile/notify?type=verification_submitted */
export interface VerificationSubmittedPayload {
  submitter_user_id: string;
  verifier_user_id: string;
  verification_type?: string;
  reference_id?: string;
}

/** Payload contract for /api/profile/notify?type=verification_completed */
export interface VerificationCompletedPayload {
  target_user_id: string;
  result: 'approved' | 'rejected';
  reason?: string;
  verifier_user_id?: string;
  verification_type?: string;
}
