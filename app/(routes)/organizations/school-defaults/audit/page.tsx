import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AuditLogTable from './_components/audit-log-table';
import { PageHeader } from '@/components/page-header';

export const metadata = {
  title: 'School Defaults Audit Log',
};

export default async function SchoolDefaultsAuditPage() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  // TODO: Add permission check (institution admin or org admin)

  return (
    <div className="space-y-6">
      <PageHeader
        title="School Defaults Audit Log"
        description="View all create, update, and delete actions on school K-12 Program and Academic department records"
      />
      <AuditLogTable />
    </div>
  );
}
