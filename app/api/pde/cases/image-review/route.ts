// app/api/pde/cases/image-review/route.ts
// ============================================================================
// Records the burned-in-identifier confirmation on a clinical teaching image.
//
// Metadata stripping is mechanical and provable. The pixel check is not — it is
// one person looking at an image and deciding. This route makes that judgement
// durable: who confirmed, when, and for which object. Withdrawals are recorded
// too, so a reviewer changing their mind leaves a trail rather than erasing one.
//
// Fired when the reviewer ticks (or un-ticks) the confirmation box, BEFORE the
// case is saved — an image is often confirmed and then abandoned, and that is
// exactly the history an audit would want.
// ============================================================================

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireCaseAuthor } from '@/lib/services/pde/require-case-author';

const BUCKET = 'pde-clinical-images';
const DECISIONS = ['confirmed_clean', 'withdrawn'] as const;
const SOURCES = ['pms_import', 'upload', 'unknown'] as const;

/**
 * Pull the object path out of a public storage URL, rejecting anything that is
 * not one of our own bucket objects — the audit trail must never record a row
 * pointing at an arbitrary external URL.
 */
function toStoragePath(url: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const at = url.indexOf(marker);
  if (at === -1) return null;
  const path = url.slice(at + marker.length).split('?')[0];
  if (!path || path.includes('..')) return null;
  return path;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const gate = await requireCaseAuthor(supabase);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let body: { image_url?: unknown; decision?: unknown; source?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const imageUrl = typeof body.image_url === 'string' ? body.image_url : '';
  const decision = typeof body.decision === 'string' ? body.decision : '';
  const source = typeof body.source === 'string' ? body.source : 'unknown';

  if (!DECISIONS.includes(decision as (typeof DECISIONS)[number])) {
    return NextResponse.json({ error: 'Unknown decision.' }, { status: 400 });
  }
  const storagePath = toStoragePath(imageUrl);
  if (!storagePath) {
    return NextResponse.json({ error: 'That is not a clinical image URL.' }, { status: 400 });
  }
  if (!gate.institutionId) {
    return NextResponse.json(
      { error: 'Your profile has no institution set, so this cannot be recorded.' },
      { status: 422 },
    );
  }

  const { error } = await (supabase as any).from('pde_clinical_image_reviews').insert({
    storage_path: storagePath,
    image_url: imageUrl,
    decision,
    source: SOURCES.includes(source as (typeof SOURCES)[number]) ? source : 'unknown',
    reviewed_by: gate.userId,
    institution_id: gate.institutionId,
  });

  if (error) {
    // Never block the reviewer on an audit-write failure — the confirmation gate
    // itself is the safety control, and a 500 here would train people to work
    // around it. Log loudly instead so a silent gap in the trail is visible.
    console.error('[pde/image-review] audit write failed:', error.message);
    return NextResponse.json({ recorded: false }, { status: 200 });
  }

  return NextResponse.json({ recorded: true });
}
