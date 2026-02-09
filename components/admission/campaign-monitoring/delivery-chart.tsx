'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Send, CheckCircle, Eye, AlertCircle, Clock } from 'lucide-react';
import type { DeliveryMetrics } from '@/lib/services/admission/campaign-monitoring-service';

interface DeliveryChartProps {
  metrics: DeliveryMetrics | null;
  isLoading: boolean;
}

interface MetricItemProps {
  label: string;
  value: number;
  total: number;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}

function MetricItem({ label, value, total, icon: Icon, color, bgColor }: MetricItemProps) {
  const percentage = total > 0 ? (value / total) * 100 : 0;

  return (
    <div className="flex items-center gap-3">
      <div className={`p-2 rounded-lg ${bgColor}`}>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium">{label}</span>
          <span className="text-sm text-muted-foreground">{value.toLocaleString()}</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full ${color.replace('text-', 'bg-')} transition-all duration-500`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function DonutChart({ metrics }: { metrics: DeliveryMetrics }) {
  const total = metrics.sent || 1;
  const delivered = metrics.delivered;
  const read = metrics.read;
  const failed = metrics.failed;
  const pending = metrics.pending;

  // Calculate percentages for the donut
  const deliveredPct = total > 0 ? (delivered / total) * 100 : 0;
  const readPct = total > 0 ? (read / total) * 100 : 0;
  const failedPct = total > 0 ? (failed / total) * 100 : 0;
  const pendingPct = total > 0 ? (pending / total) * 100 : 0;

  // SVG donut chart
  const radius = 45;
  const circumference = 2 * Math.PI * radius;

  // Calculate stroke dash arrays for each segment
  const segments = [
    { pct: readPct, color: '#22c55e' }, // green for read
    { pct: deliveredPct - readPct, color: '#3b82f6' }, // blue for delivered but not read
    { pct: pendingPct, color: '#f59e0b' }, // amber for pending
    { pct: failedPct, color: '#ef4444' }, // red for failed
  ].filter((s) => s.pct > 0);

  let currentOffset = 0;

  return (
    <div className="relative flex items-center justify-center">
      <svg className="w-40 h-40 transform -rotate-90" viewBox="0 0 100 100">
        {/* Background circle */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="10"
          className="text-muted"
        />
        {/* Segments */}
        {segments.map((segment, index) => {
          const dashArray = (segment.pct / 100) * circumference;
          const dashOffset = currentOffset;
          currentOffset -= dashArray;

          return (
            <circle
              key={index}
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth="10"
              strokeDasharray={`${dashArray} ${circumference - dashArray}`}
              strokeDashoffset={-dashOffset}
              strokeLinecap="round"
              className="transition-all duration-500"
            />
          );
        })}
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold">{metrics.deliveryRate.toFixed(0)}%</span>
        <span className="text-xs text-muted-foreground">Delivery Rate</span>
      </div>
    </div>
  );
}

export function DeliveryChart({ metrics, isLoading }: DeliveryChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center">
            <Skeleton className="h-40 w-40 rounded-full" />
          </div>
          <div className="space-y-4 mt-6">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const defaultMetrics: DeliveryMetrics = {
    sent: 0,
    delivered: 0,
    read: 0,
    failed: 0,
    pending: 0,
    deliveryRate: 0,
    readRate: 0,
  };

  const data = metrics || defaultMetrics;
  const total = data.sent || 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Message Delivery</CardTitle>
        <CardDescription>Campaign message delivery breakdown</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Donut Chart */}
        <div className="flex justify-center mb-6">
          <DonutChart metrics={data} />
        </div>

        {/* Metrics Breakdown */}
        <div className="space-y-4">
          <MetricItem
            label="Sent"
            value={data.sent}
            total={total}
            icon={Send}
            color="text-blue-600"
            bgColor="bg-blue-100"
          />
          <MetricItem
            label="Delivered"
            value={data.delivered}
            total={total}
            icon={CheckCircle}
            color="text-green-600"
            bgColor="bg-green-100"
          />
          <MetricItem
            label="Read"
            value={data.read}
            total={total}
            icon={Eye}
            color="text-emerald-600"
            bgColor="bg-emerald-100"
          />
          <MetricItem
            label="Failed"
            value={data.failed}
            total={total}
            icon={AlertCircle}
            color="text-red-600"
            bgColor="bg-red-100"
          />
          <MetricItem
            label="Pending"
            value={data.pending}
            total={total}
            icon={Clock}
            color="text-amber-600"
            bgColor="bg-amber-100"
          />
        </div>

        {/* Rate Summary */}
        <div className="mt-6 pt-4 border-t grid grid-cols-2 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">{data.deliveryRate.toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground">Delivery Rate</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-emerald-600">{data.readRate.toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground">Read Rate</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
