'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

interface TrendDataPoint {
  date: string;
  [key: string]: string | number; // Dynamic keys for different entities
}

interface EntityConfig {
  key: string;
  name: string;
  color: string;
  id: string;
}

interface MultiLevelTrendChartProps {
  data: TrendDataPoint[];
  entities: EntityConfig[]; // Departments, Programs, Sections, etc.
  height?: number;
  title?: string;
  yAxisLabel?: string;
  showLegend?: boolean;
}

const COLORS = [
  '#3B82F6', // blue
  '#10B981', // green
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#14B8A6', // teal
  '#F97316', // orange
  '#06B6D4', // cyan
  '#84CC16'  // lime
];

export function MultiLevelTrendChart({
  data,
  entities,
  height = 400,
  title,
  yAxisLabel = 'Value',
  showLegend = true
}: MultiLevelTrendChartProps) {
  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 max-w-xs">
          <p className="text-sm font-medium text-gray-900 mb-2">{formatDate(label)}</p>
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {payload
              .sort((a: any, b: any) => b.value - a.value)
              .map((entry: any, index: number) => (
                <div key={index} className="flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="text-gray-700 truncate max-w-[120px]" title={entry.name}>
                      {entry.name}:
                    </span>
                  </div>
                  <span className="font-medium text-gray-900">{entry.value}</span>
                </div>
              ))}
          </div>
        </div>
      );
    }
    return null;
  };

  if (!data || data.length === 0 || !entities || entities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ height }}>
        <p className="text-gray-500 text-sm">No trend data available</p>
        <p className="text-gray-400 text-xs mt-1">Select entities to compare</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      {title && (
        <h3 className="text-lg font-semibold text-gray-900 mb-4 px-4">{title}</h3>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={data}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            stroke="#6B7280"
            style={{ fontSize: '12px' }}
            tick={{ fill: '#6B7280' }}
          />
          <YAxis
            stroke="#6B7280"
            style={{ fontSize: '12px' }}
            tick={{ fill: '#6B7280' }}
            label={{
              value: yAxisLabel,
              angle: -90,
              position: 'insideLeft',
              style: { fontSize: '14px', fill: '#6B7280' }
            }}
          />
          <Tooltip content={<CustomTooltip />} />
          {showLegend && (
            <Legend
              wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }}
              iconType="line"
              formatter={(value) => {
                // Find entity name from key
                const entity = entities.find(e => e.key === value);
                return entity ? entity.name : value;
              }}
            />
          )}
          {entities.map((entity, idx) => (
            <Line
              key={entity.key}
              type="monotone"
              dataKey={entity.key}
              name={entity.key}
              stroke={entity.color || COLORS[idx % COLORS.length]}
              strokeWidth={2}
              dot={{ fill: entity.color || COLORS[idx % COLORS.length], r: 3 }}
              activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
