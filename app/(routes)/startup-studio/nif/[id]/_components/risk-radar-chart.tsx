'use client';

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from 'recharts';

interface RiskRadarChartProps {
  data: {
    magic: number;
    market: number;
    management: number;
    money: number;
  };
}

// Usage:
// <RiskRadarChart data={{ magic: 7, market: 5, management: 8, money: 4 }} />

export function RiskRadarChart({ data }: RiskRadarChartProps) {
  const chartData = [
    { dimension: 'Magic', value: data.magic, fullMark: 10 },
    { dimension: 'Market', value: data.market, fullMark: 10 },
    { dimension: 'Management', value: data.management, fullMark: 10 },
    { dimension: 'Money', value: data.money, fullMark: 10 },
  ];

  return (
    <ResponsiveContainer width="100%" height={280}>
      <RadarChart cx="50%" cy="50%" outerRadius="75%" data={chartData}>
        <PolarGrid />
        <PolarAngleAxis
          dataKey="dimension"
          tick={{ fontSize: 13, fontWeight: 500 }}
        />
        <PolarRadiusAxis
          angle={30}
          domain={[0, 10]}
          tick={{ fontSize: 11 }}
          tickCount={6}
        />
        <Radar
          name="Risk Score"
          dataKey="value"
          stroke="#6366f1"
          fill="#6366f1"
          fillOpacity={0.25}
          dot={{ r: 4, fill: '#6366f1', strokeWidth: 0 }}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
