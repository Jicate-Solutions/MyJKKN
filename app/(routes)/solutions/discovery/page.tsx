import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, MapPin, Calendar, Users, Building2 } from 'lucide-react';
import { format } from 'date-fns';

export const metadata: Metadata = {
  title: 'Discovery Visits | Solutions Hub',
  description: 'Track client site visits and discovery sessions',
};

export default function DiscoveryPage() {
  // Placeholder data
  const visits = [
    {
      id: '1',
      client: { name: 'ABC University' },
      department: { name: 'Computer Science' },
      visit_date: '2026-02-01',
      visitors: [{ name: 'John Doe', role: 'Lead' }, { name: 'Jane Smith', role: 'Tech' }],
      pain_points: 'Manual student registration, outdated portal',
      opportunities: 'Full portal overhaul, mobile app development',
      follow_up_required: true,
      follow_up_date: '2026-02-15',
    },
    {
      id: '2',
      client: { name: 'XYZ Corp' },
      department: { name: 'IT' },
      visit_date: '2026-01-28',
      visitors: [{ name: 'Mike Johnson', role: 'Lead' }],
      pain_points: 'No centralized HR system',
      opportunities: 'Custom HR solution with payroll integration',
      follow_up_required: false,
      follow_up_date: null,
    },
    {
      id: '3',
      client: { name: 'DEF Institute' },
      department: { name: 'Media' },
      visit_date: '2026-01-25',
      visitors: [{ name: 'Sarah Wilson', role: 'Lead' }, { name: 'Tom Brown', role: 'Content' }],
      pain_points: 'Need professional video content for marketing',
      opportunities: 'Video production package, social media content',
      follow_up_required: true,
      follow_up_date: '2026-02-10',
    },
  ];

  return (
    <ContentLayout title="Discovery Visits">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Discovery' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold py-1">Discovery Visits</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Track client site visits and discovery sessions
            </p>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Log Visit
          </Button>
        </div>

        <div className="space-y-4">
          {visits.map((visit) => (
            <Card key={visit.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-muted">
                      <Building2 className="h-4 w-4" />
                    </div>
                    <div>
                      <CardTitle>{visit.client.name}</CardTitle>
                      <CardDescription>
                        {visit.department.name} Department
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {visit.follow_up_required && (
                      <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                        Follow-up Required
                      </Badge>
                    )}
                    <Badge variant="outline">
                      <Calendar className="mr-1 h-3 w-3" />
                      {format(new Date(visit.visit_date), 'dd MMM yyyy')}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {visit.visitors.map((v) => v.name).join(', ')}
                    </span>
                  </div>
                  {visit.follow_up_date && (
                    <div className="flex items-center gap-1 text-yellow-600">
                      <Calendar className="h-4 w-4" />
                      Follow-up: {format(new Date(visit.follow_up_date), 'dd MMM yyyy')}
                    </div>
                  )}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Pain Points</p>
                    <p className="text-sm">{visit.pain_points}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Opportunities</p>
                    <p className="text-sm">{visit.opportunities}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </ContentLayout>
  );
}
