// lib/services/profile/notification-service.ts
// Static-class wrapper for profile notification dispatch.
// Follows the same pattern as lib/services/faculty-innovation/notification-service.ts.
//
// Call sites (server-side only — uses fetch to hit the internal API route):
//   ProfileNotificationService.verificationSubmitted(...)
//   ProfileNotificationService.verificationCompleted(...)
//   ProfileNotificationService.changeRequested(...)
//   ProfileNotificationService.changeDecided(...)
//
// Each method fires-and-forgets — notification failure NEVER blocks
// the main request. Errors are logged but swallowed so user-facing
// mutations always succeed even if notification infra is down.

import type { ProfileEventType, ProfileNotifyResponse } from '@/types/profile';

// Internal base URL for server-to-server calls.
// Falls back to localhost:3000 in dev when NEXT_PUBLIC_APP_URL is not set.
function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

function getApiKey(): string {
  return process.env.PROFILE_NOTIFY_API_KEY ?? '';
}

// ─── Low-level dispatcher ────────────────────────────────────────────────────

async function dispatch(
  eventType: ProfileEventType,
  payload: Record<string, unknown>
): Promise<ProfileNotifyResponse | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn('[profile/notification-service] PROFILE_NOTIFY_API_KEY not set — skipping notification');
    return null;
  }

  const url = `${getBaseUrl()}/api/profile/notify?type=${eventType}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(payload),
      // 5 s timeout — notification must not block the caller
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[profile/notification-service] ${eventType} dispatch failed (${res.status}):`, text);
      return null;
    }

    return (await res.json()) as ProfileNotifyResponse;
  } catch (err) {
    console.error(`[profile/notification-service] ${eventType} dispatch error:`, err);
    return null;
  }
}

// ─── Static class ─────────────────────────────────────────────────────────────

export class ProfileNotificationService {
  // --------------------------------------------------------------------------
  // VERIFICATION SUBMITTED
  // --------------------------------------------------------------------------

  /**
   * Notify admin/verifier(s) that a learner submitted a verification request.
   *
   * @param adminUserIds  IDs of admin/verifier users to notify
   * @param opts.learnerId   Learner profile ID (for deep-link)
   * @param opts.requestId   Verification request ID (for deep-link)
   */
  static async verificationSubmitted(
    adminUserIds: string[],
    opts?: { learnerId?: string; requestId?: string }
  ): Promise<void> {
    if (adminUserIds.length === 0) return;
    await dispatch('verification_submitted', {
      user_ids: adminUserIds,
      learner_id: opts?.learnerId,
      request_id: opts?.requestId,
    });
  }

  // --------------------------------------------------------------------------
  // VERIFICATION COMPLETED
  // --------------------------------------------------------------------------

  /**
   * Notify the learner that their verification was approved.
   *
   * @param learnerUserId  Auth user ID of the learner
   * @param opts.learnerId  Learner profile ID (for deep-link)
   * @param opts.requestId  Verification request ID (for deep-link)
   */
  static async verificationCompleted(
    learnerUserId: string,
    opts?: { learnerId?: string; requestId?: string }
  ): Promise<void> {
    if (!learnerUserId) return;
    await dispatch('verification_completed', {
      user_ids: [learnerUserId],
      learner_id: opts?.learnerId,
      request_id: opts?.requestId,
    });
  }

  // --------------------------------------------------------------------------
  // PROFILE CHANGE REQUESTED
  // --------------------------------------------------------------------------

  /**
   * Notify approver(s) that a learner submitted a profile change request.
   *
   * @param approverUserIds  IDs of approvers to notify
   * @param opts.fieldsSummary  Human-readable list of changed fields
   * @param opts.requestId      Change request ID (for deep-link)
   * @param opts.learnerId      Learner profile ID (for deep-link)
   */
  static async changeRequested(
    approverUserIds: string[],
    opts?: {
      fieldsSummary?: string[];
      requestId?: string;
      learnerId?: string;
    }
  ): Promise<void> {
    if (approverUserIds.length === 0) return;
    await dispatch('profile_change_requested', {
      user_ids: approverUserIds,
      fields_summary: opts?.fieldsSummary,
      request_id: opts?.requestId,
      learner_id: opts?.learnerId,
    });
  }

  // --------------------------------------------------------------------------
  // PROFILE CHANGE DECIDED
  // --------------------------------------------------------------------------

  /**
   * Notify the learner of the approver's decision (approved or rejected).
   *
   * @param learnerUserId     Auth user ID of the learner
   * @param decision          'approved' | 'rejected'
   * @param opts.requestId    Change request ID (for deep-link)
   * @param opts.learnerId    Learner profile ID (for deep-link)
   * @param opts.rejectionReason  Why the request was rejected (optional)
   */
  static async changeDecided(
    learnerUserId: string,
    decision: 'approved' | 'rejected',
    opts?: {
      requestId?: string;
      learnerId?: string;
      rejectionReason?: string;
    }
  ): Promise<void> {
    if (!learnerUserId) return;
    await dispatch('profile_change_decided', {
      user_ids: [learnerUserId],
      decision,
      request_id: opts?.requestId,
      learner_id: opts?.learnerId,
      rejection_reason: opts?.rejectionReason,
    });
  }
}
