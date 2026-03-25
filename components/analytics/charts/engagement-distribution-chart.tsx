'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import type { EngagementLevel } from '@/types/analytics';
import { ENGAGEMENT_LEVEL_CONFIG } from '@/types/analytics';

interface EngagementDistributionData {
  level: EngagementLevel;
  count: number;
  percentage: number;
}

interface EngagementDistributionChartProps {
  data: EngagementDistributionData[];
  height?: number;
  showLegend?: boolean;
  innerRadius?: number; // Set to 0 for pie, >0 for donut
}

const COLORS: Record<EngagementLevel, string> = {
  high: '#10B981', // green
  medium: '#3B82F6', // blue
  low: '#F59E0B', // yellow
  at_risk: '#EF4444' // red
};

export function EngagementDistributionChart({
  data,
  height = 300,
  showLegend = true,
  innerRadius = 60 // Donut chart by default
}: EngagementDistributionChartProps) {
  // Custom label for pie slices
  const renderCustomLabel = ({
    cx,
    cy,
    midAngle,
    innerRadius,
    outerRadius,
    percentage
  }: any) => {
    if (percentage < 5) return null; // Don't show label for small slices

    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        className="text-sm font-semibold"
      >
        {`${percentage.toFixed(0)}%`}
      </text>
    );
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const config = ENGAGEMENT_LEVEL_CONFIG[data.level as EngagementLevel];
      return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
          <p className={`text-sm font-medium ${config.color} mb-1`}>{config.label}</p>
          <p className="text-sm text-gray-900">
            Count: <span className="font-semibold">{data.count}</span>
          </p>
          <p className="text-sm text-gray-900">
            Percentage: <span className="font-semibold">{data.percentage.toFixed(1)}%</span>
          </p>
        </div>
      );
    }
    return null;
  };

  // Custom legend
  const renderLegend = (props: any) => {
    const { payload } = props;
    return (
      <div className="flex flex-wrap justify-center gap-4 mt-4">
        {payload.map((entry: any, index: number) => {
          const config = ENGAGEMENT_LEVEL_CONFIG[entry.value as EngagementLevel];
          const dataPoint = data.find((d) => d.level === entry.value);
          return (
            <div key={`legend-${index}`} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-sm text-gray-700">
                {config.label}: <span className="font-semibold">{dataPoint?.count || 0}</span>
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <p className="text-gray-500 text-sm">No distribution data available</p>
      </div>
    );
  }

  const totalCount = data.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={renderCustomLabel}
            outerRadius={80}
            innerRadius={innerRadius}
            fill="#8884d8"
            dataKey="count"
            nameKey="level"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[entry.level]} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          {showLegend && <Legend content={renderLegend} />}
        </PieChart>
      </ResponsiveContainer>

      {/* Center label for donut chart */}
      {innerRadius > 0 && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
          <p className="text-3xl font-bold text-gray-900">{totalCount}</p>
          <p className="text-sm text-gray-600">Students</p>
        </div>
      )}
    </div>
  );
}
