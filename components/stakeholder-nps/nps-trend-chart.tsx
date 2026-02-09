'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { NPSTrendData, StakeholderType } from '@/types/stakeholder-nps';

interface NPSTrendChartProps {
  data: NPSTrendData[];
  height?: number;
  showLegend?: boolean;
  title?: string;
  description?: string;
  stakeholderFilter?: StakeholderType;
}

// Format month string (YYYY-MM) for display
function formatMonth(monthStr: string): string {
  const date = new Date(monthStr + '-01');
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

// Get NPS score color based on value
function getNPSColor(score: number): string {
  if (score >= 50) return '#22c55e'; // green-500
  if (score >= 0) return '#eab308'; // yellow-500
  return '#ef4444'; // red-500
}

// Custom tooltip component
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
      <p className="text-sm font-medium text-gray-900 mb-2">{formatMonth(label)}</p>
      {payload.map((entry: any, index: number) => (
        <div key={index} className="flex items-center gap-2 text-sm">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-gray-600">{entry.name}:</span>
          <span className="font-medium text-gray-900">
            {entry.name === 'NPS Score' ? (
              <>
                {entry.value > 0 ? '+' : ''}
                {entry.value}
              </>
            ) : (
              entry.value
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

export function NPSTrendChart({
  data,
  height = 350,
  showLegend = true,
  title = 'NPS Trend Over Time',
  description,
  stakeholderFilter
}: NPSTrendChartProps) {
  // Filter data by stakeholder type if provided
  const filteredData = stakeholderFilter
    ? data.filter((d) => d.stakeholder_type === stakeholderFilter)
    : data;

  // Aggregate data by month (sum across stakeholder types if no filter)
  const aggregatedData = filteredData.reduce((acc, curr) => {
    const existingMonth = acc.find((d) => d.month === curr.month);
    if (existingMonth) {
      existingMonth.response_count += curr.response_count;
      existingMonth.promoters += curr.promoters;
      existingMonth.passives += curr.passives;
      existingMonth.detractors += curr.detractors;
      // Recalculate NPS
      const total =
        existingMonth.promoters + existingMonth.passives + existingMonth.detractors;
      if (total > 0) {
        existingMonth.nps_score = Math.round(
          ((existingMonth.promoters - existingMonth.detractors) / total) * 100
        );
      }
    } else {
      acc.push({ ...curr });
    }
    return acc;
  }, [] as NPSTrendData[]);

  // Sort by month
  const sortedData = aggregatedData.sort((a, b) => a.month.localeCompare(b.month));

  // Calculate min/max for Y axis
  const scores = sortedData.map((d) => d.nps_score);
  const minScore = Math.min(...scores, -100);
  const maxScore = Math.max(...scores, 100);
  const yMin = Math.floor(minScore / 20) * 20;
  const yMax = Math.ceil(maxScore / 20) * 20;

  if (!sortedData || sortedData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>
          <div
            className="flex items-center justify-center"
            style={{ height: height - 80 }}
          >
            <p className="text-muted-foreground text-sm">
              No trend data available. Collect more responses to see trends.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height - 80}>
          <LineChart
            data={sortedData}
            margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis
              dataKey="month"
              tickFormatter={formatMonth}
              stroke="#6B7280"
              style={{ fontSize: '12px' }}
              tick={{ fill: '#6B7280' }}
            />
            <YAxis
              yAxisId={0}
              domain={[yMin, yMax]}
              stroke="#6B7280"
              style={{ fontSize: '12px' }}
              tick={{ fill: '#6B7280' }}
              tickFormatter={(value) => (value > 0 ? `+${value}` : value)}
            />
            <YAxis
              yAxisId={1}
              orientation="right"
              stroke="#9CA3AF"
              style={{ fontSize: '12px' }}
              tick={{ fill: '#9CA3AF' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="#9CA3AF" strokeDasharray="3 3" />
            <ReferenceLine
              y={50}
              stroke="#22c55e"
              strokeDasharray="5 5"
              label={{
                value: 'Great',
                position: 'right',
                fill: '#22c55e',
                fontSize: 10
              }}
            />
            {showLegend && (
              <Legend
                wrapperStyle={{ fontSize: '14px', paddingTop: '20px' }}
                iconType="circle"
              />
            )}
            <Line
              type="monotone"
              dataKey="nps_score"
              name="NPS Score"
              stroke="#3B82F6"
              strokeWidth={3}
              dot={(props: any) => {
                const { cx, cy, payload } = props;
                return (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={6}
                    fill={getNPSColor(payload.nps_score)}
                    stroke="white"
                    strokeWidth={2}
                  />
                );
              }}
              activeDot={{ r: 8, strokeWidth: 2 }}
              yAxisId={0}
            />
            <Line
              type="monotone"
              dataKey="response_count"
              name="Responses"
              stroke="#9CA3AF"
              strokeWidth={1}
              strokeDasharray="5 5"
              dot={false}
              yAxisId={1}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

interface NPSSegmentTrendChartProps {
  data: NPSTrendData[];
  height?: number;
  showLegend?: boolean;
  title?: string;
  description?: string;
  stakeholderFilter?: StakeholderType;
}

export function NPSSegmentTrendChart({
  data,
  height = 350,
  showLegend = true,
  title = 'Segment Distribution Over Time',
  description,
  stakeholderFilter
}: NPSSegmentTrendChartProps) {
  // Filter and aggregate data
  const filteredData = stakeholderFilter
    ? data.filter((d) => d.stakeholder_type === stakeholderFilter)
    : data;

  const aggregatedData = filteredData.reduce((acc, curr) => {
    const existingMonth = acc.find((d) => d.month === curr.month);
    if (existingMonth) {
      existingMonth.promoters += curr.promoters;
      existingMonth.passives += curr.passives;
      existingMonth.detractors += curr.detractors;
    } else {
      acc.push({
        month: curr.month,
        promoters: curr.promoters,
        passives: curr.passives,
        detractors: curr.detractors
      });
    }
    return acc;
  }, [] as { month: string; promoters: number; passives: number; detractors: number }[]);

  // Sort and calculate percentages
  const chartData = aggregatedData
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((d) => {
      const total = d.promoters + d.passives + d.detractors;
      return {
        month: d.month,
        promoters: total > 0 ? Math.round((d.promoters / total) * 100) : 0,
        passives: total > 0 ? Math.round((d.passives / total) * 100) : 0,
        detractors: total > 0 ? Math.round((d.detractors / total) * 100) : 0
      };
    });

  if (!chartData || chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>
          <div
            className="flex items-center justify-center"
            style={{ height: height - 80 }}
          >
            <p className="text-muted-foreground text-sm">
              No trend data available.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height - 80}>
          <LineChart
            data={chartData}
            margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis
              dataKey="month"
              tickFormatter={formatMonth}
              stroke="#6B7280"
              style={{ fontSize: '12px' }}
              tick={{ fill: '#6B7280' }}
            />
            <YAxis
              domain={[0, 100]}
              stroke="#6B7280"
              style={{ fontSize: '12px' }}
              tick={{ fill: '#6B7280' }}
              tickFormatter={(value) => `${value}%`}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload || !payload.length) return null;
                return (
                  <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
                    <p className="text-sm font-medium text-gray-900 mb-2">
                      {formatMonth(label)}
                    </p>
                    {payload.map((entry: any, index: number) => (
                      <div key={index} className="flex items-center gap-2 text-sm">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: entry.color }}
                        />
                        <span className="text-gray-600">{entry.name}:</span>
                        <span className="font-medium text-gray-900">
                          {entry.value}%
                        </span>
                      </div>
                    ))}
                  </div>
                );
              }}
            />
            {showLegend && (
              <Legend
                wrapperStyle={{ fontSize: '14px', paddingTop: '20px' }}
                iconType="circle"
              />
            )}
            <Line
              type="monotone"
              dataKey="promoters"
              name="Promoters"
              stroke="#22c55e"
              strokeWidth={2}
              dot={{ fill: '#22c55e', r: 4 }}
              activeDot={{ r: 6 }}
            />
            <Line
              type="monotone"
              dataKey="passives"
              name="Passives"
              stroke="#eab308"
              strokeWidth={2}
              dot={{ fill: '#eab308', r: 4 }}
              activeDot={{ r: 6 }}
            />
            <Line
              type="monotone"
              dataKey="detractors"
              name="Detractors"
              stroke="#ef4444"
              strokeWidth={2}
              dot={{ fill: '#ef4444', r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
