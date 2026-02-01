/**
 * Create Grievance Ticket Page - Server Component
 * F004: Grievance Ticketing System
 */

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { TicketForm } from '../../_components/ticket-form';
import { getCategories } from '../../_data/get-tickets';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { RaiserType } from '@/types/grievance';

export default async function NewTicketPage() {
  // Get user profile
  const { profile } = await getEnhancedUserProfile();

  if (!profile?.institution_id) {
    redirect('/');
  }

  // Determine raiser type based on user role
  let raiserType: RaiserType = 'learner';
  if (profile.role === 'student') {
    raiserType = 'learner';
  } else if (profile.role === 'parent') {
    raiserType = 'parent';
  } else if (['admin', 'super_admin', 'staff', 'hod', 'principal'].includes(profile.role || '')) {
    raiserType = 'staff';
  }

  // Get raiser info - use enhanced profile's student_id if available
  const profileWithStudent = profile as any;
  const raiserName = profile.full_name || 'Unknown User';
  const raiserEmail = profile.email || '';
  const raiserPhone = profile.phone_number || '';
  const raiserId = profileWithStudent.student_id || profile.id;

  // Fetch categories
  const categories = await getCategories(profile.institution_id);

  // Flatten categories for the form (include both parent and children)
  const flatCategories = categories.reduce((acc: any[], cat: any) => {
    acc.push(cat);
    if (cat.children && cat.children.length > 0) {
      acc.push(...cat.children);
    }
    return acc;
  }, []);

  return (
    <ContentLayout title="Raise Grievance">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Grievance', href: '/grievance' },
          { label: 'New Ticket', href: '/grievance/tickets/new' }
        ]}
      />

      <div className="max-w-3xl mx-auto mt-6">
        <TicketForm
          institutionId={profile.institution_id}
          categories={flatCategories}
          defaultRaiserType={raiserType}
          defaultRaiserId={raiserId}
          defaultRaiserName={raiserName}
          defaultRaiserEmail={raiserEmail}
          defaultRaiserPhone={raiserPhone}
        />
      </div>
    </ContentLayout>
  );
}
