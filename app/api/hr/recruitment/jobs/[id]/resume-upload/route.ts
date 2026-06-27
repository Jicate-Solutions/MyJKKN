export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { isDriveConfigured } from '@/lib/google/drive-client';
import { uploadResumeToJobFolder } from '@/lib/google/drive-upload';

const ALLOWED_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const MAX_BYTES = 2 * 1024 * 1024;

async function getClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) {
          try { cookieStore.set({ name, value, ...options }); } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try { cookieStore.set({ name, value: '', ...options }); } catch {}
        },
      },
    }
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    if (!isDriveConfigured()) {
      return NextResponse.json(
        { error: 'File storage is not configured. Contact support.' },
        { status: 503 }
      );
    }

    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: jobId } = await params;

    const { data: job, error: jobErr } = await supabase
      .from('hr_recruitment_jobs')
      .select('id, title, job_code, status')
      .eq('id', jobId)
      .maybeSingle();

    if (jobErr || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    if (job.status !== 'open') {
      return NextResponse.json(
        { error: 'This job posting is no longer accepting applications' },
        { status: 422 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: 'Only PDF, DOC, and DOCX files are supported.' },
        { status: 400 }
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `File size must be under 2 MB (received ${(file.size / 1024 / 1024).toFixed(1)} MB).` },
        { status: 400 }
      );
    }

    const { url, driveFileId } = await uploadResumeToJobFolder({
      jobTitle: job.title,
      jobCode: job.job_code,
      jobId,
      file,
    });

    return NextResponse.json({
      url,
      driveFileId,
      filename: file.name,
      sizeBytes: file.size,
    });
  } catch (err) {
    console.error('[hr/recruitment/jobs/resume-upload] POST error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
