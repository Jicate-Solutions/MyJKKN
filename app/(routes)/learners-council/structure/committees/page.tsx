/**
 * LC Structure - Portfolio Committees CRUD Management
 * Dedicated page for managing portfolio committees and their members.
 */

import { createClient } from '@/lib/supabase/server';
import { Users } from 'lucide-react';
import { CommitteesClient } from './committees-client';

export default async function CommitteesPage() {
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
    .select('id, role, institution_id, full_name, avatar_url, email, is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Please sign in to access this page.</p>
      </div>
    );
  }

  const isStaffOrAdmin =
    profile.is_super_admin === true ||
    ['admin', 'super_admin', 'staff', 'hod', 'principal'].includes(profile.role || '');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Users className="h-6 w-6 text-blue-600" />
          Portfolio Committees
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage topical committees and their members across the Learners Council.
        </p>
      </div>

      <CommitteesClient isStaffOrAdmin={isStaffOrAdmin} />
    </div>
  );
}
