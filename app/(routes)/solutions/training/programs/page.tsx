import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Plus, BookOpen, Users, Calendar, ArrowRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Training Programs | Solutions Hub',
  description: 'Manage training programs',
};

export default function ProgramsPage() {
  // Placeholder data
  const programs = [
    {
      id: '1',
      title: 'AI Workshop Series',
      type: 'workshop',
      solution: { id: '1', code: 'JKKN-SOL-2026-002' },
      participant_count: 30,
      session_count: 5,
      status: 'active',
    },
    {
      id: '2',
      title: 'Full Stack Bootcamp',
      type: 'bootcamp',
      solution: { id: '2', code: 'JKKN-SOL-2026-004' },
      participant_count: 25,
      session_count: 12,
      status: 'active',
    },
    {
      id: '3',
      title: 'Data Science Certification',
      type: 'certification',
      solution: { id: '3', code: 'JKKN-SOL-2026-006' },
      participant_count: 20,
      session_count: 8,
      status: 'planned',
    },
  ];

  return (
    <ContentLayout title="Training Programs">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Training', href: '/solutions/training' },
          { label: 'Programs' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold py-1">Training Programs</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              All training programs across solutions
            </p>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Program
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {programs.map((program) => (
            <Card key={program.id} className="hover:border-primary transition-colors">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Badge variant={program.status === 'active' ? 'default' : 'secondary'}>
                    {program.status}
                  </Badge>
                  <Badge variant="outline" className="capitalize">
                    {program.type}
                  </Badge>
                </div>
                <CardTitle className="mt-2">{program.title}</CardTitle>
                <CardDescription>
                  <Link href={`/solutions/${program.solution.id}`} className="hover:underline">
                    {program.solution.code}
                  </Link>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      {program.participant_count} participants
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {program.session_count} sessions
                    </span>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="w-full mt-4" asChild>
                  <Link href={`/solutions/training/programs/${program.id}`}>
                    View Details
                    <ArrowRight className="ml-2 h-3 w-3" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </ContentLayout>
  );
}
