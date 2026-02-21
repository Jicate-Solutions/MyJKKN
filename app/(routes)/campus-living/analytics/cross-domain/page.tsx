'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, AlertTriangle, TrendingUp, Lightbulb } from 'lucide-react';

export default function CrossDomainAnalyticsPage() {
  const correlations = [
    { title: 'Low Attendance + High Mess Opt-outs', risk: 'medium', description: 'Block B shows 15% lower attendance on weekends combined with 30% higher mess opt-outs, suggesting students leaving campus without proper leave.', action: 'Review Block B weekend leave policies' },
    { title: 'Maintenance Delays + Complaints', risk: 'high', description: 'Blocks with SLA breaches in plumbing show 40% more student complaints in feedback. Block D has 3 overdue plumbing requests.', action: 'Prioritize Block D plumbing backlog' },
    { title: 'Fee Defaulters + Safety Incidents', risk: 'low', description: 'No significant correlation between fee payment status and safety incidents.', action: 'No action needed' },
    { title: 'Mess Rating + Waste', risk: 'medium', description: 'Days with lower ratings (< 3.0) show 25% more plate waste. Correlation suggests food quality drives waste.', action: 'Improve menu items with consistently low ratings' },
  ];

  return (
    <ContentLayout title="Cross-Domain Analytics">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Cross-Domain Risk Correlation</h1>
          <p className="text-muted-foreground">
            AI-powered correlation analysis across attendance, mess, maintenance, safety, and fees
          </p>
        </div>

        <Card>
          <CardHeader><CardTitle>Correlation Matrix</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[350px] flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/50">
              <p className="text-muted-foreground">Chart: Heatmap matrix showing correlation strength between domains (Attendance, Mess, Maintenance, Safety, Fees)</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5" />
              Insights & Correlations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {correlations.map((item, idx) => (
                <div key={idx} className="p-4 border rounded-lg">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-semibold">{item.title}</h4>
                    <Badge className={
                      item.risk === 'high' ? 'bg-red-100 text-red-800 hover:bg-red-100' :
                      item.risk === 'medium' ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100' :
                      'bg-green-100 text-green-800 hover:bg-green-100'
                    }>
                      {item.risk} risk
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">{item.description}</p>
                  <div className="flex items-center gap-2 text-sm">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <span className="font-medium text-primary">Recommended: {item.action}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Domain Health Dashboard</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[300px] flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/50">
              <p className="text-muted-foreground">Chart: Radar chart showing health score for each domain</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
