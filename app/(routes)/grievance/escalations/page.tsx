import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import {
  AlertTriangle,
  Clock,
  ArrowUpRight,
  User,
  Calendar
} from 'lucide-react';
import { format } from 'date-fns';

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

  // Placeholder escalations data
  const escalations = [
    {
      id: 'ESC-001',
      ticket_number: 'GRV-2026-0045',
      title: 'Repeated network issues in Block A',
      category: 'Infrastructure',
      escalated_by: 'Dr. Kumar',
      escalated_to: 'Principal',
      escalated_at: new Date('2026-02-04T10:00:00'),
      reason: 'Issue persisting for more than 2 weeks despite multiple attempts',
      priority: 'high',
      status: 'pending',
    },
    {
      id: 'ESC-002',
      ticket_number: 'GRV-2026-0038',
      title: 'Faculty behavior complaint',
      category: 'Faculty',
      escalated_by: 'HOD - CSE',
      escalated_to: 'Principal',
      escalated_at: new Date('2026-02-03T14:30:00'),
      reason: 'Sensitive matter requiring higher authority intervention',
      priority: 'critical',
      status: 'under_review',
    },
    {
      id: 'ESC-003',
      ticket_number: 'GRV-2026-0029',
      title: 'Scholarship disbursement delay',
      category: 'Administrative',
      escalated_by: 'Accounts Officer',
      escalated_to: 'Dean - Student Affairs',
      escalated_at: new Date('2026-02-02T09:15:00'),
      reason: 'Budget allocation issue - needs management approval',
      priority: 'medium',
      status: 'pending',
    },
  ];

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
              Review and resolve escalated grievances requiring higher authority
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
              <CardTitle className="text-sm font-medium text-red-700">Critical</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-700">
                {escalations.filter(e => e.priority === 'critical').length}
              </div>
            </CardContent>
          </Card>

          <Card className="border-yellow-200 bg-yellow-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-yellow-700">High Priority</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-700">
                {escalations.filter(e => e.priority === 'high').length}
              </div>
            </CardContent>
          </Card>

          <Card className="border-blue-200 bg-blue-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-blue-700">Medium</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-700">
                {escalations.filter(e => e.priority === 'medium').length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Escalation List */}
        <div className="space-y-4">
          {escalations.map((esc) => (
            <Card key={esc.id} className={
              esc.priority === 'critical' ? 'border-red-300' :
              esc.priority === 'high' ? 'border-yellow-300' : ''
            }>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className={
                        esc.priority === 'critical' ? 'h-4 w-4 text-red-500' :
                        esc.priority === 'high' ? 'h-4 w-4 text-yellow-500' :
                        'h-4 w-4 text-blue-500'
                      } />
                      <span className="text-sm font-mono text-muted-foreground">{esc.ticket_number}</span>
                    </div>
                    <CardTitle className="text-lg">{esc.title}</CardTitle>
                    <CardDescription>{esc.category}</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Badge
                      variant={
                        esc.priority === 'critical' ? 'destructive' :
                        esc.priority === 'high' ? 'default' : 'secondary'
                      }
                    >
                      {esc.priority}
                    </Badge>
                    <Badge variant="outline">{esc.status.replace('_', ' ')}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 rounded-lg bg-muted">
                  <p className="text-sm font-medium mb-1">Escalation Reason:</p>
                  <p className="text-sm text-muted-foreground">{esc.reason}</p>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>From: {esc.escalated_by}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                      <span>To: {esc.escalated_to}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>{format(esc.escalated_at, 'dd MMM yyyy, HH:mm')}</span>
                    </div>
                  </div>
                  <Button size="sm">Review</Button>
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
              <p className="text-muted-foreground">All escalated tickets have been resolved</p>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
