import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/utils/parent-admin-auth';
import { isDriveConfigured } from '@/lib/google/drive-client';
import { uploadParentPortalAttachment, type PPFeature } from '@/lib/google/drive-upload';

export const runtime = 'nodejs';

const FEATURES: PPFeature[] = ['announcements', 'homework', 'achievements'];
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB
// PDF + images only.
const isAllowedType = (type: string) => type === 'application/pdf' || type.startsWith('image/');

const uniq = (xs: Array<string | null | undefined>) =>
  Array.from(new Set(xs.filter((x): x is string => !!x)));

/**
 * POST /api/academic/parent-portal/upload  (multipart/form-data)
 * Fields: file, feature, institutionId, and target context for folder nesting:
 *   programIds, sectionIds  (CSV) — homework / announcements
 *   learnerIds              (CSV) — achievements (program/section derived here)
 *
 * Smart fallback: Program/Section folders are only added when the target
 * resolves to exactly ONE distinct value, so a multi-section upload lands at the
 * higher (Program or Feature) level instead of being copied per section.
 * Returns { attachment: {name, driveFileId, url} }.
 */
export async function POST(req: NextRequest) {
  const user = await requireStaff();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!isDriveConfigured()) {
    return NextResponse.json(
      { error: 'File uploads are not configured on the server.' },
      { status: 503 }
    );
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 });

  const file = form.get('file');
  const feature = String(form.get('feature') ?? '') as PPFeature;
  const institutionId = String(form.get('institutionId') ?? '');
  const csv = (k: string) => String(form.get(k) ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  let programIds = csv('programIds');
  let sectionIds = csv('sectionIds');
  const learnerIds = csv('learnerIds');

  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  if (!FEATURES.includes(feature)) return NextResponse.json({ error: 'Invalid feature.' }, { status: 400 });
  if (!institutionId) return NextResponse.json({ error: 'Institution is required.' }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: 'File is empty.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File exceeds the 25 MB limit.' }, { status: 400 });
  if (!isAllowedType(file.type))
    return NextResponse.json({ error: 'Only PDF and image files are allowed.' }, { status: 400 });

  const db = createServiceRoleClient();

  // Achievements only know learners → derive their distinct program/section.
  if (learnerIds.length) {
    const { data: lrn } = await db
      .from('learners_profiles')
      .select('program_id, section_id')
      .in('id', learnerIds);
    programIds = uniq([...programIds, ...((lrn ?? []).map((l) => l.program_id as string | null))]);
    sectionIds = uniq([...sectionIds, ...((lrn ?? []).map((l) => l.section_id as string | null))]);
  } else {
    programIds = uniq(programIds);
    sectionIds = uniq(sectionIds);
  }

  // Resolve names in parallel; only nest a level when it's unambiguous (exactly one).
  const [instRes, progRes, secRes] = await Promise.all([
    db.from('institutions').select('name').eq('id', institutionId).maybeSingle(),
    programIds.length === 1
      ? db.from('programs').select('program_name').eq('id', programIds[0]).maybeSingle()
      : Promise.resolve({ data: null }),
    sectionIds.length === 1
      ? db.from('sections').select('section_name').eq('id', sectionIds[0]).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const institutionName = (instRes.data?.name as string) || 'Unknown Institution';
  const programName = (progRes.data as { program_name?: string } | null)?.program_name ?? null;
  // Section nests only when its program also nested (keeps the tree consistent).
  const sectionName = programName
    ? (secRes.data as { section_name?: string } | null)?.section_name ?? null
    : null;

  try {
    const attachment = await uploadParentPortalAttachment({
      feature,
      institutionName,
      programName,
      sectionName,
      file,
    });
    return NextResponse.json({ attachment });
  } catch (err) {
    console.error('[PP upload] error:', err);
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 });
  }
}
