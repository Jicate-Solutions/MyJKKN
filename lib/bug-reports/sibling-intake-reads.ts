/**
 * Lookups shared by GET /api/v1/public/bug-reports/[id] and its /messages.
 *
 * A bug is found only when it belongs to the key's app AND to the given
 * reporter, in one query; a miss on either is the same `null`, so a caller
 * cannot tell "exists but not yours" from "does not exist".
 */
import type { createServiceRoleClient } from '@/lib/supabase/server';
import { REPORTER_BUG_SELECT, isUuid } from '@/lib/bug-reports/sibling-intake';

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

export async function findReporterBug(
  supabase: ServiceClient,
  bugId: string,
  appId: string,
  reporterEmail: string
): Promise<{ bug: Record<string, unknown> | null; error: unknown }> {
  if (!isUuid(bugId)) return { bug: null, error: null };
  const { data, error } = await supabase
    .from('bug_reports')
    .select(`${REPORTER_BUG_SELECT}, reporter_user_id`)
    .eq('id', bugId)
    .eq('application_id', appId)
    .eq('metadata->>reporter_email', reporterEmail)
    .maybeSingle();
  return { bug: (data as Record<string, unknown> | null) ?? null, error };
}

/**
 * The conversation on one bug as its reporter may see it, from MyJKKN's own
 * bug_report_messages (the thread the admin bug page writes). Internal notes
 * and deleted messages are left out. Who wrote each message is reduced to
 * 'reporter' or 'team': no sender id, name, email or role leaves here.
 */
export async function fetchReporterMessages(
  supabase: ServiceClient,
  bug: Record<string, unknown>
): Promise<{ messages: Record<string, unknown>[]; error: unknown }> {
  const { data, error } = await supabase
    .from('bug_report_messages')
    .select('id, bug_report_id, message_text, message_type, sender_user_id, created_at')
    .eq('bug_report_id', bug.id as string)
    .eq('is_internal', false)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });

  if (error) return { messages: [], error };
  const reporterUserId = (bug.reporter_user_id as string | null) ?? null;
  const messages = ((data ?? []) as Record<string, unknown>[]).map((m) => ({
    id: m.id,
    bug_report_id: m.bug_report_id,
    message_text: m.message_text,
    message_type: m.message_type ?? 'text',
    author_kind: reporterUserId && m.sender_user_id === reporterUserId ? 'reporter' : 'team',
    created_at: m.created_at,
  }));
  return { messages, error: null };
}
