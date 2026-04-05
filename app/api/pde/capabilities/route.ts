export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const category = request.nextUrl.searchParams.get('category');
    let query = (supabase as any).from('pde_capabilities').select('*').order('category').order('level');
    if (category) query = query.eq('category', category);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ data: data || [] });
  } catch (e: any) { return NextResponse.json({ error: e.message || 'Error' }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    if (!body.name || !body.slug || !body.description || !body.category || body.level == null) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    const { data, error } = await (supabase as any).from('pde_capabilities').insert(body).select().single();
    if (error) throw error;
    return NextResponse.json({ data }, { status: 201 });
  } catch (e: any) { return NextResponse.json({ error: e.message || 'Error' }, { status: 500 }); }
}
