/**
 * LC Structure - Member Directory
 * Table of all LC members with filters, assignment, and position history
 */

import { createClient } from '@/lib/supabase/server';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users } from 'lucide-react';
import { MembersClient } from './members-client';

export default async function MembersPage() {
  const { profile } = await getEnhancedUserProfile();
  if (!profile) redirect('/');

  const supabase = await createClient();

  // Fetch data needed for filters and the assign dialog
  const [
    { data: terms },
    { data: positions },
    { data: institutions },
    { data: members }
  ] = await Promise.all([
    supabase.from('lc_terms').select('*').order('start_date', { ascending: false }),
    supabase.from('lc_positions').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('institutions').select('id, name').order('name'),
    supabase
      .from('lc_members')
      .select(`
        *,
        position:lc_positions(id, title, category, tier),
        user:profiles(id, full_name, email, avatar_url),
        term:lc_terms(id, name, status)
      `)
      .order('appointed_at', { ascending: false })
  ]);

  const isStaffOrAdmin = ['admin', 'super_admin', 'staff', 'hod', 'principal'].includes(profile.role || '');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" />
          LC Member Directory
        </h1>
        <p className="text-muted-foreground mt-1">
          All Learners Council members across terms and positions
        </p>
      </div>

      {/* Client-side interactive area: filters, table, dialogs */}
      <MembersClient
        initialMembers={members || []}
        terms={terms || []}
        positions={positions || []}
        institutions={(institutions || []).map((i: any) => ({ id: i.id, name: i.name }))}
        isStaffOrAdmin={isStaffOrAdmin}
      />
    </div>
  );
}
