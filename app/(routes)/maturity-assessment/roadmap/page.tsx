import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import {
  Map,
  Flag,
  CheckCircle,
  Clock,
  ArrowRight,
  Calendar
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Improvement Roadmap | Maturity Assessment',
  description: 'Track your improvement roadmap and milestones',
};

export default async function MaturityRoadmapPage() {
  const { profile } = await getEnhancedUserProfile();

  if (!profile?.institution_id) {
    redirect('/');
  }

  // Roadmap milestones
  const milestones = [
    {
      id: '1',
      title: 'Digital Infrastructure Upgrade',
      description: 'Upgrade network infrastructure and cloud capabilities',
      category: 'Digital Infrastructure',
      targetScore: 80,
      currentScore: 68,
      status: 'in_progress',
      deadline: '2026-06-30',
      tasks: [
        { name: 'Network audit', completed: true },
        { name: 'Cloud migration plan', completed: true },
        { name: 'Hardware procurement', completed: false },
        { name: 'Implementation', completed: false },
      ],
    },
    {
      id: '2',
      title: 'Research Excellence Program',
      description: 'Enhance research output and industry collaborations',
      category: 'Research & Innovation',
      targetScore: 75,
      currentScore: 65,
      status: 'planned',
      deadline: '2026-09-30',
      tasks: [
        { name: 'Research policy update', completed: false },
        { name: 'Faculty training', completed: false },
        { name: 'Industry partnerships', completed: false },
        { name: 'Publication targets', completed: false },
      ],
    },
    {
      id: '3',
      title: 'Student Service Enhancement',
      description: 'Improve student support services and satisfaction',
      category: 'Student Services',
      targetScore: 85,
      currentScore: 78,
      status: 'in_progress',
      deadline: '2026-03-31',
      tasks: [
        { name: 'Service audit', completed: true },
        { name: 'Staff training', completed: true },
        { name: 'Process automation', completed: true },
        { name: 'Feedback system', completed: false },
      ],
    },
    {
      id: '4',
      title: 'Governance Framework 2.0',
      description: 'Strengthen governance and compliance mechanisms',
      category: 'Governance & Compliance',
      targetScore: 95,
      currentScore: 85,
      status: 'completed',
      deadline: '2025-12-31',
      tasks: [
        { name: 'Policy documentation', completed: true },
        { name: 'Committee restructuring', completed: true },
        { name: 'Compliance audit', completed: true },
        { name: 'Training rollout', completed: true },
      ],
    },
  ];

  const statusColors: Record<string, string> = {
    completed: 'bg-green-100 text-green-700',
    in_progress: 'bg-yellow-100 text-yellow-700',
    planned: 'bg-blue-100 text-blue-700',
  };

  return (
    <ContentLayout title="Improvement Roadmap">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Maturity Assessment', href: '/maturity-assessment' },
          { label: 'Roadmap' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Improvement Roadmap</h1>
          <p className="text-sm text-muted-foreground">
            Track milestones and initiatives to improve maturity scores
          </p>
        </div>

        {/* Progress Overview */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {milestones.filter(m => m.status === 'completed').length}
              </div>
              <p className="text-xs text-muted-foreground">of {milestones.length} milestones</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Progress</CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {milestones.filter(m => m.status === 'in_progress').length}
              </div>
              <p className="text-xs text-muted-foreground">Active initiatives</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Planned</CardTitle>
              <Flag className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {milestones.filter(m => m.status === 'planned').length}
              </div>
              <p className="text-xs text-muted-foreground">Upcoming</p>
            </CardContent>
          </Card>
        </div>

        {/* Roadmap Timeline */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Map className="h-5 w-5" />
              Improvement Milestones
            </CardTitle>
            <CardDescription>
              Track progress towards maturity targets
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {milestones.map((milestone, i) => (
                <div key={milestone.id} className="relative">
                  {/* Timeline connector */}
                  {i < milestones.length - 1 && (
                    <div className="absolute left-4 top-10 bottom-0 w-0.5 bg-muted" />
                  )}

                  <div className="flex gap-4">
                    {/* Status indicator */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      milestone.status === 'completed'
                        ? 'bg-green-100 text-green-700'
                        : milestone.status === 'in_progress'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {milestone.status === 'completed' ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : milestone.status === 'in_progress' ? (
                        <Clock className="h-4 w-4" />
                      ) : (
                        <Flag className="h-4 w-4" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 pb-6">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-semibold">{milestone.title}</h3>
                          <p className="text-sm text-muted-foreground mt-1">
                            {milestone.description}
                          </p>
                        </div>
                        <Badge className={statusColors[milestone.status]}>
                          {milestone.status.replace('_', ' ')}
                        </Badge>
                      </div>

                      <div className="mt-3 flex items-center gap-4 text-sm">
                        <Badge variant="outline">{milestone.category}</Badge>
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">Score:</span>
                          <span className="font-medium">{milestone.currentScore}%</span>
                          <ArrowRight className="h-3 w-3" />
                          <span className="font-medium text-primary">{milestone.targetScore}%</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span>{milestone.deadline}</span>
                        </div>
                      </div>

                      {/* Tasks */}
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {milestone.tasks.map((task, j) => (
                          <div
                            key={j}
                            className={`flex items-center gap-2 text-sm ${
                              task.completed ? 'text-green-600' : 'text-muted-foreground'
                            }`}
                          >
                            {task.completed ? (
                              <CheckCircle className="h-3 w-3" />
                            ) : (
                              <div className="h-3 w-3 rounded-full border" />
                            )}
                            <span className={task.completed ? 'line-through' : ''}>
                              {task.name}
                            </span>
                          </div>
                        ))}
                      </div>
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
