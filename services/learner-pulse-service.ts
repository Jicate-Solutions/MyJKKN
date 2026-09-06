// services/learner-pulse-service.ts
// Learner Belonging Pulse Service
// Created: 2026-05-25
// Purpose: Server-side service for mandatory pulse check system.
//   Queries notifications + learner_pulse_responses to detect pending
//   pulses and record student responses.
//
// SPEC-VS-REALITY OVERRIDE:
//   The notifications table does NOT have `kind`, `is_layer_0`,
//   `requires_acknowledgment`, or `action_config` columns.
//   Actual columns: id, title, body, category, targeting, metadata,
//   priority, icon, url, expires_at, sent_at, created_by, created_at, updated_at.
//   We use `category = 'mandatory_pulse'` and store pulse config in `metadata`.
//   Acknowledgment is tracked via `user_notifications.read_at`.

import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================
// TYPES
// ============================================

export interface PendingPulse {
  notification_id: string;
  question: string;
  response_type: 'yes_no' | 'free_text';
  pulse_type: string;
}

export interface PulseResponse {
  id: string;
  learner_id: string;
  institution_id: string;
  notification_id: string | null;
  pulse_type: string;
  question_text: string;
  response_value: string;
  response_sentiment: number;
  responded_at: string;
  days_since_enrollment: number;
  created_at: string;
}

export interface RespondToPulseData {
  learner_id: string;
  institution_id: string;
  notification_id: string;
  response_value: string;
  pulse_type: string;
  question_text: string;
}

export interface CreatePulseNotificationData {
  institution_id: string;
  learner_id: string;
  pulse_type: string;
  question: string;
  response_type: 'yes_no' | 'free_text';
  created_by: string;
}

// ============================================
// SERVICE
// ============================================

