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
import { ENGAGEMENT_LEVEL_CONFIG } from '@/types/analytics';

interface HierarchicalBreakdownData {
  name: string; // Institution, Department, Program, etc name
  id: string;
  total_students: number;
  high_engagement: number;
  medium_engagement: number;
  low_engagement: number;
  at_risk: number;
  active_percentage: number;
}

interface HierarchicalBreakdownChartProps {
  data: HierarchicalBreakdownData[];
  height?: number;
  title?: string;
  level: 'institution' | 'department' | 'program' | 'semester' | 'section';
  onBarClick?: (data: HierarchicalBreakdownData) => void;
}

const ENGAGEMENT_COLORS = {
  high_engagement: '#10B981', // green
  medium_engagement: '#3B82F6', // blue
  low_engagement: '#F59E0B', // amber
  at_risk: '#EF4444' // red
};

export function HierarchicalBreakdownChart({
  data,
  height = 400,
  title,
  level,
  onBarClick
}: HierarchicalBreakdownChartProps) {
  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const total = payload.reduce((sum: number, entry: any) => sum + entry.value, 0);

      return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-4 max-w-xs">
          <p className="font-semibold text-gray-900 mb-2">{label}</p>
          <div className="space-y-1">
            {payload.map((entry: any, index: number) => {
              const percentage = ((entry.value / total) * 100).toFixed(1);
              return (
                <div key={index} className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-sm"
                      style={{ backgroundColor: entry.fill }}
                    />
                    <span className="text-gray-700">{entry.name}:</span>
                  </div>
                  <span className="font-medium text-gray-900">
                    {entry.value} ({percentage}%)
                  </span>
                </div>
              );
            })}
            <div className="pt-2 mt-2 border-t border-gray-200">
              <div className="flex justify-between text-sm font-semibold">
                <span className="text-gray-700">Total:</span>
                <span className="text-gray-900">{total}</span>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // Handle bar click for drill-down
  const handleBarClick = (data: any, index: number) => {
    if (onBarClick && index !== undefined) {
      onBarClick(data[index]);
    }
  };

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ height }}>
        <p className="text-gray-500 text-sm">No data available for {level}</p>
        <p className="text-gray-400 text-xs mt-1">Select a different filter to view data</p>
      </div>
    );
  }

  // Sort by total students (descending)
  const sortedData = [...data].sort((a, b) => b.total_students - a.total_students);

  return (
    <div className="w-full">
      {title && (
        <h3 className="text-lg font-semibold text-gray-900 mb-4 px-4">{title}</h3>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={sortedData}
          margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
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
              value: 'Number of Students',
              angle: -90,
              position: 'insideLeft',
              style: { fontSize: '14px', fill: '#6B7280' }
            }}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0, 0, 0, 0.05)' }} />
          <Legend
            wrapperStyle={{ paddingTop: '20px', fontSize: '14px' }}
            iconType="square"
            formatter={(value) => {
              const labels: Record<string, string> = {
                high_engagement: 'High Engagement',
                medium_engagement: 'Medium Engagement',
                low_engagement: 'Low Engagement',
                at_risk: 'At Risk'
              };
              return labels[value] || value;
            }}
          />
          <Bar
            dataKey="high_engagement"
            stackId="a"
            fill={ENGAGEMENT_COLORS.high_engagement}
            onClick={handleBarClick}
            cursor={onBarClick ? 'pointer' : 'default'}
            name="high_engagement"
          />
          <Bar
            dataKey="medium_engagement"
            stackId="a"
            fill={ENGAGEMENT_COLORS.medium_engagement}
            onClick={handleBarClick}
            cursor={onBarClick ? 'pointer' : 'default'}
            name="medium_engagement"
          />
          <Bar
            dataKey="low_engagement"
            stackId="a"
            fill={ENGAGEMENT_COLORS.low_engagement}
            onClick={handleBarClick}
            cursor={onBarClick ? 'pointer' : 'default'}
            name="low_engagement"
          />
          <Bar
            dataKey="at_risk"
            stackId="a"
            fill={ENGAGEMENT_COLORS.at_risk}
            onClick={handleBarClick}
            cursor={onBarClick ? 'pointer' : 'default'}
            name="at_risk"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
