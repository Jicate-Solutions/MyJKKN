'use client';

import {
  RadialBarChart,
  RadialBar,
  Legend,
  ResponsiveContainer,
  Tooltip
} from 'recharts';

interface RadialData {
  name: string;
  value: number;
  fill: string;
  fullMark?: number;
}

interface EngagementRadialChartProps {
  data: RadialData[];
  height?: number;
  title?: string;
  innerRadius?: number;
  outerRadius?: number;
}

export function EngagementRadialChart({
  data,
  height = 400,
  title,
  innerRadius = 30,
  outerRadius = 110
}: EngagementRadialChartProps) {
  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const percentage = data.fullMark
        ? ((data.value / data.fullMark) * 100).toFixed(1)
        : '100';

      return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
          <p className="text-sm font-medium text-gray-900 mb-1">{data.name}</p>
          <p className="text-sm text-gray-600">
            Students: <span className="font-semibold text-gray-900">{data.value}</span>
          </p>
          {data.fullMark && (
            <p className="text-xs text-gray-500 mt-1">
              {percentage}% of capacity
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  // Custom legend
  const renderLegend = (props: any) => {
    const { payload } = props;
    return (
      <div className="flex flex-wrap justify-center gap-3 mt-4">
        {payload.map((entry: any, index: number) => (
          <div key={`legend-${index}`} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-xs text-gray-700">
              {entry.value}: <span className="font-semibold">{data[index]?.value || 0}</span>
            </span>
          </div>
        ))}
      </div>
    );
  };

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <p className="text-gray-500 text-sm">No radial data available</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      {title && (
        <h3 className="text-lg font-semibold text-gray-900 mb-4 text-center">{title}</h3>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <RadialBarChart
          cx="50%"
          cy="50%"
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          data={data}
          startAngle={90}
          endAngle={-270}
        >
          <RadialBar
            minAngle={15}
            background
            clockWise
            dataKey="value"
            cornerRadius={10}
            label={{
              position: 'insideStart',
              fill: '#fff',
              fontSize: 12,
              fontWeight: 'bold'
            }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            iconSize={10}
            layout="horizontal"
            verticalAlign="bottom"
            content={renderLegend}
          />
        </RadialBarChart>
      </ResponsiveContainer>
    </div>
  );
}
