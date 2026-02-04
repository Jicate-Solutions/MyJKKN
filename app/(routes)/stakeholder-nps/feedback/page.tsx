import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import {
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Meh,
  Filter,
  Download
} from 'lucide-react';
import { format } from 'date-fns';

export const metadata: Metadata = {
  title: 'Feedback | Stakeholder NPS',
  description: 'View detailed feedback from NPS surveys',
};

export default async function StakeholderFeedbackPage() {
  const { profile } = await getEnhancedUserProfile();

  if (!profile?.institution_id) {
    redirect('/');
  }

  // Placeholder feedback data
  const feedbackItems = [
    {
      id: '1',
      survey: 'Student Satisfaction Survey',
      respondent: 'Anonymous',
      segment: 'Students',
      score: 9,
      category: 'promoter',
      feedback: 'The new online portal is excellent! Makes everything so much easier.',
      date: '2026-02-04',
    },
    {
      id: '2',
      survey: 'Parent Feedback Survey',
      respondent: 'Anonymous',
      segment: 'Parents',
      score: 7,
      category: 'passive',
      feedback: 'Communication has improved but would like more frequent updates on academics.',
      date: '2026-02-03',
    },
    {
      id: '3',
      survey: 'Faculty Engagement Survey',
      respondent: 'Dr. Kumar',
      segment: 'Faculty',
      score: 4,
      category: 'detractor',
      feedback: 'Workload has increased significantly without adequate support.',
      date: '2026-02-02',
    },
    {
      id: '4',
      survey: 'Student Satisfaction Survey',
      respondent: 'Anonymous',
      segment: 'Students',
      score: 10,
      category: 'promoter',
      feedback: 'Best institution! The faculty and facilities are top-notch.',
      date: '2026-02-01',
    },
    {
      id: '5',
      survey: 'Alumni Survey',
      respondent: 'Rajesh M.',
      segment: 'Alumni',
      score: 8,
      category: 'passive',
      feedback: 'Good memories. Would love more alumni engagement programs.',
      date: '2026-01-30',
    },
    {
      id: '6',
      survey: 'Industry Partner Survey',
      respondent: 'XYZ Corp HR',
      segment: 'Industry',
      score: 9,
      category: 'promoter',
      feedback: 'Students are well-prepared. Placement support is excellent.',
      date: '2026-01-28',
    },
  ];

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'promoter':
        return <ThumbsUp className="h-4 w-4 text-green-500" />;
      case 'detractor':
        return <ThumbsDown className="h-4 w-4 text-red-500" />;
      default:
        return <Meh className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'promoter':
        return <Badge className="bg-green-100 text-green-700">Promoter</Badge>;
      case 'detractor':
        return <Badge className="bg-red-100 text-red-700">Detractor</Badge>;
      default:
        return <Badge className="bg-yellow-100 text-yellow-700">Passive</Badge>;
    }
  };

  return (
    <ContentLayout title="NPS Feedback">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Stakeholder NPS', href: '/stakeholder-nps' },
          { label: 'Feedback' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold py-1">Feedback Responses</h1>
            <p className="text-sm text-muted-foreground">
              Detailed feedback from NPS survey respondents
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline">
              <Filter className="mr-2 h-4 w-4" />
              Filter
            </Button>
            <Button variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Responses</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{feedbackItems.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Promoters</CardTitle>
              <ThumbsUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {feedbackItems.filter(f => f.category === 'promoter').length}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Passives</CardTitle>
              <Meh className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">
                {feedbackItems.filter(f => f.category === 'passive').length}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Detractors</CardTitle>
              <ThumbsDown className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {feedbackItems.filter(f => f.category === 'detractor').length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Feedback List */}
        <Card>
          <CardHeader>
            <CardTitle>All Feedback</CardTitle>
            <CardDescription>View feedback comments from survey responses</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {feedbackItems.map((item) => (
                <div key={item.id} className="p-4 rounded-lg border">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {getCategoryIcon(item.category)}
                        <span className="font-medium">{item.survey}</span>
                        <Badge variant="outline">{item.segment}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {item.respondent} • {format(new Date(item.date), 'dd MMM yyyy')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-center">
                        <span className={`text-2xl font-bold ${
                          item.score >= 9 ? 'text-green-600' :
                          item.score >= 7 ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                          {item.score}
                        </span>
                        <span className="text-xs text-muted-foreground">/10</span>
                      </div>
                      {getCategoryBadge(item.category)}
                    </div>
                  </div>
                  <div className="mt-3 p-3 rounded bg-muted">
                    <p className="text-sm">{item.feedback}</p>
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
