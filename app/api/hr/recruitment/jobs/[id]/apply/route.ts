export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import type { HRJobApplicationInsert } from '@/types/hr-recruitment';

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
    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: jobId } = await params;

    // Verify the job exists and is open
    const { data: job, error: jobErr } = await supabase
      .from('hr_recruitment_jobs')
      .select('id, status, institution_id')
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

    const body = await request.json() as Partial<HRJobApplicationInsert>;

    // Validate required fields
    const missing: string[] = [];
    if (!body.first_name?.trim()) missing.push('first_name');
    if (!body.last_name?.trim()) missing.push('last_name');
    if (!body.email?.trim()) missing.push('email');
    if (!body.phone?.trim()) missing.push('phone');
    if (!body.resume_url?.trim()) missing.push('resume_url');
    if (!body.resume_filename?.trim()) missing.push('resume_filename');
    if (!body.qualification?.trim()) missing.push('qualification');
    if (body.experience_months === undefined || body.experience_months === null) {
      missing.push('experience_months');
    }

    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(', ')}` },
        { status: 400 }
      );
    }

    const { data: application, error: insertErr } = await supabase
      .from('hr_job_applications')
      .insert({
        job_id: jobId,
        institution_id: job.institution_id ?? null,
        first_name: body.first_name!.trim(),
        last_name: body.last_name!.trim(),
        email: body.email!.trim().toLowerCase(),
        phone: body.phone!.trim(),
        current_job_title: body.current_job_title?.trim() || null,
        current_company: body.current_company?.trim() || null,
        current_job_duration_months: body.current_job_duration_months ?? null,
        experience_months: body.experience_months!,
        qualification: body.qualification!.trim(),
        worked_cities: body.worked_cities ?? [],
        resume_url: body.resume_url!.trim(),
        resume_filename: body.resume_filename!.trim(),
        resume_size_bytes: body.resume_size_bytes ?? null,
        drive_file_id: body.drive_file_id ?? null,
        applicant_user_id: user.id,
      })
      .select()
      .single();

    if (insertErr) {
      console.error('[hr/recruitment/jobs/apply] INSERT error', insertErr);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({ data: application }, { status: 201 });
  } catch (err) {
    console.error('[hr/recruitment/jobs/apply] POST error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
