/**
 * Parent Portal — fan-out push to the parents of a set of learners.
 *
 * The account model is per-learner (pp_parent_accounts.learner_profile_id), so
 * given the learner ids a piece of content targets we look up the matching
 * accounts and call notifyParent() for each (which logs + web-pushes).
 *
 * Server-only. Used by the staff create routes (announcements / homework /
 * achievements). Failures are the caller's to swallow — a push problem must
 * never fail content creation.
 */
import { createServiceRoleClient } from '@/lib/supabase/server';
import { notifyParent } from './notify-parent';

/** Plain-text squeeze for push bodies (server-safe — no Tiptap import). */
export function htmlToText(html?: string | null): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|li|div|h[1-6])>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
    .replace(/\s+/g, ' ')
    .trim();
}

const MAX_LEARNERS = 5000; // safety cap for institution-wide fan-out
const CHUNK = 20; // limit concurrent notifyParent() calls

export interface NotifyParentsInput {
  institutionsId: string;
  learnerIds: string[];
  title: string;
  body?: string;
  category?: string;
  actionUrl?: string;
}

export async function notifyParentsOfLearners(
  input: NotifyParentsInput
): Promise<{ accounts: number; sent: number }> {
  const learnerIds = Array.from(new Set(input.learnerIds.filter(Boolean))).slice(0, MAX_LEARNERS);
  if (!learnerIds.length) return { accounts: 0, sent: 0 };

  const db = createServiceRoleClient();
  const { data: accounts } = await db
    .from('pp_parent_accounts')
    .select('id, learner_profile_id')
    .in('learner_profile_id', learnerIds);
  if (!accounts?.length) return { accounts: 0, sent: 0 };

  let sent = 0;
  for (let i = 0; i < accounts.length; i += CHUNK) {
    const slice = accounts.slice(i, i + CHUNK);
    const results = await Promise.all(
      slice.map((acc) =>
        notifyParent({
          parentAccountId: acc.id as string,
          institutionsId: input.institutionsId,
          title: input.title,
          body: input.body,
          category: input.category,
          actionUrl: input.actionUrl,
          learnerProfileId: (acc.learner_profile_id as string | null) ?? undefined,
        }).catch(() => ({ logged: false, sent: 0, pruned: 0 }))
      )
    );
    sent += results.reduce((n, r) => n + r.sent, 0);
  }
  return { accounts: accounts.length, sent };
}