export class LearnerPulseService {
  /**
   * Find unacknowledged mandatory pulse for a given user (profile.id).
   *
   * Flow:
   * 1. Look up profile → learner_id
   * 2. Find notifications WHERE category='mandatory_pulse' AND created in last 30 days
   * 3. Exclude those already responded to in learner_pulse_responses
   * 4. Exclude those already read in user_notifications
   * 5. Return the oldest pending pulse (FIFO)
   */
  static async getPendingPulse(
    supabase: SupabaseClient,
    userId: string
  ): Promise<PendingPulse | null> {
    // Step 1: Get learner_id from profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('learner_id')
      .eq('id', userId)
      .single();

    if (profileError || !profile?.learner_id) {
      // Not a learner — no pulse
      return null;
    }

    const learnerId = profile.learner_id;

    // Step 2: Find mandatory_pulse notifications targeting this learner
    // targeting JSON contains { learner_id: UUID } or broader criteria
    // We query all mandatory_pulse notifications from last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: notifications, error: notifError } = await supabase
      .from('notifications')
      .select('id, title, body, metadata, targeting, created_at')
      .eq('category', 'mandatory_pulse')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: true });

    if (notifError || !notifications || notifications.length === 0) {
      return null;
    }

    // Step 3: Filter notifications that target this learner
    const targetedNotifications = notifications.filter((n) => {
      const targeting = n.targeting as Record<string, unknown> | null;
      if (!targeting) return false;

      // Direct learner targeting
      if (targeting.learner_id === learnerId) return true;

      // Broadcast to all active learners (targeting has lifecycle_status)
      if (targeting.lifecycle_status === 'active') return true;

      // Array-based targeting
      if (
        Array.isArray(targeting.learner_ids) &&
        (targeting.learner_ids as string[]).includes(learnerId)
      ) {
        return true;
      }

      return false;
    });

    if (targetedNotifications.length === 0) {
      return null;
    }

    const notificationIds = targetedNotifications.map((n) => n.id);

    // Step 4: Exclude already-responded pulses
    const { data: existingResponses } = await supabase
      .from('learner_pulse_responses')
      .select('notification_id')
      .eq('learner_id', learnerId)
      .in('notification_id', notificationIds);

    const respondedIds = new Set(
      (existingResponses || []).map((r) => r.notification_id)
    );

    // Step 5: Also exclude notifications marked as read in user_notifications
    const { data: readNotifications } = await supabase
      .from('user_notifications')
      .select('notification_id')
      .eq('user_id', userId)
      .in('notification_id', notificationIds)
      .not('read_at', 'is', null);

    const readIds = new Set(
      (readNotifications || []).map((r) => r.notification_id)
    );

    // Find first unresponded, unread notification
    const pending = targetedNotifications.find(
      (n) => !respondedIds.has(n.id) && !readIds.has(n.id)
    );

    if (!pending) {
      return null;
    }

    // Parse metadata for pulse config
    const metadata = pending.metadata as Record<string, unknown> | null;

    return {
      notification_id: pending.id,
      question: (metadata?.question as string) || pending.body || '',
      response_type:
        (metadata?.response_type as 'yes_no' | 'free_text') || 'yes_no',
      pulse_type: (metadata?.pulse_type as string) || 'belonging',
    };
  }

  /**
   * Record a student's response to a mandatory pulse.
   *
   * 1. Insert into learner_pulse_responses
   * 2. Mark the user_notification as read (acknowledged)
   */
  static async respondToPulse(
    supabase: SupabaseClient,
    data: RespondToPulseData
  ): Promise<void> {
    // Compute sentiment: yes→1, no→-1, free text→0
    const sentiment = LearnerPulseService.computeSentiment(
      data.response_value,
      data.pulse_type
    );

    // Compute days since enrollment
    const daysSinceEnrollment =
      await LearnerPulseService.computeDaysSinceEnrollment(
        supabase,
        data.learner_id
      );

    // Step 1: Insert response
    const { error: insertError } = await supabase
      .from('learner_pulse_responses')
      .insert({
        learner_id: data.learner_id,
        institution_id: data.institution_id,
        notification_id: data.notification_id,
        pulse_type: data.pulse_type,
        question_text: data.question_text,
        response_value: data.response_value,
        response_sentiment: sentiment,
        responded_at: new Date().toISOString(),
        days_since_enrollment: daysSinceEnrollment,
      });

    if (insertError) {
      console.error(
        '[learner-pulse] Error inserting pulse response:',
        insertError
      );
      throw new Error('Failed to save pulse response');
    }

    // Step 2: Get the user_id (profile.id) for this learner
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('learner_id', data.learner_id)
      .single();

    if (profile) {
      // Mark notification as read in user_notifications
      const { error: updateError } = await supabase
        .from('user_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', profile.id)
        .eq('notification_id', data.notification_id);

      if (updateError) {
        // Non-fatal: the response is already saved
        console.error(
          '[learner-pulse] Error marking notification as read:',
          updateError
        );
      }
    }
  }

  /**
   * Get all pulse responses for a learner, newest first.
   */
  static async getPulseHistory(
    supabase: SupabaseClient,
    learnerId: string
  ): Promise<PulseResponse[]> {
    const { data, error } = await supabase
      .from('learner_pulse_responses')
      .select('*')
      .eq('learner_id', learnerId)
      .order('responded_at', { ascending: false });

    if (error) {
      console.error('[learner-pulse] Error fetching pulse history:', error);
      throw new Error('Failed to fetch pulse history');
    }

    return (data || []) as PulseResponse[];
  }

  /**
   * Create a mandatory pulse notification targeting a specific learner.
   * Used by cron/admin to schedule pulse checks.
   *
   * Creates:
   * 1. A `notifications` row with category='mandatory_pulse'
   * 2. A `user_notifications` row linking to the learner's profile
   */
  static async createPulseNotification(
    supabase: SupabaseClient,
    data: CreatePulseNotificationData
  ): Promise<{ notification_id: string }> {
    // Build the notification
    const { data: notification, error: notifError } = await supabase
      .from('notifications')
      .insert({
        title: 'Belonging Pulse Check',
        body: data.question,
        category: 'mandatory_pulse',
        priority: 'high',
        targeting: { learner_id: data.learner_id },
        metadata: {
          pulse_type: data.pulse_type,
          question: data.question,
          response_type: data.response_type,
          blocks_navigation: true,
          is_layer_0: true,
          requires_acknowledgment: true,
        },
        created_by: data.created_by,
      })
      .select('id')
      .single();

    if (notifError || !notification) {
      console.error(
        '[learner-pulse] Error creating pulse notification:',
        notifError
      );
      throw new Error('Failed to create pulse notification');
    }

    // Link to learner's profile via user_notifications
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('learner_id', data.learner_id)
      .single();

    if (profile) {
      const { error: linkError } = await supabase
        .from('user_notifications')
        .insert({
          user_id: profile.id,
          notification_id: notification.id,
        });

      if (linkError) {
        console.error(
          '[learner-pulse] Error linking notification to user:',
          linkError
        );
      }
    }

    return { notification_id: notification.id };
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  /**
   * Compute sentiment from response value.
   * yes/true → 1 (positive)
   * no/false → -1 (negative)
   * free text → 0 (neutral, AI classification is future work)
   */
  private static computeSentiment(
    responseValue: string,
    _pulseType: string
  ): number {
    const normalized = responseValue.trim().toLowerCase();
    if (normalized === 'yes' || normalized === 'true') return 1;
    if (normalized === 'no' || normalized === 'false') return -1;
    return 0;
  }

  /**
   * Compute days since the learner's enrollment (created_at in learners_profiles).
   */
  private static async computeDaysSinceEnrollment(
    supabase: SupabaseClient,
    learnerId: string
  ): Promise<number> {
    const { data: learner } = await supabase
      .from('learners_profiles')
      .select('created_at')
      .eq('id', learnerId)
      .single();

    if (!learner?.created_at) return 0;

    const enrolledAt = new Date(learner.created_at);
    const now = new Date();
    const diffMs = now.getTime() - enrolledAt.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }
}
