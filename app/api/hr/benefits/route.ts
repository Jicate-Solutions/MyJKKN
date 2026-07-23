export const dynamic = 'force-dynamic';

/**
 * /api/hr/benefits
 *
 * GET  — list benefits (paginated) OR enrollment stats (if ?stats=true)
 * POST — create a new benefit
 */

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { BenefitsService } from '@/lib/services/hr/benefits-service';
import type { BenefitsFilters, BenefitCategory } from '@/types/hr-benefits';

export const GET = withAuth(async (request, auth) => {
  await connection();
  try {
    const supabase = auth.supabase;
    const url = new URL(request.url);

    // Stats mode
    if (url.searchParams.get('stats') === 'true') {
      const institutionId =
        url.searchParams.get('institution_id') ?? undefined;
      const stats = await BenefitsService.getEnrollmentStats(
        supabase,
        institutionId
      );
      return NextResponse.json(stats);
    }

    // List mode
    const filters: BenefitsFilters = {};
    const institutionId = url.searchParams.get('institution_id');
    const category = url.searchParams.get('category');
    const isActive = url.searchParams.get('is_active');
    const page = url.searchParams.get('page');
    const limit = url.searchParams.get('limit');

    if (institutionId) filters.institution_id = institutionId;
    if (category) filters.category = category as BenefitCategory;
    if (isActive !== null) filters.is_active = isActive === 'true';
    if (page) filters.page = parseInt(page, 10);
    if (limit) filters.limit = parseInt(limit, 10);

    const result = await BenefitsService.listBenefits(supabase, filters);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[HR Benefits] GET error:', err);
    return NextResponse.json(
      { error: err.message ?? 'Failed to load benefits' },
      { status: 500 }
    );
  }
}, { requiredPermission: 'read' });

export const POST = withAuth(async (request, auth) => {
  await connection();
  try {
    const supabase = auth.supabase;
    const body = await request.json();

    if (!body.name || !body.category || !body.institution_id) {
      return NextResponse.json(
        { error: 'name, category, and institution_id are required' },
        { status: 400 }
      );
    }

    const benefit = await BenefitsService.createBenefit(supabase, {
      institution_id: body.institution_id,
      name: body.name,
      category: body.category,
      description: body.description,
      cost_to_company: body.cost_to_company,
      eligible_roles: body.eligible_roles,
    });

    return NextResponse.json(benefit, { status: 201 });
  } catch (err: any) {
    console.error('[HR Benefits] POST error:', err);
    return NextResponse.json(
      { error: err.message ?? 'Failed to create benefit' },
      { status: 500 }
    );
  }
});
