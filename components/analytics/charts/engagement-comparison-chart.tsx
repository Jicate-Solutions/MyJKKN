'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell
} from 'recharts';

interface ComparisonData {
  name: string;
  id: string;
  active_percentage: number;
  at_risk_percentage: number;
  avg_logins_7d: number;
  avg_session_duration: number;
  engagement_score?: number;
}

interface EngagementComparisonChartProps {
  data: ComparisonData[];
  metric: 'active_percentage' | 'at_risk_percentage' | 'avg_logins_7d' | 'avg_session_duration' | 'engagement_score';
  height?: number;
  title?: string;
  onBarClick?: (data: ComparisonData) => void;
}

const METRIC_CONFIG = {
  active_percentage: {
    label: 'Active Students (%)',
    color: '#10B981',
    format: (val: number) => `${val.toFixed(1)}%`
  },
  at_risk_percentage: {
    label: 'At-Risk Students (%)',
    color: '#EF4444',
    format: (val: number) => `${val.toFixed(1)}%`
  },
  avg_logins_7d: {
    label: 'Avg Logins (7 days)',
    color: '#3B82F6',
    format: (val: number) => val.toFixed(1)
  },
  avg_session_duration: {
    label: 'Avg Session (minutes)',
    color: '#8B5CF6',
    format: (val: number) => val.toFixed(0)
  },
  engagement_score: {
    label: 'Engagement Score',
    color: '#F59E0B',
    format: (val: number) => val.toFixed(1)
  }
};

export function EngagementComparisonChart({
  data,
  metric,
  height = 400,
  title,
  onBarClick
}: EngagementComparisonChartProps) {
  const config = METRIC_CONFIG[metric];

  // Get color based on value (for active_percentage - higher is better, for at_risk - lower is better)
  const getBarColor = (value: number, index: number) => {
    if (metric === 'at_risk_percentage') {
      // Red gradient: higher at-risk is worse
      if (value > 30) return '#DC2626'; // dark red
      if (value > 20) return '#EF4444'; // red
      if (value > 10) return '#F87171'; // light red
      return '#FCA5A5'; // very light red
    } else if (metric === 'active_percentage') {
      // Green gradient: higher active is better
      if (value > 80) return '#059669'; // dark green
      if (value > 60) return '#10B981'; // green
      if (value > 40) return '#34D399'; // light green
      return '#6EE7B7'; // very light green
    } else if (metric === 'avg_logins_7d') {
      // Blue gradient: higher logins is better
      if (value > 15) return '#1D4ED8'; // dark blue
      if (value > 10) return '#3B82F6'; // blue
      if (value > 5) return '#60A5FA'; // light blue
      return '#93C5FD'; // very light blue
    }

    return config.color;
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;

      return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
          <p className="text-sm font-medium text-gray-900 mb-2">{data.name}</p>
          <div className="space-y-1">
            <div className="flex justify-between gap-4 text-xs">
              <span className="text-gray-600">Active %:</span>
              <span className="font-medium text-gray-900">
                {data.active_percentage.toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between gap-4 text-xs">
              <span className="text-gray-600">At-Risk %:</span>
              <span className="font-medium text-gray-900">
                {data.at_risk_percentage.toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between gap-4 text-xs">
              <span className="text-gray-600">Avg Logins:</span>
              <span className="font-medium text-gray-900">
                {data.avg_logins_7d.toFixed(1)}
              </span>
            </div>
            <div className="flex justify-between gap-4 text-xs">
              <span className="text-gray-600">Avg Session:</span>
              <span className="font-medium text-gray-900">
                {data.avg_session_duration.toFixed(0)}m
              </span>
            </div>
            {data.engagement_score !== undefined && (
              <div className="flex justify-between gap-4 text-xs pt-1 border-t border-gray-200">
                <span className="text-gray-600">Score:</span>
                <span className="font-semibold text-gray-900">
                  {data.engagement_score.toFixed(1)}
                </span>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  // Handle bar click
  const handleBarClick = (data: any, index: number) => {
    if (onBarClick) {
      onBarClick(data);
    }
  };

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <p className="text-gray-500 text-sm">No comparison data available</p>
      </div>
    );
  }

  // Sort by metric value (descending)
  const sortedData = [...data].sort((a, b) => b[metric] - a[metric]);

  return (
    <div className="w-full">
      {title && (
        <h3 className="text-lg font-semibold text-gray-900 mb-4 px-4">{title}</h3>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={sortedData}
          margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
          onClick={handleBarClick}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
          <XAxis
            dataKey="name"
            stroke="#6B7280"
            style={{ fontSize: '12px' }}
            angle={-45}
            textAnchor="end"
            height={100}
            tick={{ fill: '#6B7280' }}
          />
          <YAxis
            stroke="#6B7280"
            style={{ fontSize: '12px' }}
            tick={{ fill: '#6B7280' }}
            label={{
              value: config.label,
              angle: -90,
              position: 'insideLeft',
              style: { fontSize: '14px', fill: '#6B7280' }
            }}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0, 0, 0, 0.05)' }} />
          <Bar
            dataKey={metric}
            radius={[8, 8, 0, 0]}
            cursor={onBarClick ? 'pointer' : 'default'}
            label={{
              position: 'top',
              formatter: config.format,
              style: { fontSize: '11px', fill: '#6B7280' }
            }}
          >
            {sortedData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getBarColor(entry[metric], index)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
