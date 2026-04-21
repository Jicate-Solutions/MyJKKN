/**
 * LC Structure - YUVA Chapters & Verticals
 * Lists institution chapters with verticals and member assignments
 */

import { createClient } from '@/lib/supabase/server';
import { Building2, Info } from 'lucide-react';
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
          Each JKKN college has its own YUVA chapter. Each school has a Thalir chapter.
        </p>
      </div>

      {/* Independence notice — YUVA is not under LC control */}
      <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 flex gap-3">
        <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-blue-900">YUVA operates independently from the Learners Council.</p>
          <p className="text-blue-800 mt-1">
            Each Chapter Chair has full control of their chapter (assign vertical/stakeholder leaders, create chapter announcements, propose chapter events, run polls, manage members). The LC does not approve or oversee YUVA decisions. The only connection is the progression path — previous-year Yuva Chapter/Vertical Chairs are eligible for promotion to the Learners Council in the subsequent year.
          </p>
        </div>
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
