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
import { IndianRupee, TrendingUp, Users, AlertTriangle } from 'lucide-react';
import { useState } from 'react';

export default function FeeAnalyticsPage() {
  const [period, setPeriod] = useState('current');

  return (
    <ContentLayout title="Fee Analytics">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Fee Collection Analytics</h1>
            <p className="text-muted-foreground">Revenue tracking, collection rates, and defaulter analysis</p>
          </div>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="current">Current Semester</SelectItem>
              <SelectItem value="previous">Previous Semester</SelectItem>
              <SelectItem value="1y">Full Year</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Total Demand</CardTitle><IndianRupee className="h-4 w-4 text-muted-foreground" /></CardHeader>
            <CardContent><div className="text-2xl font-bold">42.5L</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Collected</CardTitle><TrendingUp className="h-4 w-4 text-green-600" /></CardHeader>
            <CardContent><div className="text-2xl font-bold text-green-600">34.8L</div><p className="text-xs text-muted-foreground">82%</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Pending</CardTitle><AlertTriangle className="h-4 w-4 text-yellow-600" /></CardHeader>
            <CardContent><div className="text-2xl font-bold text-yellow-600">7.7L</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Defaulters</CardTitle><Users className="h-4 w-4 text-red-600" /></CardHeader>
            <CardContent><div className="text-2xl font-bold text-red-600">38</div><p className="text-xs text-muted-foreground">students</p></CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Collection Trend</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[300px] flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/50">
              <p className="text-muted-foreground">Chart: Area chart showing cumulative collection vs demand over months</p>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Collection by Block</CardTitle></CardHeader>
            <CardContent>
              <div className="h-[250px] flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/50">
                <p className="text-muted-foreground">Chart: Horizontal bar chart showing collection rate by block</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Fee Type Breakdown</CardTitle></CardHeader>
            <CardContent>
              <div className="h-[250px] flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/50">
                <p className="text-muted-foreground">Chart: Pie chart showing fee breakdown (hostel, mess, maintenance, deposit)</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </ContentLayout>
  );
}
