import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import {
  Target,
  TrendingUp,
  Award,
  Building2
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Benchmarks | Maturity Assessment',
  description: 'Compare your scores with industry benchmarks',
};

export default async function MaturityBenchmarksPage() {
  const { profile } = await getEnhancedUserProfile();

  if (!profile?.institution_id) {
    redirect('/');
  }

  // Benchmark categories
  const benchmarks = [
    {
      category: 'Academic Excellence',
      yourScore: 82,
      industryAvg: 75,
      topQuartile: 90,
      trend: 'up',
    },
    {
      category: 'Digital Infrastructure',
      yourScore: 68,
      industryAvg: 72,
      topQuartile: 85,
      trend: 'up',
    },
    {
      category: 'Student Services',
      yourScore: 78,
      industryAvg: 70,
      topQuartile: 88,
      trend: 'stable',
    },
    {
      category: 'Research & Innovation',
      yourScore: 65,
      industryAvg: 68,
      topQuartile: 82,
      trend: 'down',
    },
    {
      category: 'Governance & Compliance',
      yourScore: 85,
      industryAvg: 78,
      topQuartile: 92,
      trend: 'up',
    },
    {
      category: 'Industry Connect',
      yourScore: 72,
      industryAvg: 65,
      topQuartile: 80,
      trend: 'up',
    },
  ];

  return (
    <ContentLayout title="Benchmarks">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Maturity Assessment', href: '/maturity-assessment' },
          { label: 'Benchmarks' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Industry Benchmarks</h1>
          <p className="text-sm text-muted-foreground">
            Compare your maturity scores with industry standards and peers
          </p>
        </div>

        {/* Overall Position */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                Your Overall Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-primary">75%</div>
              <p className="text-sm text-muted-foreground mt-2">
                Above average in 4 of 6 categories
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                Industry Average
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold">71%</div>
              <p className="text-sm text-muted-foreground mt-2">
                Based on 250+ institutions
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5 text-yellow-500" />
                Top Quartile
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold">86%</div>
              <p className="text-sm text-muted-foreground mt-2">
                Excellence threshold
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Category Benchmarks */}
        <Card>
          <CardHeader>
            <CardTitle>Category-wise Comparison</CardTitle>
            <CardDescription>
              Your scores compared to industry benchmarks
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {benchmarks.map((item, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{item.category}</span>
                      <Badge
                        variant={
                          item.trend === 'up' ? 'default' :
                          item.trend === 'down' ? 'destructive' : 'secondary'
                        }
                        className={
                          item.trend === 'up' ? 'bg-green-100 text-green-700' :
                          item.trend === 'down' ? '' : ''
                        }
                      >
                        {item.trend === 'up' ? '↑' : item.trend === 'down' ? '↓' : '→'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-primary font-bold">{item.yourScore}%</span>
                      <span className="text-muted-foreground">|</span>
                      <span>Avg: {item.industryAvg}%</span>
                      <span className="text-muted-foreground">|</span>
                      <span>Top: {item.topQuartile}%</span>
                    </div>
                  </div>
                  <div className="relative h-3 bg-muted rounded-full overflow-hidden">
                    {/* Industry Average Marker */}
                    <div
                      className="absolute h-full w-0.5 bg-gray-400 z-10"
                      style={{ left: `${item.industryAvg}%` }}
                    />
                    {/* Top Quartile Marker */}
                    <div
                      className="absolute h-full w-0.5 bg-yellow-500 z-10"
                      style={{ left: `${item.topQuartile}%` }}
                    />
                    {/* Your Score */}
                    <div
                      className={`h-full rounded-full transition-all ${
                        item.yourScore >= item.industryAvg
                          ? 'bg-primary'
                          : 'bg-orange-500'
                      }`}
                      style={{ width: `${item.yourScore}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-6 mt-6 pt-6 border-t text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-primary" />
                <span>Your Score</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-0.5 bg-gray-400" />
                <span>Industry Average</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-0.5 bg-yellow-500" />
                <span>Top Quartile</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
