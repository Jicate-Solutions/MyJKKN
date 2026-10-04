import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { withReferenceListCache } from '@/lib/http/cache-control';

// ── GET /api/events/host-institutions ─────────────────────────────────────────
// Every active JKKN college, for the "Host Institutions" picker on the event
// creator. An event can be hosted jointly by several colleges, but the
// `institutions` RLS lets an HOD read only their OWN row — so the picker offered
// them one option and joint hosting was impossible. Only id + name are returned
// (a college's name is not sensitive), and the caller must be signed in.
//
// Choosing a college here grants nothing: the first host is still written as
// `events.institution_id` under the events INSERT policy, and the others are
// labels in `events.config.co_hosts`.
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await createServiceRoleClient()
      .from('institutions')
      .select('id, name')
      .eq('is_active', true)
      .eq('entity_type', 'institution')
      .order('name');

    if (error) throw error;

    const rows = data ?? [];
    return withReferenceListCache(NextResponse.json({ data: rows }), rows.length);
  } catch (error) {
    console.error('[GET /api/events/host-institutions]', error);
    return NextResponse.json({ error: 'Failed to fetch institutions' }, { status: 500 });
  }
}
