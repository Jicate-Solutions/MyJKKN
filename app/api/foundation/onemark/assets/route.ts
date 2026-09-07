export const dynamic = 'force-dynamic';

// OneMark Wave 3 Lane D — pictures attached to a one-mark question.
//
//   GET  /api/foundation/onemark/assets?item_id=<uuid>
//        -> 200 { ok: true, assets: [{ id, asset_type, alt_text, sort_order,
//                                      url, expires_in }] }
//        Anyone who may sit a paper (foundation.practice.take) or author one
//        (foundation.items.manage). `url` is a 60-SECOND SIGNED URL — the
//        bucket is private and no public URL is ever minted (Lane D item 3).
//
//   POST /api/foundation/onemark/assets   (multipart/form-data)
//        item_id · alt_text · sort_order? · file
//        -> 201 { ok: true, asset }
//        Gate foundation.items.manage — ruling #4: ANY author may attach, and
//        the approver still ticks the item afterwards.
//
// TWO CLIENTS, ON PURPOSE (the rule load-paper.ts sets): the permission check
// runs on the caller's SESSION client, so the answer is about the real person;
// the table read and the bucket work run on the SERVICE-ROLE client, because
// onemark_question_assets is gated to foundation.items.* (a learner holding
// only practice.take cannot select from it) and because storage RLS is
// bypassed by the service key. The row WRITE goes back through the session
// client, so the table's own write policy — not this route alone — decides.
//
// alt_text is MANDATORY here (ruling #4). Because this route is the only
// writer, an approved item with a picture and no description cannot exist by
// any path the application offers.
//
// CONTRACT DEPENDENCY: the private bucket `onemark-question-assets` is created
// by Lane S3 item 5. Until that migration is applied, an upload answers 503
// "contract pending" and nothing is written — never a silent failure (rule 27).

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { altTextProblem } from '@/lib/onemark/assets/approval';
import {
  ONEMARK_ASSET_BUCKET,
  ONEMARK_ASSET_EXTENSION,
  ONEMARK_ASSET_MAX_BYTES,
  ONEMARK_ASSET_MIME,
  ONEMARK_ASSET_READ_PERMISSION,
  ONEMARK_ASSET_SIGNED_URL_TTL_SECONDS,
  ONEMARK_ASSET_WRITE_PERMISSION,
  uploadableTypeForMime,
} from '@/lib/onemark/assets/constants';
import { sanitiseAssetBytes } from '@/lib/onemark/assets/sanitize';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ASSET_COLUMNS = 'id, item_id, asset_type, storage_path, alt_text, sort_order, created_at, updated_at';

interface AssetRow {
  id: string;
  item_id: string;
  asset_type: string;
  storage_path: string | null;
  alt_text: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** A bucket that does not exist yet reads as a 400/404 from storage-js rather
 *  than a typed error; the message is the only signal. */
export function looksLikeMissingBucket(message: string | null | undefined): boolean {
  const m = (message ?? '').toLowerCase();
  return m.includes('bucket not found') || m.includes('bucket_not_found');
}

export async function GET(request: NextRequest) {
  await connection();
  try {
    const itemId = request.nextUrl.searchParams.get('item_id') ?? '';
    if (!UUID_RE.test(itemId)) {
      return NextResponse.json({ ok: false, error: 'A valid item_id is required' }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const [{ data: canTake }, { data: canManage }] = await Promise.all([
      (supabase as any).rpc('user_has_permission', { permission_name: ONEMARK_ASSET_READ_PERMISSION }),
      (supabase as any).rpc('user_has_permission', { permission_name: ONEMARK_ASSET_WRITE_PERMISSION }),
    ]);
    if (canTake !== true && canManage !== true) {
      return NextResponse.json(
        { ok: false, error: 'You do not have access to the pictures on this question.' },
        { status: 403 },
      );
    }

    const admin = createServiceRoleClient();
    const { data: rows, error } = await (admin as any)
      .from('onemark_question_assets')
      .select(ASSET_COLUMNS)
      .eq('item_id', itemId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) {
      console.error('[GET /api/foundation/onemark/assets]', error.message);
      return NextResponse.json(
        { ok: false, error: 'Could not read the pictures on this question.' },
        { status: 500 },
      );
    }

    const assets = await signAssets(admin, (rows ?? []) as AssetRow[], canManage === true);
    return NextResponse.json({ ok: true, assets });
  } catch (err) {
    console.error('[GET /api/foundation/onemark/assets]', err);
    return NextResponse.json({ ok: false, error: 'Could not read the pictures on this question.' }, { status: 500 });
  }
}

/** Rows + a short-lived signed URL each. A row whose object has gone missing
 *  keeps its alt text and reports `url: null`, so the reader still gets the
 *  description rather than a broken card (ruling #11). */
async function signAssets(admin: any, rows: AssetRow[], includePath: boolean) {
  const paths = rows.map((r) => r.storage_path).filter((p): p is string => !!p);
  const signed = new Map<string, string>();
  if (paths.length > 0) {
    const { data, error } = await admin.storage
      .from(ONEMARK_ASSET_BUCKET)
      .createSignedUrls(paths, ONEMARK_ASSET_SIGNED_URL_TTL_SECONDS);
    if (error) {
      console.warn('[onemark/assets] could not sign asset URLs:', error.message);
    }
    for (const entry of data ?? []) {
      if (entry?.path && entry?.signedUrl) signed.set(entry.path, entry.signedUrl);
    }
  }
  return rows.map((r) => ({
    id: r.id,
    item_id: r.item_id,
    asset_type: r.asset_type,
    alt_text: r.alt_text,
    sort_order: r.sort_order,
    url: r.storage_path ? signed.get(r.storage_path) ?? null : null,
    expires_in: ONEMARK_ASSET_SIGNED_URL_TTL_SECONDS,
    ...(includePath ? { storage_path: r.storage_path } : {}),
  }));
}

export async function POST(request: NextRequest) {
  await connection();
  let objectPath: string | null = null;
  let admin: any = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { data: canManage } = await (supabase as any).rpc('user_has_permission', {
      permission_name: ONEMARK_ASSET_WRITE_PERMISSION,
    });
    if (canManage !== true) {
      return NextResponse.json(
        { ok: false, error: 'Only a question author can attach a picture to a question.' },
        { status: 403 },
      );
    }

    const form = await request.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ ok: false, error: 'Expected a file upload' }, { status: 400 });
    }
    const itemId = String(form.get('item_id') ?? '');
    const altText = String(form.get('alt_text') ?? '').trim();
    const sortRaw = form.get('sort_order');
    const file = form.get('file');

