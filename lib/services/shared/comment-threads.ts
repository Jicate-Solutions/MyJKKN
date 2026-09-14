// lib/services/shared/comment-threads.ts
//
// The parts of a two-level comment thread that have nothing to do with WHICH
// thing is being commented on: turning PostgREST rows into comments, grouping
// replies under their root, ordering threads, and translating a refused write
// into the rule that refused it.
//
// Two features use this shape and they are NOT the same feature:
//
//   event_review_comments           — a reviewing authority's remark on an event
//                                     and the coordinator's reply. Invisible to
//                                     students.
//   resource_reservation_comments   — an approver's note on a room booking
//                                     ("pending, you still have to…") and the
//                                     booker's reply. Visible to the booker by
//                                     design — that is the entire point.
//
// Their AUTHORITY rules are therefore opposite in spirit and each lives in its
// own SQL function and its own service. What they genuinely share is the shape
// of a thread, and that is all that lives here. Resist the pull to grow this
// into one "comments engine" with a table name parameter: the moment the two
// gates need to differ (they already do) that engine becomes a place where one
// feature's change silently alters the other's.

/** A person as a thread renders them. */
export interface ThreadCommentAuthor {
  id: string;
  name: string;
  /** Legacy profiles.role, shown as a chip so "who is telling me this" is visible. */
  role: string | null;
}

/** One comment, with its author resolved and its replies attached (roots only). */
export interface ThreadComment {
  id: string;
  parent_id: string | null;
  author_id: string;
  body: string;
  is_resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  author: ThreadCommentAuthor;
  /** Display name of whoever closed the thread; null while it is open. */
  resolved_by_name: string | null;
  /** Oldest first. Always [] on a reply — the shape is two levels deep only. */
  replies: ThreadComment[];
}

/** What a row looks like before the embeds are flattened away. */
export interface RawThreadRow {
  id: string;
  parent_id: string | null;
  author_id: string;
  body: string;
  is_resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  author?: { id: string; full_name: string | null; role: string | null } | null;
  resolver?: { full_name: string | null } | null;
}

/**
 * The PostgREST select for a comment table.
 *
 * The embeds name their FK CONSTRAINTS explicitly. Two columns on each of these
 * tables point at `profiles`, so an unqualified `profiles(...)` embed is
 * ambiguous and PostgREST refuses the whole query rather than guessing which
 * one was meant.
 */
export function threadSelectColumns(table: string): string {
  return `
    *,
    author:profiles!${table}_author_id_fkey (id, full_name, role),
    resolver:profiles!${table}_resolved_by_fkey (full_name)
  `;
}

/**
 * Flatten the embeds away rather than spreading them through. An `author`
 * object left on the row would give every consumer a second, undeclared path to
 * the same name and let the two drift.
 *
 * A missing author embed is not a crash: `profiles` rows are deletable and the
 * FK cascades, but a race or a role change can still hand back null. Say
 * "Unknown" rather than rendering an empty chip.
 */
export function toThreadComment<T extends RawThreadRow>(row: T): ThreadComment & Omit<T, 'author' | 'resolver'> {
  const { author, resolver, ...rest } = row;
  return {
    ...(rest as Omit<T, 'author' | 'resolver'>),
    author: {
      id: author?.id ?? rest.author_id,
      name: author?.full_name?.trim() || 'Unknown',
      role: author?.role ?? null,
    },
    resolved_by_name: resolver?.full_name?.trim() || null,
    replies: [],
  } as ThreadComment & Omit<T, 'author' | 'resolver'>;
}

/**
 * Rows → threads. Roots keep their document order (oldest first, as fetched);
 * every reply is filed under its root in the same order.
 *
 * A reply whose root is missing from the result is kept as a root of its own
 * rather than dropped. That cannot happen through either UI — a flat-shape
 * trigger and a cascade see to it — but silently swallowing a comment because
 * of a data oddity is how a remark goes unanswered.
 */
export function groupIntoThreads<T extends ThreadComment>(rows: T[]): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const roots: T[] = [];

  for (const row of rows) {
    const parent = row.parent_id ? byId.get(row.parent_id) : undefined;
    if (parent && parent.id !== row.id) {
      parent.replies.push(row);
    } else {
      roots.push(row);
    }
  }

  return roots;
}

/**
 * Open threads before closed ones, and within each group the most recently
 * ACTIVE thread first — a thread whose last reply landed this morning matters
 * more than one opened last month and never answered.
 */
export function compareThreads(a: ThreadComment, b: ThreadComment): number {
  if (a.is_resolved !== b.is_resolved) return a.is_resolved ? 1 : -1;
  const lastActivity = (t: ThreadComment) =>
    t.replies.length ? t.replies[t.replies.length - 1].created_at : t.created_at;
  return lastActivity(a) < lastActivity(b) ? 1 : -1;
}

/**
 * Turn a refusal into the rule that produced it.
 *
 * Four shapes arrive here and only one of them is self-explanatory:
 *   • 42501 raised BY A GUARD TRIGGER carries a written sentence ("Only the
 *     person who raised this comment…") — pass that straight through, it is
 *     already the best available answer.
 *   • 42501 from RLS itself says "new row violates row-level security policy",
 *     which tells the person who pressed the button nothing.
 *   • PGRST116 ("0 rows") is how an UPDATE or DELETE whose USING clause
 *     filtered the row away comes back. Not an error to PostgREST; a refusal to
 *     the user.
 *   • 23514 on the length CHECK is the one constraint a user can actually trip.
 */
export function commentWriteMessage(
  error: { code?: string; message?: string },
  verb: string,
): string {
  const message = error?.message ?? '';

  // A trigger's own sentence is already specific — do not overwrite it.
  if (error?.code === '42501' && message && !/row-level security/i.test(message)) {
    return message;
  }

  if (
    error?.code === '42501' ||
    error?.code === 'PGRST116' ||
    /row-level security/i.test(message)
  ) {
    return `You do not have permission to ${verb}.`;
  }

  if (error?.code === '23514' && /body_length/i.test(message)) {
    return 'A comment has to be between 1 and 4000 characters.';
  }

  return message || 'The comment could not be saved.';
}

/** The shared body limit, matching the CHECK on both tables. */
export const MAX_COMMENT_BODY = 4000;
