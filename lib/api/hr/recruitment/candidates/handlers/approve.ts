import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, after, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { RecruitmentService } from '@/lib/services/hr/recruitment-service';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { notifyNextApprover } from '@/lib/hr/recruitment/harness-run';
import { getErrorMessage } from '@/lib/utils';

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
    const { id } = await params;
    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const updated = await RecruitmentService.approveCandidate(supabase, id, user.id, body.comment);

    // HR harness R5: the chain moved on, so tell whoever decides the next step.
    // Until now nobody was told — the next approver found out only by opening
    // their approvals list. Service role because the notice goes to OTHER people.
    // notifyNextApprover never throws; the guard covers a missing service key, so
    // a recorded approval is never reported back as a failure.
    //
    // Sent AFTER the response (review of #4149, finding 4). The notice reads the
    // role directory and fans out; awaited here, a slow database held a recorded
    // approval's response open, and an approver who saw it hang could try again.
    if (updated?.status === 'pending_approval') {
      const approverId = user.id;
      after(async () => {
        try {
          await notifyNextApprover(createServiceRoleClient(), id, approverId);
        } catch (notifyErr) {
          console.error('[hr/recruitment/candidates/:id/approve] next-approver notice skipped', notifyErr);
        }
      });
    }

    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error('[hr/recruitment/candidates/:id/approve] error', err);
    // The decision now runs through the SECURITY DEFINER RPC
    // fn_decide_recruitment_candidate, so a refusal arrives as a PostgrestError —
    // a plain object, not an `Error`. `err instanceof Error` was false for it, and
    // every RLS/authorization failure reached the approver as the useless
    // "Unknown error". getErrorMessage keeps the function's own guard text.
    const code = (err as { code?: string })?.code;
    return NextResponse.json(
      { error: getErrorMessage(err) },
      { status: code === '42501' ? 403 : code === 'P0002' ? 404 : 400 }
    );
  }
}
