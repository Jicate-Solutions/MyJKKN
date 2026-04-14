'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface SourceStat {
  source: string;
  total: number;
  won: number;
  lost: number;
  winRate: number;
  avgDealSize: number;
  avgSolutionsPerClient: number;
  avgReferrals: number;
}

interface SourceSuccessChartProps {
  data: SourceStat[];
  isLoading?: boolean;
}

const SOURCE_COLORS: Record<string, string> = {
  Placement: '#3b82f6',
  Alumni: '#10b981',
  Clinical: '#8b5cf6',
  Referral: '#f59e0b',
  Direct: '#6b7280',
  Yi: '#ec4899',
  Intent: '#06b6d4',
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);

export function SourceSuccessChart({ data, isLoading }: SourceSuccessChartProps) {
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-96 mt-1" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <Skeleton className="h-5 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-48 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="h-64 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">No source data available yet</p>
        </CardContent>
      </Card>
    );
  }

  // Sort by win rate descending
  const sortedData = [...data].sort((a, b) => b.winRate - a.winRate);

  return (
    <div className="space-y-6">
      {/* Win Rate Chart */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4" />
            Source-to-Success: Win Rate by Source
          </CardTitle>
          <CardDescription>
            Which lead sources produce the highest conversion rates?
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={sortedData}
              layout="vertical"
              margin={{ left: 20, right: 30, top: 5, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-muted" />
              <XAxis
                type="number"
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                dataKey="source"
                type="category"
                width={80}
                tick={{ fontSize: 12 }}
              />
              <RechartsTooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: '1px solid hsl(var(--border))',
                  background: 'hsl(var(--card))',
                  color: 'hsl(var(--card-foreground))',
                }}
                formatter={(value: number) => [`${value}%`, 'Win Rate']}
                labelFormatter={(label: string) => `Source: ${label}`}
              />
              <Bar dataKey="winRate" radius={[0, 4, 4, 0]} maxBarSize={30}>
                {sortedData.map((entry) => (
                  <Cell
                    key={entry.source}
                    fill={SOURCE_COLORS[entry.source] || '#6b7280'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Detailed Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Source Performance Details</CardTitle>
          <CardDescription>
            Complete breakdown of each lead source&apos;s performance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 font-medium">Source</th>
                  <th className="text-right py-2 px-3 font-medium">Total</th>
                  <th className="text-right py-2 px-3 font-medium">Won</th>
                  <th className="text-right py-2 px-3 font-medium">Win Rate</th>
                  <th className="text-right py-2 px-3 font-medium">Avg Deal</th>
                  <th className="text-right py-2 px-3 font-medium">Avg Solutions</th>
                  <th className="text-right py-2 px-3 font-medium">Avg Referrals</th>
                </tr>
              </thead>
              <tbody>
                {sortedData.map((row) => (
                  <tr key={row.source} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: SOURCE_COLORS[row.source] || '#6b7280' }}
                        />
                        {row.source}
                      </div>
                    </td>
                    <td className="text-right py-2 px-3">{row.total}</td>
                    <td className="text-right py-2 px-3">{row.won}</td>
                    <td className="text-right py-2 px-3">
                      <Badge
                        variant={
                          row.winRate >= 50
                            ? 'default'
                            : row.winRate >= 25
                              ? 'secondary'
                              : 'outline'
                        }
                      >
                        {row.winRate}%
                      </Badge>
                    </td>
                    <td className="text-right py-2 px-3">
                      {row.avgDealSize > 0 ? formatCurrency(row.avgDealSize) : '\u2014'}
                    </td>
                    <td className="text-right py-2 px-3">
                      {row.avgSolutionsPerClient > 0 ? row.avgSolutionsPerClient : '\u2014'}
                    </td>
                    <td className="text-right py-2 px-3">
                      {row.avgReferrals > 0 ? row.avgReferrals : '\u2014'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
