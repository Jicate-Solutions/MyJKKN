import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { GrievanceAnalyticsClient } from './grievance-analytics-client';

export const metadata: Metadata = {
  title: 'Grievance Analytics | TQM',
  description: 'Analyze grievance trends and performance metrics',
};

export default async function GrievanceAnalyticsPage() {
  const { profile } = await getEnhancedUserProfile();

  if (!profile?.institution_id) {
    redirect('/');
  }

  const isStaff = ['admin', 'super_admin', 'staff', 'hod', 'principal'].includes(profile.role || '');

  if (!isStaff) {
    redirect('/grievance');
  }

  return <GrievanceAnalyticsClient institutionId={profile.institution_id} />;
}
