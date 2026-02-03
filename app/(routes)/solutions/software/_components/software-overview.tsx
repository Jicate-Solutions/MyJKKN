'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Hammer,
  Users,
  GitBranch,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Plus,
} from 'lucide-react';

export function SoftwareOverview() {
  // Placeholder stats
  const stats = {
    activeSolutions: 12,
    totalPhases: 45,
    activePhases: 24,
    completedPhases: 18,
    builders: 18,
    pendingAssignments: 5,
  };

  const recentPhases = [
    {
      id: '1',
      title: 'Core Features',
      solution: { code: 'JKKN-SOL-2026-001', title: 'Student Portal' },
      status: 'prototype_building',
      builders: 2,
    },
    {
      id: '2',
      title: 'Authentication Module',
      solution: { code: 'JKKN-SOL-2026-002', title: 'HR System' },
      status: 'client_demo',
      builders: 1,
    },
    {
      id: '3',
      title: 'Reporting Dashboard',
      solution: { code: 'JKKN-SOL-2026-003', title: 'Analytics Tool' },
      status: 'approved',
      builders: 3,
    },
  ];

  const statusColors: Record<string, string> = {
    prospecting: 'bg-gray-100 text-gray-800',
    discovery: 'bg-blue-100 text-blue-800',
    prd_writing: 'bg-indigo-100 text-indigo-800',
    prototype_building: 'bg-yellow-100 text-yellow-800',
    client_demo: 'bg-orange-100 text-orange-800',
    revisions: 'bg-pink-100 text-pink-800',
    approved: 'bg-green-100 text-green-800',
    deploying: 'bg-purple-100 text-purple-800',
    training: 'bg-teal-100 text-teal-800',
    live: 'bg-emerald-100 text-emerald-800',
    completed: 'bg-slate-100 text-slate-800',
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Solutions</CardTitle>
            <Hammer className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeSolutions}</div>
            <p className="text-xs text-muted-foreground">Software projects</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Phases</CardTitle>
            <GitBranch className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activePhases}</div>
            <p className="text-xs text-muted-foreground">
              of {stats.totalPhases} total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Builders</CardTitle>
            <Users className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.builders}</div>
            <p className="text-xs text-muted-foreground">Active talent</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingAssignments}</div>
            <p className="text-xs text-muted-foreground">Awaiting approval</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="hover:border-primary transition-colors">
          <Link href="/solutions/software/phases">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                All Phases
                <ArrowRight className="h-4 w-4" />
              </CardTitle>
              <CardDescription>
                View and manage all development phases
              </CardDescription>
            </CardHeader>
          </Link>
        </Card>

        <Card className="hover:border-primary transition-colors">
          <Link href="/solutions/software/builders">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Builder Pool
                <ArrowRight className="h-4 w-4" />
              </CardTitle>
              <CardDescription>
                Manage builder talent and skills
              </CardDescription>
            </CardHeader>
          </Link>
        </Card>

        <Card className="hover:border-primary transition-colors">
          <Link href="/solutions/list?type=software">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Software Solutions
                <ArrowRight className="h-4 w-4" />
              </CardTitle>
              <CardDescription>
                View all software projects
              </CardDescription>
            </CardHeader>
          </Link>
        </Card>
      </div>

      {/* Recent Phases */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Active Phases</CardTitle>
            <CardDescription>Currently active development phases</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/solutions/software/phases">
              View All <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentPhases.map((phase) => (
              <div
                key={phase.id}
                className="flex items-center justify-between p-4 rounded-lg border"
              >
                <div className="flex-1">
                  <Link
                    href={`/solutions/software/phases/${phase.id}`}
                    className="font-medium hover:underline"
                  >
                    {phase.title}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {phase.solution.code} - {phase.solution.title}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right text-sm">
                    <div className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {phase.builders} builders
                    </div>
                  </div>
                  <Badge className={statusColors[phase.status] || 'bg-gray-100'}>
                    {phase.status.replace(/_/g, ' ')}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Phase Status Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 py-4">
            <div className="p-3 rounded-full bg-yellow-100">
              <Clock className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.activePhases}</p>
              <p className="text-sm text-muted-foreground">In Progress</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 py-4">
            <div className="p-3 rounded-full bg-green-100">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.completedPhases}</p>
              <p className="text-sm text-muted-foreground">Completed</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 py-4">
            <div className="p-3 rounded-full bg-orange-100">
              <AlertCircle className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.pendingAssignments}</p>
              <p className="text-sm text-muted-foreground">Need Attention</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
