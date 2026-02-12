-- Migration: Fix LC FK constraints to reference profiles instead of auth.users
-- Date: 2026-02-12
-- Purpose: PostgREST joins like profiles!lc_announcements_created_by_fkey(...)
--          require FK constraints pointing to profiles, not auth.users.
--          Without this fix, all LC service queries that join to profiles return empty.

-- Step 1: Drop all 28 FK constraints pointing to auth.users
ALTER TABLE lc_announcement_reads DROP CONSTRAINT IF EXISTS lc_announcement_reads_user_id_fkey;
ALTER TABLE lc_announcements DROP CONSTRAINT IF EXISTS lc_announcements_created_by_fkey;
ALTER TABLE lc_announcements DROP CONSTRAINT IF EXISTS lc_announcements_reviewed_by_fkey;
ALTER TABLE lc_chat_channels DROP CONSTRAINT IF EXISTS lc_chat_channels_created_by_fkey;
ALTER TABLE lc_chat_members DROP CONSTRAINT IF EXISTS lc_chat_members_user_id_fkey;
ALTER TABLE lc_chat_messages DROP CONSTRAINT IF EXISTS lc_chat_messages_sender_id_fkey;
ALTER TABLE lc_election_votes DROP CONSTRAINT IF EXISTS lc_election_votes_voter_id_fkey;
ALTER TABLE lc_elections DROP CONSTRAINT IF EXISTS lc_elections_created_by_fkey;
ALTER TABLE lc_event_approvals DROP CONSTRAINT IF EXISTS lc_event_approvals_approver_id_fkey;
ALTER TABLE lc_event_participants DROP CONSTRAINT IF EXISTS lc_event_participants_user_id_fkey;
ALTER TABLE lc_events DROP CONSTRAINT IF EXISTS lc_events_proposed_by_fkey;
ALTER TABLE lc_forum_posts DROP CONSTRAINT IF EXISTS lc_forum_posts_author_id_fkey;
ALTER TABLE lc_forum_posts DROP CONSTRAINT IF EXISTS lc_forum_posts_moderated_by_fkey;
ALTER TABLE lc_forum_reactions DROP CONSTRAINT IF EXISTS lc_forum_reactions_user_id_fkey;
ALTER TABLE lc_forum_topics DROP CONSTRAINT IF EXISTS lc_forum_topics_created_by_fkey;
ALTER TABLE lc_interviews DROP CONSTRAINT IF EXISTS lc_interviews_interviewer_id_fkey;
ALTER TABLE lc_members DROP CONSTRAINT IF EXISTS lc_members_user_id_fkey;
ALTER TABLE lc_nominations DROP CONSTRAINT IF EXISTS lc_nominations_nominee_id_fkey;
ALTER TABLE lc_nominations DROP CONSTRAINT IF EXISTS lc_nominations_reviewed_by_fkey;
ALTER TABLE lc_notification_preferences DROP CONSTRAINT IF EXISTS lc_notification_preferences_user_id_fkey;
ALTER TABLE lc_notifications DROP CONSTRAINT IF EXISTS lc_notifications_user_id_fkey;
ALTER TABLE lc_od_approval_chains DROP CONSTRAINT IF EXISTS lc_od_approval_chains_created_by_fkey;
ALTER TABLE lc_od_approvals DROP CONSTRAINT IF EXISTS lc_od_approvals_approver_id_fkey;
ALTER TABLE lc_od_requests DROP CONSTRAINT IF EXISTS lc_od_requests_requester_id_fkey;
ALTER TABLE lc_poll_votes DROP CONSTRAINT IF EXISTS lc_poll_votes_user_id_fkey;
ALTER TABLE lc_polls DROP CONSTRAINT IF EXISTS lc_polls_created_by_fkey;
ALTER TABLE lc_position_history DROP CONSTRAINT IF EXISTS lc_position_history_user_id_fkey;
ALTER TABLE lc_terms DROP CONSTRAINT IF EXISTS lc_terms_created_by_fkey;

-- Step 2: Recreate all 28 FK constraints pointing to profiles(id)
ALTER TABLE lc_announcement_reads ADD CONSTRAINT lc_announcement_reads_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE lc_announcements ADD CONSTRAINT lc_announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE lc_announcements ADD CONSTRAINT lc_announcements_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE lc_chat_channels ADD CONSTRAINT lc_chat_channels_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE lc_chat_members ADD CONSTRAINT lc_chat_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE lc_chat_messages ADD CONSTRAINT lc_chat_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE lc_election_votes ADD CONSTRAINT lc_election_votes_voter_id_fkey FOREIGN KEY (voter_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE lc_elections ADD CONSTRAINT lc_elections_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE lc_event_approvals ADD CONSTRAINT lc_event_approvals_approver_id_fkey FOREIGN KEY (approver_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE lc_event_participants ADD CONSTRAINT lc_event_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE lc_events ADD CONSTRAINT lc_events_proposed_by_fkey FOREIGN KEY (proposed_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE lc_forum_posts ADD CONSTRAINT lc_forum_posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE lc_forum_posts ADD CONSTRAINT lc_forum_posts_moderated_by_fkey FOREIGN KEY (moderated_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE lc_forum_reactions ADD CONSTRAINT lc_forum_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE lc_forum_topics ADD CONSTRAINT lc_forum_topics_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE lc_interviews ADD CONSTRAINT lc_interviews_interviewer_id_fkey FOREIGN KEY (interviewer_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE lc_members ADD CONSTRAINT lc_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE lc_nominations ADD CONSTRAINT lc_nominations_nominee_id_fkey FOREIGN KEY (nominee_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE lc_nominations ADD CONSTRAINT lc_nominations_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE lc_notification_preferences ADD CONSTRAINT lc_notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE lc_notifications ADD CONSTRAINT lc_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE lc_od_approval_chains ADD CONSTRAINT lc_od_approval_chains_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE lc_od_approvals ADD CONSTRAINT lc_od_approvals_approver_id_fkey FOREIGN KEY (approver_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE lc_od_requests ADD CONSTRAINT lc_od_requests_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE lc_poll_votes ADD CONSTRAINT lc_poll_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE lc_polls ADD CONSTRAINT lc_polls_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE lc_position_history ADD CONSTRAINT lc_position_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE lc_terms ADD CONSTRAINT lc_terms_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
