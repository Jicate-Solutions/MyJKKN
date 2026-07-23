-- File: supabase/migrations/20260517000002_seed_admission_statuses.sql
-- Mirrors the current colors from:
--   app/(routes)/admission/leads/_components/columns.tsx:45-74 (lead)
--   components/learners/lifecycle-status-badge.tsx:19-94 (learner)
BEGIN;

INSERT INTO public.admission_statuses
  (scope, code, label, color, sort_order, is_terminal, is_seat_filled,
   fee_paid_threshold_percent, gates_login)
VALUES
  -- Lead scope (from types/admission.ts FunnelStage union, 26 values)
  ('lead', 'new',                       'New',                       '#3B82F6',  1, false, false, NULL, false),
  ('lead', 'contacted',                 'Contacted',                 '#0EA5E9',  2, false, false, NULL, false),
  ('lead', 'not_reachable',             'Not Reachable',             '#F59E0B',  3, false, false, NULL, false),
  ('lead', 'interested',                'Interested',                '#10B981',  4, false, false, NULL, false),
  ('lead', 'follow_up_scheduled',       'Follow-up Scheduled',       '#06B6D4',  5, false, false, NULL, false),
  ('lead', 'engaged',                   'Engaged',                   '#14B8A6',  6, false, false, NULL, false),
  ('lead', 'qualified',                 'Qualified',                 '#22C55E',  7, false, false, NULL, false),
  ('lead', 'application_started',       'Application Started',       '#A855F7',  8, false, false, NULL, false),
  ('lead', 'application_submitted',     'Application Submitted',     '#8B5CF6',  9, false, false, NULL, false),
  ('lead', 'documents_pending',         'Documents Pending',         '#F97316', 10, false, false, NULL, false),
  ('lead', 'documents_verified',        'Documents Verified',        '#84CC16', 11, false, false, NULL, false),
  ('lead', 'interview_scheduled',       'Interview Scheduled',       '#6366F1', 12, false, false, NULL, false),
  ('lead', 'interview_completed',       'Interview Completed',       '#4F46E5', 13, false, false, NULL, false),
  ('lead', 'offer_sent',                'Offer Sent',                '#EC4899', 14, false, false, NULL, false),
  ('lead', 'offer_accepted',            'Offer Accepted',            '#16A34A', 15, false, false, NULL, false),
  ('lead', 'token_paid',                'Token Paid',                '#15803D', 16, false, false, NULL, false),
  ('lead', 'applied',                   'Applied',                   '#7C3AED', 17, false, false, NULL, false),
  ('lead', 'interviewed',               'Interviewed',               '#4338CA', 18, false, false, NULL, false),
  ('lead', 'offered',                   'Offered',                   '#DB2777', 19, false, false, NULL, false),
  ('lead', 'enrolled',                  'Enrolled',                  '#059669', 20, true,  false, NULL, false),
  ('lead', 'confirmed',                 'Confirmed',                 '#047857', 21, true,  false, NULL, false),
  ('lead', 'declined',                  'Declined',                  '#DC2626', 22, true,  false, NULL, false),
  ('lead', 'withdrew',                  'Withdrew',                  '#B91C1C', 23, true,  false, NULL, false),
  ('lead', 'expired',                   'Expired',                   '#991B1B', 24, true,  false, NULL, false),
  ('lead', 'lost',                      'Lost',                      '#7F1D1D', 25, true,  false, NULL, false),
  ('lead', 'dormant',                   'Dormant',                   '#52525B', 26, true,  false, NULL, false),

  -- Learner scope (from public.lifecycle_status ENUM, 11 values)
  ('learner', 'admitted',   'Admitted',   '#3B82F6',  1, false, false, NULL,    false),
  ('learner', 'pending',    'Pending',    '#F59E0B',  2, false, false, NULL,    false),
  ('learner', 'approved',   'Approved',   '#10B981',  3, false, false, NULL,    false),
  ('learner', 'account',    'Account',    '#8B5CF6',  4, false, false, NULL,    false),
  ('learner', 'rejected',   'Rejected',   '#EF4444',  5, true,  false, NULL,    false),
  ('learner', 'waitlisted', 'Waitlisted', '#F59E0B',  6, false, false, NULL,    false),
  ('learner', 'active',     'Active',     '#22C55E',  7, false, true,  60.00,   true),   -- THE GATE
  ('learner', 'inactive',   'Inactive',   '#9CA3AF',  8, false, false, NULL,    false),
  ('learner', 'exited',     'Exited',     '#DC2626',  9, true,  false, NULL,    false),
  ('learner', 'graduated',  'Graduated',  '#0EA5E9', 10, true,  false, NULL,    false),
  ('learner', 'alumni',     'Alumni',     '#0369A1', 11, true,  false, NULL,    false);

COMMIT;
