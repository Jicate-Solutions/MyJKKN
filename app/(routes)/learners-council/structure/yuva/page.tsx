/**
 * LC Structure - YUVA Chapters & Verticals
 * Lists institution chapters with verticals and member assignments
 */

import { createClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { Building2 } from 'lucide-react';
import { YUVAClient } from './yuva-client';

export default async function YUVAPage() {
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
    { data: chapters },
    { data: verticals },
    { data: institutions }
  ] = await Promise.all([
    supabase
      .from('yuva_chapters')
      .select(`
        *,
        institution:institutions(id, name)
      `)
      .order('name', { ascending: true }),
    supabase
      .from('yuva_verticals')
      .select('*')
      .order('sort_order', { ascending: true }),
    supabase
      .from('institutions')
      .select('id, name')
      .order('name')
  ]);

  const isStaffOrAdmin = ['admin', 'super_admin', 'staff', 'hod', 'principal'].includes(profile.role || '');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Building2 className="h-6 w-6 text-blue-600" />
          YUVA Chapters & Verticals
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage institution-level YUVA chapters, verticals, and chair/co-chair assignments
        </p>
      </div>

      <YUVAClient
        initialChapters={chapters || []}
        initialVerticals={verticals || []}
        institutions={(institutions || []).map((i: any) => ({ id: i.id, name: i.name }))}
        isStaffOrAdmin={isStaffOrAdmin}
      />
    </div>
  );
}
