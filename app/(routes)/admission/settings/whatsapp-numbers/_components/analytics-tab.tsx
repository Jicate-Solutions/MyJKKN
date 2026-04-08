'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, RefreshCw, Send, CheckCheck, Eye, AlertTriangle } from 'lucide-react';

// =============================================================================
// Types
// =============================================================================

interface AnalyticsData {
  summary: {
    total_sent: number;
    total_delivered: number;
    total_read: number;
    total_failed: number;
  };
  daily_stats: Array<{
    date: string;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
  }>;
  template_performance: Array<{
    template_name: string;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
  }>;
}

// =============================================================================
// API function
// =============================================================================

async function fetchAnalytics(
  institutionId: string,
  days: number
): Promise<AnalyticsData> {
  const res = await fetch(
    `/api/admission/settings/whatsapp-analytics?institution_id=${institutionId}&days=${days}`
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch analytics');
  }
  const json = await res.json();
  return json.data || { summary: { total_sent: 0, total_delivered: 0, total_read: 0, total_failed: 0 }, daily_stats: [], template_performance: [] };
}

// =============================================================================
// Stat Card
// =============================================================================

function StatCard({
  title,
  value,
  total,
  icon: Icon,
  color,
}: {
  title: string;
  value: number;
  total: number;
  icon: typeof Send;
  color: string;
}) {
  const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold mt-1">{value.toLocaleString()}</p>
            {total > 0 && title !== 'Total Sent' && (
              <p className="text-xs text-muted-foreground mt-1">
                {percentage}% of sent
              </p>
            )}
          </div>
          <div className={`h-12 w-12 rounded-full flex items-center justify-center ${color}`}>
            <Icon className="h-6 w-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Analytics Tab
// =============================================================================

export function AnalyticsTab({ institutionId }: { institutionId: string }) {
  const [days, setDays] = useState('30');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['wa-analytics', institutionId, days],
    queryFn: () => fetchAnalytics(institutionId, parseInt(days)),
    enabled: !!institutionId,
  });

  const summary = data?.summary || {
    total_sent: 0,
    total_delivered: 0,
    total_read: 0,
    total_failed: 0,
  };

  const dailyStats = data?.daily_stats || [];
  const templatePerf = data?.template_performance || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">WhatsApp Analytics</h2>
          <p className="text-muted-foreground mt-1">
            Message delivery metrics and template performance
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Total Sent"
              value={summary.total_sent}
              total={summary.total_sent}
              icon={Send}
              color="bg-blue-100 text-blue-600"
            />
            <StatCard
              title="Delivered"
              value={summary.total_delivered}
              total={summary.total_sent}
              icon={CheckCheck}
              color="bg-green-100 text-green-600"
            />
            <StatCard
              title="Read"
              value={summary.total_read}
              total={summary.total_sent}
              icon={Eye}
              color="bg-purple-100 text-purple-600"
            />
            <StatCard
              title="Failed"
              value={summary.total_failed}
              total={summary.total_sent}
              icon={AlertTriangle}
              color="bg-red-100 text-red-600"
            />
          </div>

          {/* Daily Stats Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Daily Breakdown (Last 7 Days)</CardTitle>
            </CardHeader>
            <CardContent>
              {dailyStats.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No messaging data for this period
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Sent</TableHead>
                      <TableHead className="text-right">Delivered</TableHead>
                      <TableHead className="text-right">Read</TableHead>
                      <TableHead className="text-right">Failed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dailyStats.slice(0, 7).map((day) => (
                      <TableRow key={day.date}>
                        <TableCell className="font-medium">
                          {new Date(day.date).toLocaleDateString('en-IN', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </TableCell>
                        <TableCell className="text-right">{day.sent}</TableCell>
                        <TableCell className="text-right">{day.delivered}</TableCell>
                        <TableCell className="text-right">{day.read}</TableCell>
                        <TableCell className="text-right">
                          {day.failed > 0 ? (
                            <span className="text-red-600 font-medium">{day.failed}</span>
                          ) : (
                            day.failed
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Template Performance */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Template Performance</CardTitle>
            </CardHeader>
            <CardContent>
              {templatePerf.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No template data available
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Template</TableHead>
                      <TableHead className="text-right">Sent</TableHead>
                      <TableHead className="text-right">Delivery Rate</TableHead>
                      <TableHead className="text-right">Read Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {templatePerf.map((t) => {
                      const deliveryRate =
                        t.sent > 0 ? ((t.delivered / t.sent) * 100).toFixed(1) : '0.0';
                      const readRate =
                        t.sent > 0 ? ((t.read / t.sent) * 100).toFixed(1) : '0.0';
                      return (
                        <TableRow key={t.template_name}>
                          <TableCell className="font-medium">{t.template_name}</TableCell>
                          <TableCell className="text-right">{t.sent}</TableCell>
                          <TableCell className="text-right">
                            <Badge
                              variant="outline"
                              className={
                                parseFloat(deliveryRate) >= 95
                                  ? 'bg-green-50 text-green-700 border-green-200'
                                  : parseFloat(deliveryRate) >= 80
                                    ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                                    : 'bg-red-50 text-red-700 border-red-200'
                              }
                            >
                              {deliveryRate}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="outline" className="text-xs">
                              {readRate}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
