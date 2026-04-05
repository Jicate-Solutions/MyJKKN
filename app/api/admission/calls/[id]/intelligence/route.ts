import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('admission_call_intelligence')
    .select('*')
    .eq('call_log_id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ intelligence: null });
  }

  return NextResponse.json({ intelligence: data });
}
