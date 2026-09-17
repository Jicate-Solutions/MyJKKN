// lib/services/events/shared/event-review-comment-service.ts
//
// The internal review thread on an event: a reviewing authority's remark
// ("this isn't finished", "you need a hospitality committee", "nobody has
// registered") and the coordinator's reply underneath.
//
// Writes go DIRECT through the browser Supabase client, never through an API
// route with a service-role key. That is the same deliberate choice
// EventTaskService documents and the opposite of EventCommitteeService, which
// posts to /api/events/marathon/[eventId]/committees and so checks only that
// the caller is logged in. Here the authority rule IS the feature: RLS
// (fn_can_read_event_review_comments) and the column guards
// (trg_event_review_comments_guard) are what keep a learner out of the thread
// and keep a coordinator from closing their own homework. Routing through a
// service-role endpoint would throw all of that away and leave the rule living
// only in a React component — enforced until somebody opens devtools.
//
// The thread SHAPE (grouping, ordering, error translation) lives in
// lib/services/shared/comment-threads.ts, shared with the reservation thread.
// The AUTHORITY does not and must not: see that file's header.
//
// See supabase/migrations/20261128090000_event_review_comments.sql.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import {
  commentWriteMessage,
  compareThreads,
  groupIntoThreads,
  threadSelectColumns,
  toTagPeopleResult,
  toThreadComment,
  toThreadMentions,
} from '@/lib/services/shared/comment-threads';
import type {
  RawThreadMention,
  RawThreadRow,
  TagPeopleResult,
  ThreadComment,
} from '@/lib/services/shared/comment-threads';

const MOD = 'events/review-comments';
const TABLE = 'event_review_comments';
// The tag embed is appended HERE, not in threadSelectColumns(): tagging is an
// event-review feature, and the reservation thread shares that helper. The FK
// constraint is named because mentions reference profiles twice.
const SELECT_COLUMNS = `${threadSelectColumns(TABLE)},
    mentions:event_review_comment_mentions (
      mentioned_user_id,
      notified_at,
      person:profiles!event_review_comment_mentions_mentioned_user_id_fkey (full_name)
    )`;

/** A comment on an event, i.e. a thread comment that knows which event it is on. */
export interface EventReviewComment extends ThreadComment {
  event_id: string;
  replies: EventReviewComment[];
}

export interface CreateReviewCommentDto {
  event_id: string;
  body: string;
  /** Omit for a new thread; pass a ROOT comment's id to reply to it. */
  parent_id?: string | null;
}

interface RawRow extends RawThreadRow {
  event_id: string;
  mentions?: RawThreadMention[] | null;
}

const toComment = (row: RawRow): EventReviewComment => {
  const { mentions, ...rest } = row;
  // Via unknown: the raw `mentions` shape is stripped above and the resolved
  // one assigned below, which TS cannot follow through toThreadComment's generic.
  const comment = toThreadComment(rest) as unknown as EventReviewComment;
  comment.mentions = toThreadMentions(mentions);
  return comment;
};

export type { TagPeopleResult };

export class EventReviewCommentService {
  private static supabase = createClientSupabaseClient();

  /**
   * Every review comment on the event, as threads.
   *
   * A viewer with no read grant simply gets [] — RLS filters SELECT silently
   * rather than raising — which is the right outcome here: an empty card, not
   * an error panel. The card is hidden from them anyway.
   */
  static async listThreads(eventId: string): Promise<EventReviewComment[]> {
    try {
      const { data, error } = await (this.supabase as any)
        .from(TABLE)
        .select(SELECT_COLUMNS)
        .eq('event_id', eventId)
        .order('created_at', { ascending: true });

      if (error) {
        logger.error(MOD, 'Failed to list review comments', { eventId, error });
        throw error;
      }

      const rows = ((data as RawRow[]) ?? []).map(toComment);
      return groupIntoThreads(rows).sort(compareThreads);
    } catch (error) {
      logger.error(MOD, 'Unexpected error in listThreads', error);
      throw error;
    }
  }

  /**
   * Post a comment, or a reply when parent_id is given.
   *
   * author_id is left unset on purpose. The column defaults to auth.uid() and
   * the INSERT policy pins it there, so sending it from here would add a value
   * the database is about to check against the session anyway — and would be
   * the one field worth tampering with.
   */
  static async createComment(dto: CreateReviewCommentDto): Promise<EventReviewComment> {
    const body = dto.body.trim();
    if (!body) throw new Error('Write something before posting.');

    try {
      const { data, error } = await (this.supabase as any)
        .from(TABLE)
        .insert([{ event_id: dto.event_id, parent_id: dto.parent_id ?? null, body }])
        .select(SELECT_COLUMNS)
        .single();

      if (error) {
        logger.error(MOD, 'Failed to create review comment', {
          eventId: dto.event_id,
          isReply: !!dto.parent_id,
          error,
        });
        throw new Error(
          commentWriteMessage(error, dto.parent_id ? 'reply here' : 'comment on this event'),
        );
      }

      return toComment(data as RawRow);
    } catch (error) {
      logger.error(MOD, 'Unexpected error in createComment', error);
      throw error;
    }
  }

