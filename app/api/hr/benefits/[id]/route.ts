export const dynamic = 'force-dynamic';

/**
 * /api/hr/benefits/[id]
 *
 * GET    — single benefit with enrollments
 * PATCH  — update benefit OR enroll staff (action=enroll)
 * DELETE — soft-delete (is_active = false)
 */

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { BenefitsService } from '@/lib/services/hr/benefits-service';

export const GET = withAuth(async (request, auth, context) => {
  await connection();
  try {
    const params = await context?.params;
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const result = await BenefitsService.getBenefit(auth.supabase, id);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[HR Benefits] GET [id] error:', err);
    return NextResponse.json(
      { error: err.message ?? 'Failed to load benefit' },
      { status: 500 }
    );
  }
}, { requiredPermission: 'read' });

export const PATCH = withAuth(async (request, auth, context) => {
  await connection();
  try {
    const params = await context?.params;
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const body = await request.json();

    // Enroll staff action
    if (body.action === 'enroll' && body.staff_id) {
      const enrollment = await BenefitsService.enrollStaff(
        auth.supabase,
        id,
        body.staff_id
      );
      return NextResponse.json(enrollment, { status: 201 });
    }

    // Update benefit
    const benefit = await BenefitsService.updateBenefit(auth.supabase, id, {
      name: body.name,
      category: body.category,
      description: body.description,
      cost_to_company: body.cost_to_company,
      is_active: body.is_active,
      eligible_roles: body.eligible_roles,
    });

    return NextResponse.json(benefit);
  } catch (err: any) {
    console.error('[HR Benefits] PATCH [id] error:', err);
    return NextResponse.json(
      { error: err.message ?? 'Failed to update benefit' },
      { status: 500 }
    );
  }
});

export const DELETE = withAuth(async (request, auth, context) => {
  await connection();
  try {
    const params = await context?.params;
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    await BenefitsService.deleteBenefit(auth.supabase, id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[HR Benefits] DELETE [id] error:', err);
    return NextResponse.json(
      { error: err.message ?? 'Failed to delete benefit' },
      { status: 500 }
    );
  }
});
