/**
 * LC Structure - YUVA Verticals CRUD Management
 * Dedicated page for cross-chapter vertical management
 */

import { createClient } from '@/lib/supabase/server';
import { Layers } from 'lucide-react';
import { VerticalsClient } from './verticals-client';

export default async function VerticalsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return <div className="flex items-center justify-center py-20"><p className="text-muted-foreground">Please sign in to access this page.</p></div>;
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, institution_id, full_name, avatar_url, email')
    .eq('id', user.id)
    .single();
  if (!profile) {
    return <div className="flex items-center justify-center py-20"><p className="text-muted-foreground">Please sign in to access this page.</p></div>;
  }

  const [
    { data: verticals },
    { data: chapters },
    { data: verticalMembers }
  ] = await Promise.all([
    supabase
      .from('yuva_verticals')
      .select('*')
      .order('sort_order', { ascending: true }),
    supabase
      .from('yuva_chapters')
      .select(`
        id, name,
        institution:institutions(id, name)
      `)
      .eq('is_active', true)
      .order('name', { ascending: true }),
    supabase
      .from('yuva_vertical_members')
      .select('vertical_id')
      .eq('is_active', true)
  ]);

  // Count active members per vertical
  const memberCounts: Record<string, number> = {};
  if (verticalMembers) {
    for (const vm of verticalMembers) {
      const vId = vm.vertical_id as string;
      memberCounts[vId] = (memberCounts[vId] || 0) + 1;
    }
  }

  const isStaffOrAdmin = ['admin', 'super_admin', 'staff', 'hod', 'principal'].includes(profile.role || '');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Layers className="h-6 w-6 text-blue-600" />
          YUVA Verticals
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage verticals and stakeholders across all YUVA chapters
        </p>
      </div>

      <VerticalsClient
        initialVerticals={verticals || []}
        chapters={(chapters || []).map((c: any) => ({
          id: c.id,
          name: c.name,
          institutionName: c.institution?.name || 'Unknown'
        }))}
        memberCounts={memberCounts}
        isStaffOrAdmin={isStaffOrAdmin}
      />
    </div>
  );
}
