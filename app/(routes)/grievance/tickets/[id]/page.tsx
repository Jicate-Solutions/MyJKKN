/**
 * Grievance Ticket Detail Page - Server Component
 * F004: Grievance Ticketing System
 */

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { TicketDetail } from '../../_components/ticket-detail';
import { getTicket } from '../../_data/get-tickets';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';

interface TicketPageProps {
  params: Promise<{ id: string }>;
}

export default async function TicketPage({ params }: TicketPageProps) {
  const { id } = await params;

  // Get user profile
  const { profile } = await getEnhancedUserProfile();

  if (!profile?.institution_id) {
    redirect('/');
  }

  const isStaff = ['admin', 'super_admin', 'staff', 'hod', 'principal'].includes(profile.role || '');

  // Fetch ticket
  let ticket;
  try {
    ticket = await getTicket(id);
  } catch (error) {
    notFound();
  }

  // Check access - staff can view all, others can only view their own
  if (!isStaff) {
    const userId = (profile as any).student_id || profile.id;
    if (ticket.raised_by_id !== userId) {
      redirect('/grievance');
    }
  }

  // Get current user info
  const currentUserName = profile.full_name || 'Unknown User';

  return (
    <ContentLayout title={`Ticket ${ticket.ticket_number}`}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Grievance', href: '/grievance' },
          { label: ticket.ticket_number, href: `/grievance/tickets/${id}` }
        ]}
      />

      <div className="mt-6">
        <TicketDetail
          ticket={ticket}
          currentUserId={profile.id}
          currentUserName={currentUserName}
          isStaff={isStaff}
        />
      </div>
    </ContentLayout>
  );
}