    if (!UUID_RE.test(itemId)) {
      return NextResponse.json({ ok: false, error: 'A valid item_id is required' }, { status: 400 });
    }
    const altProblem = altTextProblem(altText);
    if (altProblem) {
      return NextResponse.json({ ok: false, error: altProblem }, { status: 400 });
    }
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ ok: false, error: 'No picture was attached' }, { status: 400 });
    }
    if (file.size > ONEMARK_ASSET_MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: 'That picture is larger than 2 MB. Export it smaller and try again.' },
        { status: 400 },
      );
    }

    const kind = uploadableTypeForMime(file.type);
    if (!kind) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'A question picture must be a PNG or an SVG. JPEG cannot be stored yet — onemark_question_assets.asset_type accepts svg, png and katex_block only.',
        },
        { status: 415 },
      );
    }

    const raw = new Uint8Array(await file.arrayBuffer());
    const cleaned = sanitiseAssetBytes(kind, raw);
    if (cleaned.ok === false) {
      return NextResponse.json({ ok: false, error: cleaned.reason }, { status: 400 });
    }
    if (cleaned.removed.length > 0) {
      console.warn(
        `[onemark/assets] stripped ${cleaned.removed.join(', ')} from an uploaded PNG for item ${itemId}`,
      );
    }

    const sortOrder = normaliseSortOrder(sortRaw);

    // The stored key is generated here, never taken from the filename, so a
    // crafted name cannot escape the item's folder.
    objectPath = `${itemId}/${crypto.randomUUID()}.${ONEMARK_ASSET_EXTENSION[kind]}`;
    admin = createServiceRoleClient();
    const { error: uploadError } = await admin.storage
      .from(ONEMARK_ASSET_BUCKET)
      .upload(objectPath, Buffer.from(cleaned.bytes), {
        contentType: ONEMARK_ASSET_MIME[kind],
        upsert: false,
      });
    if (uploadError) {
      objectPath = null;
      if (looksLikeMissingBucket(uploadError.message)) {
        console.error('[POST /api/foundation/onemark/assets] bucket missing:', uploadError.message);
        return NextResponse.json(
          {
            ok: false,
            error:
              'Question pictures are not switched on yet — the picture store has not been created. Nothing was saved.',
            contract_pending: true,
          },
          { status: 503 },
        );
      }
      console.error('[POST /api/foundation/onemark/assets] storage:', uploadError.message);
      return NextResponse.json(
        { ok: false, error: `Could not store the picture — ${uploadError.message}` },
        { status: 500 },
      );
    }

    // The row goes in on the caller's OWN client, so onemark_question_assets'
    // write policy decides, not the service key.
    const { data: inserted, error: insertError } = await (supabase as any)
      .from('onemark_question_assets')
      .insert({
        item_id: itemId,
        asset_type: kind,
        storage_path: objectPath,
        alt_text: altText,
        sort_order: sortOrder,
      })
      .select(ASSET_COLUMNS)
      .single();

    if (insertError) {
      // Refused after the bytes landed — take them back out so a rejected
      // attach leaves nothing behind in the bucket.
      const { error: cleanupError } = await admin.storage.from(ONEMARK_ASSET_BUCKET).remove([objectPath]);
      if (cleanupError) {
        console.error('[POST /api/foundation/onemark/assets] orphan left in bucket:', objectPath, cleanupError.message);
      }
      objectPath = null;
      console.error('[POST /api/foundation/onemark/assets] insert:', insertError.message);
      return NextResponse.json(
        { ok: false, error: `Could not record the picture — ${insertError.message}` },
        { status: 500 },
      );
    }

    objectPath = null;
    const [asset] = await signAssets(admin, [inserted as AssetRow], true);
    return NextResponse.json({ ok: true, asset }, { status: 201 });
  } catch (err) {
    if (objectPath && admin) {
      try {
        await admin.storage.from(ONEMARK_ASSET_BUCKET).remove([objectPath]);
      } catch (cleanupErr) {
        console.error('[POST /api/foundation/onemark/assets] orphan left in bucket:', objectPath, cleanupErr);
      }
    }
    console.error('[POST /api/foundation/onemark/assets]', err);
    return NextResponse.json({ ok: false, error: 'Could not attach the picture.' }, { status: 500 });
  }
}

/** 1 unless a sane positive integer was sent. */
export function normaliseSortOrder(raw: FormDataEntryValue | null): number {
  const n = Number(String(raw ?? '').trim());
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 99) return 1;
  return n;
}