  /**
   * Tag team members on a comment you wrote, and notify them. Also the
   * author's Resend: re-tagging someone finishes an alert that failed, or
   * sends a reminder.
   *
   * Goes through /api/events/[eventId]/review-mentions rather than a direct
   * insert, but only because the NOTIFICATION needs a service-role client. The
   * tag itself is still written with the caller's session inside that route, so
   * RLS and the guard trigger remain the authority on who may tag whom.
   */
  static async tagPeople(eventId: string, commentId: string, userIds: string[]): Promise<TagPeopleResult> {
    const res = await fetch(`/api/events/${eventId}/review-mentions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment_id: commentId, user_ids: userIds }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) {
      // A non-JSON answer is almost always a 404 page (route not deployed, or a
      // dev server started before the route existed) or a crash page. Say which,
      // with the status — an empty "{}" in the console helped nobody.
      const reason =
        json?.error ??
        (res.status === 404
          ? 'the tagging service was not found (HTTP 404) — restart the dev server or redeploy'
          : `the server answered HTTP ${res.status}`);
      logger.error(MOD, `Tagging failed: ${reason}`, {
        eventId,
        commentId,
        status: String(res.status),
      });
      throw new Error(reason);
    }
    return toTagPeopleResult(json);
  }

  /** Edit your own words. The trigger refuses anyone else, admin or not. */
  static async updateBody(id: string, body: string): Promise<EventReviewComment> {
    const next = body.trim();
    if (!next) throw new Error('A comment cannot be emptied — delete it instead.');

    try {
      const { data, error } = await (this.supabase as any)
        .from(TABLE)
        .update({ body: next })
        .eq('id', id)
        .select(SELECT_COLUMNS)
        .single();

      if (error) {
        logger.error(MOD, 'Failed to edit review comment', { id, error });
        throw new Error(commentWriteMessage(error, 'edit this comment'));
      }
      return toComment(data as RawRow);
    } catch (error) {
      logger.error(MOD, 'Unexpected error in updateBody', error);
      throw error;
    }
  }

  /**
   * Close or reopen a thread.
   *
   * `.is('parent_id', null)` scopes this to roots so the method can never be
   * pointed at a reply, even with a valid id. The CHECK constraint would refuse
   * it anyway; the filter turns a confusing constraint violation into an honest
   * "no such thread".
   *
   * resolved_by / resolved_at are NOT sent. The trigger stamps them from the
   * session — a caller who could name their own resolver could credit the
   * closure to anybody.
   */
  static async setResolved(id: string, resolved: boolean): Promise<EventReviewComment> {
    try {
      const { data, error } = await (this.supabase as any)
        .from(TABLE)
        .update({ is_resolved: resolved })
        .eq('id', id)
        .is('parent_id', null)
        .select(SELECT_COLUMNS)
        .single();

      if (error) {
        logger.error(MOD, 'Failed to change review comment resolution', { id, resolved, error });
        throw new Error(
          commentWriteMessage(error, resolved ? 'close this thread' : 'reopen this thread'),
        );
      }
      if (!data) throw new Error(commentWriteMessage({ code: 'PGRST116' }, 'close this thread'));

      return toComment(data as RawRow);
    } catch (error) {
      logger.error(MOD, 'Unexpected error in setResolved', error);
      throw error;
    }
  }

  /**
   * Remove one tag from your comment. Deleting the row IS the revocation — the
   * thread's read gate asks whether a tag row exists — and the comment stays.
   * The DELETE policy (comment author or super admin) is the authority, and
   * `.select('id')` is here for the same reason as in deleteComment below.
   */
  static async untag(commentId: string, userId: string): Promise<void> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('event_review_comment_mentions')
        .delete()
        .eq('comment_id', commentId)
        .eq('mentioned_user_id', userId)
        .select('id');

      if (error) {
        logger.error(MOD, 'Failed to untag', {
          commentId,
          userId,
          code: error.code,
          message: error.message,
        });
        throw new Error(commentWriteMessage(error, 'untag people on this comment'));
      }
      if (!((data as unknown[]) ?? []).length) {
        logger.error(MOD, 'Untag removed no rows (RLS or already removed)', { commentId, userId });
        throw new Error(commentWriteMessage({ code: 'PGRST116' }, 'untag people on this comment'));
      }
    } catch (error) {
      logger.error(MOD, 'Unexpected error in untag', { message: (error as Error)?.message });
      throw error;
    }
  }

  /**
   * Remove your own comment. Deleting a root takes its replies with it (ON
   * DELETE CASCADE), which is why the panel asks before doing it.
   *
   * `.select('id')` is load-bearing, not decoration. A DELETE that RLS refuses
   * does not raise — the USING clause filters the row out and PostgREST reports
   * success having removed nothing. Without reading the deleted rows back, a
   * viewer with no grant would see "Comment deleted", watch it reappear on the
   * next refetch, and file a bug.
   */
  static async deleteComment(id: string): Promise<void> {
    try {
      const { data, error } = await (this.supabase as any)
        .from(TABLE)
        .delete()
        .eq('id', id)
        .select('id');

      if (error) {
        logger.error(MOD, 'Failed to delete review comment', { id, error });
        throw new Error(commentWriteMessage(error, 'delete this comment'));
      }
      if (!((data as unknown[]) ?? []).length) {
        logger.error(MOD, 'Delete removed no rows (RLS or missing id)', { id });
        throw new Error(commentWriteMessage({ code: 'PGRST116' }, 'delete this comment'));
      }
    } catch (error) {
      logger.error(MOD, 'Unexpected error in deleteComment', error);
      throw error;
    }
  }
}
