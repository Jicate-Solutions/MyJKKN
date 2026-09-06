'use client';

import { useMemo, useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UtensilsCrossed, Trash2, Star, IndianRupee, Loader2 } from 'lucide-react';
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
import { useMessAnalytics } from '@/hooks/campus-living/use-campus-living-analytics';
import { PreviewBanner } from '../../_components/preview-banner';

function periodToDateRange(period: string): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  if (period === '7d') from.setDate(to.getDate() - 7);
  else if (period === '90d') from.setDate(to.getDate() - 90);
  else from.setDate(to.getDate() - 30);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

const formatINR = (amount: number) =>
  amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

export default function MessAnalyticsPage() {
  const [period, setPeriod] = useState('30d');
  const { profile } = useAuth();
  const { isLoading: permsLoading } = usePermissions();
  const institutionId = profile?.institution_id ?? '';

  const { from, to } = useMemo(() => periodToDateRange(period), [period]);
  const { data: mess, isLoading, error } = useMessAnalytics(institutionId, from, to);

  const mealTypeData = useMemo(() => {
    if (!mess?.by_meal_type) return [];
    return Object.entries(mess.by_meal_type).map(([name, count]) => ({
      name,
      Meals: count as number,
    }));
  }, [mess]);

  // Days in the selected period for daily-avg display
  const periodDays = useMemo(() => {
    const start = new Date(from).getTime();
    const end = new Date(to).getTime();
    return Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)));
  }, [from, to]);

  // permsLoading: the query stays disabled until the viewer's scope resolves, and
  // a disabled query reports isLoading:false (BUG-005831 — see useCampusLivingScope).
  if (isLoading || permsLoading) {
    return (
      <ContentLayout title="Mess Analytics">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title="Mess Analytics">
        <div className="p-6 text-sm text-destructive">
          Failed to load mess analytics: {(error as Error).message}
        </div>
      </ContentLayout>
    );
  }

  const totalMeals = mess?.total_meals_served ?? 0;
  const mealsPerDay = Math.round(totalMeals / periodDays);
  const totalWasteKg = mess?.waste.total_kg ?? 0;
  const wastePerDay = Math.round((totalWasteKg / periodDays) * 10) / 10;
  const avgRating = mess?.feedback.average_rating ?? 0;
  const complaints = mess?.feedback.complaints ?? 0;
  const wasteCost = mess?.waste.total_cost ?? 0;

  return (
    <ContentLayout title="Mess Analytics">
      <div className="space-y-6">
        <PreviewBanner
          feature="mess analytics"
          note="Meals served, waste, feedback ratings and complaints are now live. Per-meal cost breakdown (raw materials, labor, overhead) stays a placeholder pending a cost-accounting table."
        />
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Mess & Cafeteria Analytics</h1>
            <p className="text-muted-foreground">Waste trends, feedback patterns, and meal consumption</p>
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
            <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Meals/Day Avg</CardTitle><UtensilsCrossed className="h-4 w-4 text-muted-foreground" /></CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{mealsPerDay.toLocaleString('en-IN')}</div>
              <p className="text-xs text-muted-foreground">{totalMeals.toLocaleString('en-IN')} in period</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Waste/Day Avg</CardTitle><Trash2 className="h-4 w-4 text-muted-foreground" /></CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{wastePerDay} kg</div>
              <p className="text-xs text-muted-foreground">{totalWasteKg} kg total</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Avg Rating</CardTitle><Star className="h-4 w-4 text-muted-foreground" /></CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${avgRating >= 4 ? 'text-green-600' : avgRating >= 3 ? 'text-amber-600' : 'text-red-600'}`}>
                {avgRating || '—'}
              </div>
              <p className="text-xs text-muted-foreground">{complaints} complaints</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Waste Cost</CardTitle><IndianRupee className="h-4 w-4 text-muted-foreground" /></CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatINR(wasteCost)}</div>
              <p className="text-xs text-muted-foreground">cost of wasted food</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Meals Served by Type</CardTitle></CardHeader>
          <CardContent>
            {mealTypeData.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/50">
                <p className="text-muted-foreground">No meal records in this period.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={mealTypeData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" className="text-xs" />
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
                  <Bar dataKey="Meals" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Feedback Summary</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total Feedback</span>
                  <span className="font-medium">{mess?.feedback.total ?? 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Average Rating</span>
                  <span className="font-medium">{avgRating || '—'} / 5</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Complaints</span>
                  <span className={`font-medium ${complaints > 0 ? 'text-red-600' : 'text-green-600'}`}>{complaints}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Guest Meals</span>
                  <span className="font-medium">{(mess?.guest_meals ?? 0).toLocaleString('en-IN')}</span>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Waste Summary</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total Waste (kg)</span>
                  <span className="font-medium">{totalWasteKg}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Daily Average (kg)</span>
                  <span className="font-medium">{wastePerDay}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Cost of Waste</span>
                  <span className="font-medium">{formatINR(wasteCost)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Records Logged</span>
                  <span className="font-medium">{mess?.waste.records ?? 0}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Cost Analysis</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[200px] flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/50">
              <p className="text-muted-foreground text-sm">
                Full cost breakdown (raw materials, labor, overhead) requires a separate cost-accounting workstream.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
