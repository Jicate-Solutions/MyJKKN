export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { HRPersonService } from '@/lib/services/hr/employee-service';

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

async function requireAuth() {
  const supabase = await getClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return { supabase: null, user: null, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { supabase, user, response: null };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await params;
    const { supabase, response } = await requireAuth();
    if (response) return response;

    // All employees now come from staff. The ?source param is kept for
    // backwards compatibility but always queries staff.
    const details = await HRPersonService.getStaffDetails(supabase!, id);
    if (!details) {
      // Fallback: try fetching the full staff member record
      const staffMember = await HRPersonService.getStaffMember(supabase!, id);
      if (!staffMember) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json({ data: staffMember });
    }
    return NextResponse.json({ data: details });
  } catch (err) {
    console.error('[hr/employees/:id] GET error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE removed — deactivation of non-staff employees via hr_employees table
// is no longer applicable. Staff deactivation should go through the staff module.
