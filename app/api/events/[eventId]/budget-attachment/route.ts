export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST   /api/events/[eventId]/budget-attachment   multipart: item_id, file
// DELETE /api/events/[eventId]/budget-attachment?item_id=…
//
// One attachment (bill / quotation / receipt) per budget line, stored on Google
// Drive (BUG-004627). The Drive write needs the service account, but WHO may
// attach is decided by the database, not here: the line is read and written
// through the CALLER's session client, so event_budget_items' RLS and the
// budget lock trigger (fn_guard_event_budget_locked) apply exactly as they do
// to every other edit on the Budget board. If that write is refused, the file
// just uploaded is deleted again so Drive does not collect orphans.

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getAuthUser } from '@/lib/supabase/server';
import { isDriveConfigured } from '@/lib/google/drive-client';
import { deleteDriveFile, uploadEventBudgetAttachment } from '@/lib/google/drive-upload';
import { budgetAttachmentError } from '@/lib/utils/events/budget-attachment';

type Params = { params: Promise<{ eventId: string }> };

type LineRow = { id: string; receipt_drive_file_id: string | null };

/** The line, as the caller's own session sees it — null when not visible. */
async function loadLine(supabase: any, eventId: string, itemId: string): Promise<LineRow | null> {
  const { data } = await supabase
    .from('event_budget_items')
    .select('id, receipt_drive_file_id')
    .eq('id', itemId)
    .eq('event_id', eventId)
    .maybeSingle();
  return (data as LineRow | null) ?? null;
}

const REFUSED =
  "You can't change this budget line's attachment — you may not have edit rights on this event's budget, or its books are closed.";

export async function POST(request: NextRequest, { params }: Params) {
  const { eventId } = await params;

  const { user } = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isDriveConfigured()) {
    return NextResponse.json(
      { error: 'File uploads are not configured on the server.' },
      { status: 503 }
    );
  }

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });

  const file = form.get('file');
  const itemId = form.get('item_id')?.toString();
  if (!itemId) return NextResponse.json({ error: 'item_id is required' }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided.' }, { status: 400 });

  const invalid = budgetAttachmentError(file);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const supabase = (await createServerSupabaseClient()) as any;
  const line = await loadLine(supabase, eventId, itemId);
  if (!line) return NextResponse.json({ error: 'Budget line not found.' }, { status: 404 });

  const { data: event } = await supabase.from('events').select('name').eq('id', eventId).maybeSingle();

  let uploaded;
  try {
    uploaded = await uploadEventBudgetAttachment({
      eventId,
      eventName: (event?.name as string) ?? 'Event',
      file,
    });
  } catch (err) {
    console.error('[budget-attachment] Drive upload failed:', err);
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 });
  }

  // An RLS refusal filters the UPDATE to 0 rows; the lock trigger raises.
  // Either way, no returned row = not saved.
  const { data: saved, error } = await supabase
    .from('event_budget_items')
    .update({
      receipt_url: uploaded.url,
      receipt_drive_file_id: uploaded.driveFileId,
      receipt_name: uploaded.name,
    })
    .eq('id', itemId)
    .eq('event_id', eventId)
    .select('id, receipt_url, receipt_drive_file_id, receipt_name')
    .maybeSingle();

  if (error || !saved) {
    await deleteDriveFile(uploaded.driveFileId);
    if (error) console.error('[budget-attachment] save refused:', error);
    return NextResponse.json({ error: error?.message || REFUSED }, { status: 403 });
  }

  // Replacing an attachment: the previous file is no longer referenced.
  if (line.receipt_drive_file_id && line.receipt_drive_file_id !== uploaded.driveFileId) {
    await deleteDriveFile(line.receipt_drive_file_id);
  }

  return NextResponse.json(saved);
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { eventId } = await params;

  const { user } = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const itemId = request.nextUrl.searchParams.get('item_id');
  if (!itemId) return NextResponse.json({ error: 'item_id is required' }, { status: 400 });

  const supabase = (await createServerSupabaseClient()) as any;
  const line = await loadLine(supabase, eventId, itemId);
  if (!line) return NextResponse.json({ error: 'Budget line not found.' }, { status: 404 });

  const { data: saved, error } = await supabase
    .from('event_budget_items')
    .update({ receipt_url: null, receipt_drive_file_id: null, receipt_name: null })
    .eq('id', itemId)
    .eq('event_id', eventId)
    .select('id')
    .maybeSingle();

  if (error || !saved) {
    if (error) console.error('[budget-attachment] remove refused:', error);
    return NextResponse.json({ error: error?.message || REFUSED }, { status: 403 });
  }

  if (line.receipt_drive_file_id) await deleteDriveFile(line.receipt_drive_file_id);
  return NextResponse.json({ ok: true });
}
