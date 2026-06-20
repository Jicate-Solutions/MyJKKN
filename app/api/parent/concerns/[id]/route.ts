import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveParentScope, parentErrorResponse, ParentAccessError } from '@/lib/utils/parent-access';
import type { ConcernThread, ConcernMessage, Attachment } from '@/types/parent-portal';

export const runtime = 'nodejs';

async function ownConcern(db: ReturnType<typeof createServiceRoleClient>, id: string, parentAccountId: string) {
  const { data } = await db
    .from('pp_concerns')
    .select('id, category, subject, status, priority, created_at, updated_at, parent_account_id')
    .eq('id', id)
    .maybeSingle();
  if (!data) return null;
  if (data.parent_account_id !== parentAccountId) throw new ParentAccessError('Not your concern', 403);
  return data;
}

/** GET /api/parent/concerns/[id] — thread with messages. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const scope = await resolveParentScope(req);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await ctx.params;
    const db = createServiceRoleClient();

    const concern = await ownConcern(db, id, scope.parentAccountId);
    if (!concern) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data: msgs } = await db
      .from('pp_concern_messages')
      .select('id, sender_type, message, attachment_urls, created_at')
      .eq('concern_id', id)
      .order('created_at', { ascending: true });

    const messages: ConcernMessage[] = (msgs ?? []).map((m) => ({
      id: m.id,
      senderType: m.sender_type === 'staff' ? 'staff' : 'parent',
      message: m.message,
      attachmentUrls: Array.isArray(m.attachment_urls) ? (m.attachment_urls as Attachment[]) : [],
      createdAt: m.created_at,
    }));

    const thread: ConcernThread = {
      id: concern.id,
      category: concern.category ?? undefined,
      subject: concern.subject,
      status: concern.status,
      priority: concern.priority,
      createdAt: concern.created_at,
      updatedAt: concern.updated_at,
      messages,
    };
    return NextResponse.json(thread);
  } catch (err) {
    return parentErrorResponse(err);
  }
}

/** POST /api/parent/concerns/[id] — add a parent reply. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const scope = await resolveParentScope(req);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await ctx.params;
    const { message } = (await req.json().catch(() => ({}))) as { message?: string };
    if (!message?.trim()) return NextResponse.json({ error: 'Message required' }, { status: 400 });

    const db = createServiceRoleClient();
    const concern = await ownConcern(db, id, scope.parentAccountId);
    if (!concern) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await db.from('pp_concern_messages').insert({
      concern_id: id,
      sender_type: 'parent',
      sender_id: scope.parentAccountId,
      message: message.trim(),
    });
    // Re-open if a parent replies on a resolved thread.
    await db
      .from('pp_concerns')
      .update({ updated_at: new Date().toISOString(), status: concern.status === 'closed' ? 'closed' : 'open' })
      .eq('id', id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return parentErrorResponse(err);
  }
}
