import { redirect } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { getEnhancedUserProfile, createClient } from '@/lib/supabase/server';
import { AllPulseTable } from './_components/all-pulse-table';

const ADMIN_ROLES = ['super_admin', 'administrator'];

export default async function AllPulseEntriesPage() {
  const { profile } = await getEnhancedUserProfile();

  if (!profile) redirect('/');
  if (!ADMIN_ROLES.includes(profile.role)) redirect('/work-pulse');

  // Fetch filter options
  const supabase = await createClient();
  const [instResult, deptResult] = await Promise.all([
    supabase.from('institutions').select('id, name').order('name'),
    supabase.from('departments').select('id, department_name').order('department_name'),
  ]);

  return (
    <ContentLayout title="All Work Pulses">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Work Pulse', href: '/work-pulse' },
          { label: 'All Submissions' },
        ]}
      />

      <div className="space-y-4 mt-4">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">All Work Pulse Submissions</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            View and filter all staff pulse entries across institutions and departments
          </p>
        </div>

        <AllPulseTable
          institutions={instResult.data || []}
          departments={deptResult.data || []}
        />
      </div>
    </ContentLayout>
  );
}
