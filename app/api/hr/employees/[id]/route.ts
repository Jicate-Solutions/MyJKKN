export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/auth/with-auth';
import { HRPersonService } from '@/lib/services/hr/employee-service';

export const GET = withAuth(
  async (
    _request: NextRequest,
    auth: AuthContext,
    context?: { params?: Promise<Record<string, string>> }
  ) => {
    const params = context?.params ? await context.params : {};
    const id = params.id;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const person = await HRPersonService.getPersonDetail(auth.supabase, id);
    if (!person) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ data: person });
  },
  { allowApiKey: false, requiredPermission: 'read', requirePermission: 'hr.employees.view' }
);

// DELETE removed — staff deactivation goes through the staff module.
