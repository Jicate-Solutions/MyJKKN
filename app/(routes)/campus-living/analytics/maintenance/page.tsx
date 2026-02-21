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
import { Wrench, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useState } from 'react';

export default function MaintenanceAnalyticsPage() {
  const [period, setPeriod] = useState('30d');

  return (
    <ContentLayout title="Maintenance Analytics">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Maintenance SLA Performance</h1>
            <p className="text-muted-foreground">Resolution times, SLA compliance, and category analysis</p>
          </div>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="90d">Last Quarter</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Total Requests</CardTitle><Wrench className="h-4 w-4 text-muted-foreground" /></CardHeader>
            <CardContent><div className="text-2xl font-bold">47</div><p className="text-xs text-muted-foreground">this month</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Avg Resolution</CardTitle><Clock className="h-4 w-4 text-muted-foreground" /></CardHeader>
            <CardContent><div className="text-2xl font-bold">18h</div><p className="text-xs text-green-600">-4h vs last month</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">SLA Compliance</CardTitle><CheckCircle2 className="h-4 w-4 text-green-600" /></CardHeader>
            <CardContent><div className="text-2xl font-bold text-green-600">87%</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">SLA Breaches</CardTitle><AlertTriangle className="h-4 w-4 text-red-600" /></CardHeader>
            <CardContent><div className="text-2xl font-bold text-red-600">6</div></CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Resolution Time Trend</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[300px] flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/50">
              <p className="text-muted-foreground">Chart: Line chart showing avg resolution time by priority over selected period</p>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Requests by Category</CardTitle></CardHeader>
            <CardContent>
              <div className="h-[250px] flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/50">
                <p className="text-muted-foreground">Chart: Pie/donut chart showing request distribution by category</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Block-wise Requests</CardTitle></CardHeader>
            <CardContent>
              <div className="h-[250px] flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/50">
                <p className="text-muted-foreground">Chart: Horizontal bar chart showing requests per block</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>SLA Compliance by Category</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { category: 'Plumbing', total: 15, withinSla: 13, rate: 87 },
                { category: 'Electrical', total: 12, withinSla: 11, rate: 92 },
                { category: 'Civil', total: 8, withinSla: 6, rate: 75 },
                { category: 'Carpentry', total: 5, withinSla: 5, rate: 100 },
                { category: 'Cleaning', total: 7, withinSla: 6, rate: 86 },
              ].map((cat) => (
                <div key={cat.category} className="flex items-center gap-4">
                  <div className="w-24 font-medium text-sm">{cat.category}</div>
                  <div className="flex-1">
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div className={`rounded-full h-3 ${cat.rate >= 90 ? 'bg-green-500' : cat.rate >= 80 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${cat.rate}%` }} />
                    </div>
                  </div>
                  <div className="w-24 text-right text-sm">
                    <span className="font-medium">{cat.rate}%</span>
                    <span className="text-muted-foreground ml-1">({cat.withinSla}/{cat.total})</span>
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
