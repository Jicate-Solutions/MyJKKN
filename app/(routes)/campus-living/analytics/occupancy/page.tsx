'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Building2, TrendingUp } from 'lucide-react';
import { useState } from 'react';

export default function OccupancyAnalyticsPage() {
  const [period, setPeriod] = useState('30d');

  const blockData = [
    { block: 'Block A', total: 100, occupied: 96, rate: 96 },
    { block: 'Block B', total: 80, occupied: 74, rate: 93 },
    { block: 'Block C', total: 120, occupied: 114, rate: 95 },
    { block: 'Block D', total: 60, occupied: 55, rate: 92 },
    { block: 'Block E', total: 60, occupied: 56, rate: 93 },
  ];

  return (
    <ContentLayout title="Occupancy Analytics">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Occupancy Trends</h1>
            <p className="text-muted-foreground">Room occupancy analysis by block, floor, and room type</p>
          </div>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="90d">Last 90 Days</SelectItem>
              <SelectItem value="1y">Last Year</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Overall Rate</p><p className="text-2xl font-bold">94%</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Total Beds</p><p className="text-2xl font-bold">420</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Occupied</p><p className="text-2xl font-bold text-green-600">395</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Vacant</p><p className="text-2xl font-bold text-blue-600">25</p></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Occupancy Trend</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[300px] flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/50">
              <p className="text-muted-foreground">Chart: Line chart showing occupancy rate over time by block</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Block-wise Occupancy</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              {blockData.map((block) => (
                <div key={block.block} className="flex items-center gap-4">
                  <div className="w-20 font-medium">{block.block}</div>
                  <div className="flex-1">
                    <div className="w-full bg-gray-200 rounded-full h-4">
                      <div
                        className={`rounded-full h-4 ${block.rate >= 95 ? 'bg-green-500' : block.rate >= 85 ? 'bg-yellow-500' : 'bg-red-500'}`}
                        style={{ width: `${block.rate}%` }}
                      />
                    </div>
                  </div>
                  <div className="w-32 text-right text-sm">
                    <span className="font-medium">{block.occupied}/{block.total}</span>
                    <span className="text-muted-foreground ml-2">({block.rate}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Occupancy by Room Type</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[250px] flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/50">
              <p className="text-muted-foreground">Chart: Bar chart showing occupancy by room type (Single, Double, Triple, Dormitory)</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
