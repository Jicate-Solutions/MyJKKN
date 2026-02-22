import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { getTickets } from '../_data/get-tickets';
import {
  AlertTriangle,
  Clock,
  User,
  Calendar
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

export const metadata: Metadata = {
  title: 'Escalations | Grievance',
  description: 'View and manage escalated grievance tickets',
};

export default async function GrievanceEscalationsPage() {
  const { profile } = await getEnhancedUserProfile();

  if (!profile?.institution_id) {
    redirect('/');
  }

  const isStaff = ['admin', 'super_admin', 'hod', 'principal'].includes(profile.role || '');

  if (!isStaff) {
    redirect('/grievance');
  }

  // Fetch SLA-breached tickets (these are the real "escalations")
  let breachedTickets: any[] = [];
  let atRiskTickets: any[] = [];
  try {
    const breachedResult = await getTickets({
      institution_id: profile.institution_id,
      sla_status: 'breached',
      page: 1,
      limit: 50,
      sortBy: 'created_at',
      sortDirection: 'desc',
    });
    breachedTickets = breachedResult.data || [];

    // Also fetch urgent/high priority open tickets that are at risk
    const atRiskResult = await getTickets({
      institution_id: profile.institution_id,
      sla_status: 'at_risk',
      page: 1,
      limit: 50,
      sortBy: 'created_at',
      sortDirection: 'desc',
    });
    atRiskTickets = atRiskResult.data || [];
  } catch (error) {
    console.error('[grievance] Error loading escalations:', error);
    breachedTickets = [];
    atRiskTickets = [];
  }

  // Combine: breached first, then at-risk urgent/high only
  const escalations = [
    ...breachedTickets,
    ...atRiskTickets.filter(t => t.priority === 'urgent' || t.priority === 'high'),
  ];

  const urgentCount = escalations.filter(t => t.priority === 'urgent').length;
  const highCount = escalations.filter(t => t.priority === 'high').length;
  const breachedCount = breachedTickets.length;

  return (
    <ContentLayout title="Escalations">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Grievance', href: '/grievance' },
          { label: 'Escalations' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold py-1">Escalated Tickets</h1>
            <p className="text-sm text-muted-foreground">
              SLA-breached and at-risk high-priority tickets requiring immediate attention
            </p>
          </div>
          <Badge variant="destructive" className="text-lg px-4 py-2">
            {escalations.length} Active
          </Badge>
        </div>

        {/* Escalation Summary */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-red-200 bg-red-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-red-700">SLA Breached</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-700">
                {breachedCount}
              </div>
            </CardContent>
          </Card>

          <Card className="border-yellow-200 bg-yellow-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-yellow-700">Urgent Priority</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-700">
                {urgentCount}
              </div>
            </CardContent>
          </Card>

          <Card className="border-orange-200 bg-orange-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-orange-700">High Priority</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-700">
                {highCount}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Escalation List */}
        <div className="space-y-4">
          {escalations.map((ticket) => (
            <Card key={ticket.id} className={
              ticket.sla_status === 'breached' ? 'border-red-300' :
              ticket.priority === 'urgent' ? 'border-red-300' :
              ticket.priority === 'high' ? 'border-yellow-300' : ''
            }>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className={
                        ticket.sla_status === 'breached' ? 'h-4 w-4 text-red-500' :
                        ticket.priority === 'urgent' ? 'h-4 w-4 text-red-500' :
                        ticket.priority === 'high' ? 'h-4 w-4 text-yellow-500' :
                        'h-4 w-4 text-blue-500'
                      } />
                      <span className="text-sm font-mono text-muted-foreground">{ticket.ticket_number}</span>
                    </div>
                    <CardTitle className="text-lg">{ticket.subject}</CardTitle>
                    <CardDescription>{(ticket.category as any)?.name || 'Uncategorized'}</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Badge
                      variant={
                        ticket.priority === 'urgent' ? 'destructive' :
                        ticket.priority === 'high' ? 'default' : 'secondary'
                      }
                    >
                      {ticket.priority}
                    </Badge>
                    <Badge variant="outline" className={
                      ticket.sla_status === 'breached' ? 'bg-red-100 text-red-700' :
                      ticket.sla_status === 'at_risk' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-green-100 text-green-700'
                    }>
                      {ticket.sla_status.replace('_', ' ')}
                    </Badge>
                    <Badge variant="outline">{ticket.status.replace('_', ' ')}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {ticket.sla_status === 'breached' && ticket.sla_deadline && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                    <p className="text-sm font-medium text-red-800 mb-1">SLA Breached</p>
                    <p className="text-sm text-red-700">
                      Deadline was {format(new Date(ticket.sla_deadline), 'dd MMM yyyy, HH:mm')} — overdue by {formatDistanceToNow(new Date(ticket.sla_deadline))}
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>Raised by: {ticket.raised_by_name}</span>
                    </div>
                    {(ticket as any).assignee?.full_name && (
                      <div className="flex items-center gap-1">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span>Assigned to: {(ticket as any).assignee.full_name}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>{format(new Date(ticket.created_at), 'dd MMM yyyy, HH:mm')}</span>
                    </div>
                  </div>
                  <Button size="sm" asChild>
                    <Link href={`/grievance/tickets/${ticket.id}`}>Review</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {escalations.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No Active Escalations</p>
              <p className="text-muted-foreground">No SLA-breached or at-risk high-priority tickets found</p>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
