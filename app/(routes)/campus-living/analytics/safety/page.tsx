'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Shield, AlertTriangle, ClipboardCheck, TrendingUp } from 'lucide-react';
import { useState } from 'react';

export default function SafetyAnalyticsPage() {
  const [period, setPeriod] = useState('90d');

  return (
    <ContentLayout title="Safety Analytics">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Safety Score Trends</h1>
            <p className="text-muted-foreground">Incident trends, compliance rates, and inspection analysis</p>
          </div>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="90d">Last Quarter</SelectItem>
              <SelectItem value="1y">Last Year</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Safety Score</CardTitle><Shield className="h-4 w-4 text-green-600" /></CardHeader>
            <CardContent><div className="text-2xl font-bold text-green-600">92%</div><p className="text-xs text-green-600">+1% vs last quarter</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Incidents</CardTitle><AlertTriangle className="h-4 w-4 text-muted-foreground" /></CardHeader>
            <CardContent><div className="text-2xl font-bold">12</div><p className="text-xs text-muted-foreground">this quarter</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Inspection Avg</CardTitle><ClipboardCheck className="h-4 w-4 text-muted-foreground" /></CardHeader>
            <CardContent><div className="text-2xl font-bold">91%</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Resolution Rate</CardTitle><TrendingUp className="h-4 w-4 text-muted-foreground" /></CardHeader>
            <CardContent><div className="text-2xl font-bold">85%</div><p className="text-xs text-muted-foreground">within 7 days</p></CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Safety Score Over Time</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[300px] flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/50">
              <p className="text-muted-foreground">Chart: Line chart showing composite safety score trend over months</p>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Incidents by Type</CardTitle></CardHeader>
            <CardContent>
              <div className="h-[250px] flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/50">
                <p className="text-muted-foreground">Chart: Donut chart showing incident distribution by type</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Incident Severity Trend</CardTitle></CardHeader>
            <CardContent>
              <div className="h-[250px] flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/50">
                <p className="text-muted-foreground">Chart: Stacked bar chart showing incidents by severity per month</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Inspection Scores History</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[250px] flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/50">
              <p className="text-muted-foreground">Chart: Bar chart showing inspection scores by type over time</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
