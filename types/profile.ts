// types/profile.ts
// Profile notification types for in-app notification integration.
// Do NOT modify types/notification.ts — this file extends that contract.

// ==================== EVENT TYPES ====================

/**
 * All events that trigger a profile notification.
 *
 * verification_submitted   — user submits identity/KYC/document verification → notify admin/verifier
 * verification_completed   — admin approves verification → notify user
 * profile_change_requested — user requests a field change (role, photo, phone) → notify approver
 * profile_change_decided   — approver accepts or rejects → notify user
 */
export type ProfileEventType =
  | 'verification_submitted'
  | 'verification_completed'
  | 'profile_change_requested'
  | 'profile_change_decided';

// ==================== NOTIFICATION INTERFACE ====================

/**
 * Shape of a profile notification stored in the notifications table.
 * Metadata is stored in the `metadata` JSONB column under `custom_data`.
 */
export interface ProfileNotification {
  id: string;
  user_id: string;
  event_type: ProfileEventType;
  title: string;
  message: string;
  /** action_url — route user should land on when clicking the notification */
  action_url?: string;
  action_label?: string;
  read_at?: string | null;
  created_at: string;
}

// ==================== REQUEST PAYLOADS ====================

/** POST /api/profile/notify body */
export interface ProfileNotifyRequest {
  /** One of the four supported event types */
  type: ProfileEventType;
  /** Target user IDs to notify (max 100 per call) */
  user_ids: string[];
  /** Human-readable change summary, e.g. "Phone number, Address" */
  fields_summary?: string[];
  /** The change/verification request ID for deep-linking */
  request_id?: string;
  /** Learner ID for deep-link routing */
  learner_id?: string;
  /** Approver's decision: 'approved' | 'rejected' (for profile_change_decided) */
  decision?: 'approved' | 'rejected';
  /** Rejection reason (for profile_change_decided + rejected) */
  rejection_reason?: string;
}

export interface ProfileNotifyResponse {
  notified: number;
  event: ProfileEventType;
}
