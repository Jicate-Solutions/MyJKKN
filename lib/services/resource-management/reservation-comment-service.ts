// lib/services/resource-management/reservation-comment-service.ts
//
// The conversation on a resource booking: an approver says why the request is
// still pending ("the hall needs the principal's sign-off", "attach the event
// order"), and the person who raised the booking replies once they have done
// it.
//
// NOT the same thing as resource_approvals.comments, which the Activity
// Timeline already renders. That field is written ONCE, at the moment a request
// is approved or rejected. It cannot carry a reply and it cannot be used while
// the request is still pending — which is precisely when the booker needs to be
// told something.
//
// Writes go DIRECT through the browser Supabase client. RLS
// (fn_can_read_reservation_comments) and the column guards
// (trg_reservation_comments_guard) are the authority; routing through a
// service-role API route would bypass both and leave the rule living only in a
// React component.
//
// The thread SHAPE is shared with the event review thread
// (lib/services/shared/comment-threads.ts). The AUTHORITY is not: this thread
// exists to REACH the person it is about, and that one exists to stay hidden
// from them.
//
// See supabase/migrations/20261129090000_resource_reservation_comments.sql.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import {
  commentWriteMessage,
  compareThreads,
  groupIntoThreads,
  threadSelectColumns,
  toThreadComment,
} from '@/lib/services/shared/comment-threads';
import type { RawThreadRow, ThreadComment } from '@/lib/services/shared/comment-threads';

const MOD = 'resource-management/reservation-comments';
const TABLE = 'resource_reservation_comments';
const SELECT_COLUMNS = threadSelectColumns(TABLE);

/** A comment on a booking, i.e. a thread comment that knows which booking. */
export interface ReservationComment extends ThreadComment {
  reservation_id: string;
  replies: ReservationComment[];
}

export interface CreateReservationCommentDto {
  reservation_id: string;
  body: string;
  /** Omit for a new thread; pass a ROOT comment's id to reply to it. */
  parent_id?: string | null;
}

interface RawRow extends RawThreadRow {
  reservation_id: string;
}

const toComment = (row: RawRow) => toThreadComment(row) as ReservationComment;

export class ReservationCommentService {
  private static supabase = createClientSupabaseClient();

  /**
   * Every comment on the booking, as threads.
   *
   * A viewer with no read grant gets [] — RLS filters SELECT silently rather
   * than raising. That matters more here than on the event thread: the
   * reservation row itself is readable by everyone in the institution, so
   * people who can open this page legitimately have no business in its
   * correspondence, and they get an absent card rather than an error.
   */
  static async listThreads(reservationId: string): Promise<ReservationComment[]> {
    try {
      const { data, error } = await (this.supabase as any)
        .from(TABLE)
        .select(SELECT_COLUMNS)
        .eq('reservation_id', reservationId)
        .order('created_at', { ascending: true });

      if (error) {
        logger.error(MOD, 'Failed to list reservation comments', { reservationId, error });
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
   * author_id is left unset on purpose: the column defaults to auth.uid() and
   * the INSERT policy pins it there, so sending it would add the one field
   * worth tampering with.
   */
  static async createComment(dto: CreateReservationCommentDto): Promise<ReservationComment> {
    const body = dto.body.trim();
    if (!body) throw new Error('Write something before posting.');

    try {
      const { data, error } = await (this.supabase as any)
        .from(TABLE)
        .insert([{ reservation_id: dto.reservation_id, parent_id: dto.parent_id ?? null, body }])
        .select(SELECT_COLUMNS)
        .single();

      if (error) {
        logger.error(MOD, 'Failed to create reservation comment', {
          reservationId: dto.reservation_id,
          isReply: !!dto.parent_id,
          error,
        });
        throw new Error(
          commentWriteMessage(error, dto.parent_id ? 'reply here' : 'comment on this reservation'),
        );
      }

      return toComment(data as RawRow);
    } catch (error) {
      logger.error(MOD, 'Unexpected error in createComment', error);
      throw error;
    }
  }

  /** Edit your own words. The trigger refuses anyone else, admin or not. */
  static async updateBody(id: string, body: string): Promise<ReservationComment> {
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
        logger.error(MOD, 'Failed to edit reservation comment', { id, error });
        throw new Error(commentWriteMessage(error, 'edit this comment'));
      }
      return toComment(data as RawRow);
    } catch (error) {
      logger.error(MOD, 'Unexpected error in updateBody', error);
      throw error;
    }
  }

  /**
   * Close or reopen a thread — "the blocker I raised is cleared".
   *
   * `.is('parent_id', null)` scopes this to roots so it can never be pointed at
   * a reply. resolved_by / resolved_at are NOT sent: the trigger stamps them
   * from the session, so the closure is always credited to whoever actually
   * pressed the button.
   */
  static async setResolved(id: string, resolved: boolean): Promise<ReservationComment> {
    try {
      const { data, error } = await (this.supabase as any)
        .from(TABLE)
        .update({ is_resolved: resolved })
        .eq('id', id)
        .is('parent_id', null)
        .select(SELECT_COLUMNS)
        .single();

      if (error) {
        logger.error(MOD, 'Failed to change reservation comment resolution', {
          id,
          resolved,
          error,
        });
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
   * Remove your own comment. Deleting a root takes its replies with it.
   *
   * `.select('id')` is load-bearing: a DELETE that RLS refuses does not raise —
   * PostgREST reports success having removed nothing, so without reading the
   * deleted rows back the user would see "Comment deleted" and watch it
   * reappear on the next refetch.
   */
  static async deleteComment(id: string): Promise<void> {
    try {
      const { data, error } = await (this.supabase as any)
        .from(TABLE)
        .delete()
        .eq('id', id)
        .select('id');

      if (error) {
        logger.error(MOD, 'Failed to delete reservation comment', { id, error });
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
