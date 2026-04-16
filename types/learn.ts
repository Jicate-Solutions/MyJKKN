// types/learn.ts
// PDE Learn — notification event types and notification interface.
// Does NOT modify types/notification.ts (shared contract).

// ============================================
// Event Types
// ============================================

/**
 * Exhaustive union of all events the PDE Learn module can fire into
 * the notification system. These map to the ?type= query parameter
 * on POST /api/learn/notify.
 */
export type LearnEventType =
  | 'quest_unlocked'        // a new quest became available for the learner
  | 'capability_level_up'   // learner advanced a capability tier (demonstrated / mastered)
  | 'achievement_badge_earned' // a badge was awarded to the learner
  | 'cohort_milestone';     // a shared cohort milestone was reached — all members notified

// ============================================
// Notification Interface (learn-scoped)
// ============================================

/**
 * A row from learn_pde_notifications.
 * Mirrors the faculty_innovation_notifications shape but bound to PDE tables.
 */
export interface LearnNotification {
  id: string;
  user_id: string;
  event_type: LearnEventType;

  // Optional references — filled in depending on event_type
  quest_id?: string | null;
  capability_id?: string | null;
  badge_id?: string | null;
  cohort_id?: string | null;

  title: string;
  body?: string | null;
  channels: string[];  // ['in_app'] for v1

  read_at?: string | null;
  created_at: string;
}

// ============================================
// Payload shapes per event — used by the API route and notification service
// ============================================

export interface QuestUnlockedPayload {
  quest_id: string;
  quest_title: string;
  learner_id: string;
  action_url?: string;
}

export interface CapabilityLevelUpPayload {
  capability_id: string;
  capability_name: string;
  learner_id: string;
  new_status: 'demonstrated' | 'mastered';
  mentor_id?: string | null;  // if learner is in a cohort, notify mentor too
  action_url?: string;
}

export interface AchievementBadgeEarnedPayload {
  badge_id: string;
  badge_name: string;
  learner_id: string;
  action_url?: string;
}

export interface CohortMilestonePayload {
  cohort_id: string;
  cohort_name: string;
  milestone_description: string;
  member_ids: string[];  // all members to notify
  action_url?: string;
}

// ============================================
// API request body shapes
// ============================================

export type LearnNotifyBody =
  | ({ type: 'quest_unlocked' } & QuestUnlockedPayload)
  | ({ type: 'capability_level_up' } & CapabilityLevelUpPayload)
  | ({ type: 'achievement_badge_earned' } & AchievementBadgeEarnedPayload)
  | ({ type: 'cohort_milestone' } & CohortMilestonePayload);
