'use client';

import { useState, useMemo } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useOccupancyAnalytics } from '@/hooks/campus-living/use-campus-living-analytics';
import { PreviewBanner } from '../../_components/preview-banner';

export default function OccupancyAnalyticsPage() {
  const [period, setPeriod] = useState('30d');
  const { profile } = useAuth();
  const { isLoading: permsLoading } = usePermissions();
  const institutionId = profile?.institution_id ?? '';
  const { data: occupancy, isLoading, error } = useOccupancyAnalytics(institutionId);

  // Block-wise rows for the on-screen bar list
  const blockData = useMemo(() => {
    if (!occupancy?.by_block) return [];
    return occupancy.by_block.map((b) => ({
      block: b.code || b.name,
      total: b.capacity,
      occupied: b.occupancy,
      rate: b.percentage,
    }));
  }, [occupancy]);

  // Bar chart data for occupancy by hostel type
  const typeChartData = useMemo(() => {
    if (!occupancy?.by_type) return [];
    return occupancy.by_type.map((t) => ({
      type: t.type,
      Capacity: t.capacity,
      Occupied: t.occupancy,
      Available: t.capacity - t.occupancy,
    }));
  }, [occupancy]);

  // permsLoading: the query stays disabled until the viewer's scope resolves, and
  // a disabled query reports isLoading:false (BUG-005831 — see useCampusLivingScope).
  if (isLoading || permsLoading) {
    return (
      <ContentLayout title="Occupancy Analytics">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title="Occupancy Analytics">
        <div className="p-6 text-sm text-destructive">
          Failed to load occupancy analytics: {(error as Error).message}
        </div>
      </ContentLayout>
    );
  }

  const totalCapacity = occupancy?.total_capacity ?? 0;
  const totalOccupancy = occupancy?.total_occupancy ?? 0;
  const available = occupancy?.available ?? 0;
  const occupancyPct = occupancy?.occupancy_percentage ?? 0;

  return (
    <ContentLayout title="Occupancy Analytics">
      <div className="space-y-6">
        <PreviewBanner
          feature="occupancy analytics"
          note="Occupancy rate, block and hostel-type breakdowns are now live. The period selector and time-series chart remain placeholders pending a daily-occupancy snapshot table."
        />
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
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Overall Rate</p><p className="text-2xl font-bold">{occupancyPct}%</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Total Beds</p><p className="text-2xl font-bold">{totalCapacity}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Occupied</p><p className="text-2xl font-bold text-green-600">{totalOccupancy}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Vacant</p><p className="text-2xl font-bold text-blue-600">{available}</p></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Occupancy Trend</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[300px] flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/50">
              <p className="text-muted-foreground text-sm">
                Time-series occupancy trend requires a daily-snapshot table (not yet built). Current view is point-in-time.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Block-wise Occupancy</CardTitle></CardHeader>
          <CardContent>
            {blockData.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active blocks found for this institution.</p>
            ) : (
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
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Occupancy by Hostel Type</CardTitle></CardHeader>
          <CardContent>
            {typeChartData.length === 0 ? (
              <div className="h-[250px] flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/50">
                <p className="text-muted-foreground">No hostel-type data available.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={typeChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="type" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      color: 'hsl(var(--popover-foreground))',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="Occupied" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Available" fill="hsl(var(--muted-foreground) / 0.3)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
