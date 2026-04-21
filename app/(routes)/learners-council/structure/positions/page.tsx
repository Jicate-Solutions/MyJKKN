/**
 * LC Structure - Positions CRUD Management
 * Manage LC positions (executive, representative, portfolio_head) across institutions
 */

import { createClient } from '@/lib/supabase/server';
import { Award } from 'lucide-react';
import { PositionsClient } from './positions-client';

export default async function PositionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Please sign in to access this page.</p>
      </div>
    );
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, institution_id, full_name, avatar_url, email')
    .eq('id', user.id)
    .single();
  if (!profile) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Please sign in to access this page.</p>
      </div>
    );
  }

  const [
    { data: positions },
    { data: institutions },
    { data: memberRows }
  ] = await Promise.all([
    supabase
      .from('lc_positions')
      .select('*')
      .order('sort_order', { ascending: true }),
    supabase
      .from('institutions')
      .select('id, name')
      .order('name', { ascending: true }),
    supabase
      .from('lc_members')
      .select('position_id')
      .eq('status', 'active')
  ]);

  // Count active members per position (for delete confirmation UX)
  const memberCounts: Record<string, number> = {};
  if (memberRows) {
    for (const row of memberRows as Array<{ position_id: string }>) {
      memberCounts[row.position_id] = (memberCounts[row.position_id] || 0) + 1;
    }
  }

  const isStaffOrAdmin = ['admin', 'super_admin', 'staff', 'hod', 'principal'].includes(profile.role || '');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Award className="h-6 w-6 text-primary" />
          LC Positions
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage Learners Council positions — executives, institution representatives, and portfolio heads
        </p>
      </div>

      <PositionsClient
        initialPositions={positions || []}
        institutions={(institutions || []).map((i: { id: string; name: string }) => ({
          id: i.id,
          name: i.name
        }))}
        memberCounts={memberCounts}
        isStaffOrAdmin={isStaffOrAdmin}
      />
    </div>
  );
}
