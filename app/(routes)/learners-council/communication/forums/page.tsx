/**
 * Learners Council Communication Hub - Forums Page
 * Topic list with categories, create topic, threaded discussions
 */

import { createClient } from '@/lib/supabase/server';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ForumsClient } from './forums-client';

export default async function ForumsPage() {
  const { profile } = await getEnhancedUserProfile();
  if (!profile) redirect('/');

  const supabase = await createClient();

  // Fetch initial topics server-side
  const { data: topics } = await supabase
    .from('lc_forum_topics')
    .select(
      `
      *,
      creator:profiles!lc_forum_topics_created_by_fkey(id, full_name, avatar_url)
    `
    )
    .order('is_pinned', { ascending: false })
    .order('last_post_at', { ascending: false, nullsFirst: false })
    .limit(20);

  // Get unique categories for filter
  const { data: categoryData } = await supabase
    .from('lc_forum_topics')
    .select('category')
    .order('category');

  const categories = Array.from(
    new Set((categoryData || []).map((c: { category: string }) => c.category).filter(Boolean))
  );

  return (
    <ForumsClient
      initialTopics={topics || []}
      categories={categories as string[]}
      userId={profile.id}
      userName={profile.full_name || 'Learner'}
    />
  );
}
