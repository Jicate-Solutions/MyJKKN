/**
 * LC-006: Issue Management - Dashboard & Kanban Page
 * Server component that loads initial data, delegates to client kanban
 */

import { createClient } from '@/lib/supabase/server';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { IssuesKanbanClient } from './_components/issues-kanban-client';

export default async function IssuesPage() {
  const { profile } = await getEnhancedUserProfile();

  if (!profile) {
    redirect('/');
  }

  const supabase = await createClient();

  const institutionId = profile.institution_id || '';

  // Fetch categories for the create form
  const { data: categories } = await supabase
    .from('grievance_categories')
    .select('id, name')
    .eq('institution_id', institutionId)
    .eq('is_active', true)
    .order('sort_order');

  // Fetch LC members for assignment
  const { data: lcMembers } = await supabase
    .from('lc_members')
    .select(`
      id, user_id,
      user:profiles!user_id(id, full_name, email, avatar_url)
    `)
    .eq('status', 'active')
    .limit(50);

  return (
    <IssuesKanbanClient
      userId={profile.id}
      userName={profile.full_name || 'Unknown'}
      institutionId={institutionId}
      categories={categories || []}
      lcMembers={(lcMembers || []).map((m: any) => ({
        id: m.user_id,
        full_name: m.user?.full_name || 'Unknown',
        email: m.user?.email || '',
        avatar_url: m.user?.avatar_url || null
      }))}
    />
  );
}
