// GET/PATCH/DELETE /api/cdc/industry-mentors/[id] — agent ζ Sprint 7b

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getIndustryMentor,
  updateIndustryMentor,
  deleteIndustryMentor,
} from '@/lib/services/cdc/industry-mentor-service';
import type { UpdateIndustryMentorInput } from '@/types/cdc/industry-mentors';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const mentor = await getIndustryMentor(id);
    if (!mentor) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json(mentor);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json() as UpdateIndustryMentorInput;
    const mentor = await updateIndustryMentor(id, body);
    return NextResponse.json(mentor);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await deleteIndustryMentor(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
