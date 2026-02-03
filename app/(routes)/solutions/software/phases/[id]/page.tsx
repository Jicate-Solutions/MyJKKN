'use client';

import { use } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  ArrowLeft,
  GitBranch,
  Users,
  Calendar,
  DollarSign,
  Plus,
  ExternalLink,
} from 'lucide-react';
import { format } from 'date-fns';

interface PhaseDetailPageProps {
  params: Promise<{ id: string }>;
}

function formatCurrency(amount: number | null): string {
  if (!amount) return '-';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function PhaseDetailPage({ params }: PhaseDetailPageProps) {
  const { id } = use(params);

  // Placeholder data
  const phase = {
    id,
    phase_number: 1,
    title: 'Core Features',
    description: 'Building core user management and dashboard features',
    status: 'prototype_building',
    solution: {
      id: '1',
      solution_code: 'JKKN-SOL-2026-001',
      title: 'Student Portal Enhancement',
    },
    department: { name: 'Computer Science' },
    estimated_value: 150000,
    start_date: '2026-02-01',
    due_date: '2026-03-15',
    builders: [
      { id: '1', name: 'John Doe', role: 'lead', status: 'active' },
      { id: '2', name: 'Jane Smith', role: 'contributor', status: 'active' },
    ],
    iterations: [
      { version: 1, url: 'https://prototype-v1.vercel.app', approved: true },
      { version: 2, url: 'https://prototype-v2.vercel.app', approved: false },
    ],
  };

  const statusConfig: Record<string, { label: string; color: string }> = {
    prototype_building: { label: 'Building', color: 'bg-yellow-100 text-yellow-800' },
    client_demo: { label: 'Demo', color: 'bg-orange-100 text-orange-800' },
    approved: { label: 'Approved', color: 'bg-green-100 text-green-800' },
  };

  const status = statusConfig[phase.status] || { label: phase.status, color: 'bg-gray-100' };

  return (
    <ContentLayout title="Phase Details">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Software', href: '/solutions/software' },
          { label: 'Phases', href: '/solutions/software/phases' },
          { label: `Phase ${phase.phase_number}` },
        ]}
      />
      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/solutions/software/phases">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <GitBranch className="h-5 w-5 text-blue-600" />
                <Badge className={status.color}>{status.label}</Badge>
              </div>
              <h1 className="text-2xl font-bold">
                Phase {phase.phase_number}: {phase.title}
              </h1>
              <Link
                href={`/solutions/${phase.solution.id}`}
                className="text-muted-foreground hover:underline"
              >
                {phase.solution.solution_code} - {phase.solution.title}
              </Link>
            </div>
          </div>
          <Button>Edit Phase</Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Details */}
          <Card>
            <CardHeader>
              <CardTitle>Phase Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {phase.description && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Description</p>
                  <p className="text-sm">{phase.description}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1">
                    <DollarSign className="h-3 w-3" /> Estimated Value
                  </p>
                  <p className="text-lg font-semibold">{formatCurrency(phase.estimated_value)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Department</p>
                  <p>{phase.department.name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Start Date
                  </p>
                  <p>{format(new Date(phase.start_date), 'PPP')}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Due Date
                  </p>
                  <p>{format(new Date(phase.due_date), 'PPP')}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Builders */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Assigned Builders
                </CardTitle>
                <CardDescription>{phase.builders.length} builders assigned</CardDescription>
              </div>
              <Button size="sm" variant="outline">
                <Plus className="mr-2 h-3 w-3" />
                Assign
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {phase.builders.map((builder) => (
                  <div
                    key={builder.id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>
                          {builder.name.split(' ').map((n) => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{builder.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{builder.role}</p>
                      </div>
                    </div>
                    <Badge variant={builder.status === 'active' ? 'default' : 'secondary'}>
                      {builder.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Prototype Iterations */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Prototype Iterations</CardTitle>
              <CardDescription>Version history and client feedback</CardDescription>
            </div>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add Iteration
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {phase.iterations.map((iteration) => (
                <div
                  key={iteration.version}
                  className="flex items-center justify-between p-4 rounded-lg border"
                >
                  <div>
                    <p className="font-medium">Version {iteration.version}</p>
                    <a
                      href={iteration.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline flex items-center gap-1"
                    >
                      {iteration.url}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <Badge variant={iteration.approved ? 'default' : 'secondary'}>
                    {iteration.approved ? 'Approved' : 'Pending Review'}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
