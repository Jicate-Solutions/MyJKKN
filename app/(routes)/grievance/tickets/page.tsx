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
  Plus,
  Clock,
  CheckCircle,
  AlertCircle,
  MessageSquare
} from 'lucide-react';
import { format } from 'date-fns';

export const metadata: Metadata = {
  title: 'All Tickets | Grievance',
  description: 'View and manage all grievance tickets',
};

export default async function GrievanceTicketsPage() {
  const { profile } = await getEnhancedUserProfile();

  if (!profile?.institution_id) {
    redirect('/');
  }

  // Fetch tickets using the shared data function
  const ticketsResult = await getTickets({
    institution_id: profile.institution_id,
    page: 1,
    limit: 50,
    sortBy: 'created_at',
    sortDirection: 'desc',
  });

  const tickets = ticketsResult.data || [];

  const statusColors: Record<string, string> = {
    open: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-yellow-100 text-yellow-700',
    pending_info: 'bg-purple-100 text-purple-700',
    resolved: 'bg-green-100 text-green-700',
    closed: 'bg-gray-100 text-gray-700',
  };

  const priorityColors: Record<string, string> = {
    urgent: 'bg-red-100 text-red-700',
    high: 'bg-orange-100 text-orange-700',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-green-100 text-green-700',
  };

  return (
    <ContentLayout title="All Tickets">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Grievance', href: '/grievance' },
          { label: 'All Tickets' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold py-1">All Grievance Tickets</h1>
            <p className="text-sm text-muted-foreground">
              View and manage grievance tickets across the institution
            </p>
          </div>
          <Button asChild>
            <Link href="/grievance/tickets/new">
              <Plus className="mr-2 h-4 w-4" />
              New Ticket
            </Link>
          </Button>
        </div>

        {/* Quick Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Open</CardTitle>
              <AlertCircle className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {tickets.filter(t => t.status === 'open').length}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Progress</CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {tickets.filter(t => t.status === 'in_progress').length}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Resolved</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {tickets.filter(t => t.status === 'resolved').length}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{ticketsResult.metadata.total}</div>
            </CardContent>
          </Card>
        </div>

        {/* Tickets List */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Tickets</CardTitle>
            <CardDescription>Showing latest {tickets.length} of {ticketsResult.metadata.total} tickets</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {tickets.map((ticket) => (
                <Link
                  key={ticket.id}
                  href={`/grievance/tickets/${ticket.id}`}
                  className="block"
                >
                  <div className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-muted-foreground">
                          {ticket.ticket_number}
                        </span>
                        <Badge className={priorityColors[ticket.priority] || ''}>
                          {ticket.priority}
                        </Badge>
                      </div>
                      <p className="font-medium">{ticket.subject}</p>
                      <p className="text-sm text-muted-foreground">
                        {(ticket.category as any)?.name || 'Uncategorized'} • by {ticket.raised_by_name}
                      </p>
                    </div>
                    <div className="text-right space-y-1">
                      <Badge className={statusColors[ticket.status] || ''}>
                        {ticket.status.replace('_', ' ')}
                      </Badge>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(ticket.created_at), 'dd MMM yyyy')}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}

              {tickets.length === 0 && (
                <div className="py-12 text-center">
                  <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">No Tickets Found</p>
                  <p className="text-muted-foreground">Create your first grievance ticket</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
