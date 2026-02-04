import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import {
  Workflow,
  Play,
  Pause,
  Settings,
  Plus,
  ArrowRight,
  Clock
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Workflows | Process Excellence',
  description: 'Manage and monitor process workflows',
};

export default async function ProcessWorkflowsPage() {
  const { profile } = await getEnhancedUserProfile();

  if (!profile?.institution_id) {
    redirect('/');
  }

  // Placeholder workflows
  const workflows = [
    {
      id: '1',
      name: 'Student Admission',
      description: 'End-to-end admission process from enquiry to enrollment',
      status: 'active',
      steps: 8,
      avgTime: '5 days',
      instances: 45,
    },
    {
      id: '2',
      name: 'Fee Collection',
      description: 'Billing, payment, and receipt generation workflow',
      status: 'active',
      steps: 5,
      avgTime: '1 day',
      instances: 234,
    },
    {
      id: '3',
      name: 'Leave Approval',
      description: 'Staff and student leave application and approval',
      status: 'active',
      steps: 4,
      avgTime: '2 days',
      instances: 89,
    },
    {
      id: '4',
      name: 'Grievance Resolution',
      description: 'Complaint registration, routing, and resolution',
      status: 'paused',
      steps: 6,
      avgTime: '3 days',
      instances: 12,
    },
    {
      id: '5',
      name: 'Resource Booking',
      description: 'Room and equipment reservation workflow',
      status: 'active',
      steps: 3,
      avgTime: '1 hour',
      instances: 156,
    },
  ];

  return (
    <ContentLayout title="Process Workflows">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Process Excellence', href: '/process-excellence' },
          { label: 'Workflows' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold py-1">Process Workflows</h1>
            <p className="text-sm text-muted-foreground">
              Manage and monitor automated business processes
            </p>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Workflow
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Workflows</CardTitle>
              <Play className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {workflows.filter(w => w.status === 'active').length}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Running Instances</CardTitle>
              <Workflow className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {workflows.reduce((sum, w) => sum + w.instances, 0)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Paused</CardTitle>
              <Pause className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {workflows.filter(w => w.status === 'paused').length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Workflows List */}
        <Card>
          <CardHeader>
            <CardTitle>All Workflows</CardTitle>
            <CardDescription>Manage your business process workflows</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {workflows.map((workflow) => (
                <div key={workflow.id} className="p-4 rounded-lg border hover:bg-muted/50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Workflow className="h-4 w-4 text-primary" />
                        <span className="font-medium">{workflow.name}</span>
                        {workflow.status === 'active' ? (
                          <Badge className="bg-green-100 text-green-700">Active</Badge>
                        ) : (
                          <Badge className="bg-yellow-100 text-yellow-700">Paused</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{workflow.description}</p>
                    </div>
                    <Button variant="ghost" size="sm">
                      <Settings className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="mt-3 flex items-center gap-6 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <span>{workflow.steps} steps</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>Avg: {workflow.avgTime}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span>{workflow.instances} active instances</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
