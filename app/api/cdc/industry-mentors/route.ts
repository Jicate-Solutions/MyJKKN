// GET/POST /api/cdc/industry-mentors — agent ζ Sprint 7b

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  listIndustryMentors,
  createIndustryMentor,
} from '@/lib/services/cdc/industry-mentor-service';
import type { CreateIndustryMentorInput } from '@/types/cdc/industry-mentors';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sp = req.nextUrl.searchParams;
    const result = await listIndustryMentors({
      sector: sp.get('sector') ?? undefined,
      status: (sp.get('status') ?? 'active') as 'active' | 'inactive' | 'all',
      page: sp.has('page') ? parseInt(sp.get('page')!) : 1,
      limit: sp.has('limit') ? parseInt(sp.get('limit')!) : 20,
      search: sp.get('search') ?? undefined,
    });

    return NextResponse.json(result);
  } catch (e) {
    console.error('[cdc/industry-mentors GET]', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json() as CreateIndustryMentorInput;

    if (!body.mentor_name || !body.email || !body.institution_id) {
      return NextResponse.json(
        { error: 'mentor_name, email, and institution_id are required' },
        { status: 400 }
      );
    }

    // Engagement category is required on new records (BUG-004059).
    if (!body.mentor_category_id) {
      return NextResponse.json(
        { error: 'mentor_category_id (engagement category) is required' },
        { status: 400 }
      );
    }

    const mentor = await createIndustryMentor(body);
    return NextResponse.json(mentor, { status: 201 });
  } catch (e) {
    console.error('[cdc/industry-mentors POST]', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
