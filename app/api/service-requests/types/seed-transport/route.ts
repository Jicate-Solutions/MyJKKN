/**
 * Transport Service Type Seed Trigger
 *
 * POST /api/service-requests/types/seed-transport
 * Super Admin only - seeds the default Transport Service Request type.
 */

import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/supabase/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { seedTransportServiceType } from '@/lib/services/service-requests/transport-seed';

export async function POST() {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check super admin role
    const supabase = await createServerSupabaseClient();
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (!profile || profile.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Only super admins can seed service types' },
        { status: 403 }
      );
    }

    const serviceType = await seedTransportServiceType(session.user.id);

    return NextResponse.json({
      message: 'Transport service type seeded successfully',
      data: serviceType,
    });
  } catch (error) {
    console.error('[service-requests/seed-transport] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
