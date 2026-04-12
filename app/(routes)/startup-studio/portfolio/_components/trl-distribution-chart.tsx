'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface TrlDataPoint {
  trl_level: number;
  count: number;
}

interface TrlDistributionChartProps {
  data: TrlDataPoint[];
}

// Group raw TRL data into 3 bands
function buildChartData(raw: TrlDataPoint[]) {
  const countByLevel: Record<number, number> = {};
  for (const d of raw) {
    countByLevel[d.trl_level] = (countByLevel[d.trl_level] ?? 0) + d.count;
  }

  return [
    {
      label: 'TRL 1–3\nResearch',
      displayLabel: 'Research\n(1–3)',
      count: [1, 2, 3].reduce((s, l) => s + (countByLevel[l] ?? 0), 0),
      group: 'research',
    },
    {
      label: 'TRL 4–6\nValley of Death',
      displayLabel: 'Valley of Death\n(4–6)',
      count: [4, 5, 6].reduce((s, l) => s + (countByLevel[l] ?? 0), 0),
      group: 'valley',
    },
    {
      label: 'TRL 7–9\nDeployment',
      displayLabel: 'Deployment\n(7–9)',
      count: [7, 8, 9].reduce((s, l) => s + (countByLevel[l] ?? 0), 0),
      group: 'deployment',
    },
  ];
}

const GROUP_COLORS: Record<string, string> = {
  research: '#10b981',   // emerald
  valley: '#f59e0b',     // amber — "valley of death" highlight
  deployment: '#3b82f6', // blue
};

interface CustomTickProps {
  x?: number;
  y?: number;
  payload?: { value: string };
}

function CustomXTick({ x = 0, y = 0, payload }: CustomTickProps) {
  if (!payload) return null;
  const lines = payload.value.split('\n');
  return (
    <g transform={`translate(${x},${y})`}>
      {lines.map((line, i) => (
        <text
          key={i}
          x={0}
          y={0}
          dy={14 + i * 14}
          textAnchor="middle"
          fill="#6b7280"
          fontSize={11}
        >
          {line}
        </text>
      ))}
    </g>
  );
}

interface TooltipPayloadItem {
  value?: number;
  payload?: { group: string };
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const group = payload[0]?.payload?.group ?? '';
  const groupLabels: Record<string, string> = {
    research: 'Research Phase (TRL 1–3)',
    valley: 'Valley of Death (TRL 4–6)',
    deployment: 'Deployment Phase (TRL 7–9)',
  };
  return (
    <div className="rounded-lg border bg-white px-3 py-2 shadow-sm text-sm">
      <p className="font-medium text-gray-700">{groupLabels[group] ?? label}</p>
      <p className="text-gray-500">
        <span className="font-semibold text-gray-800">{payload[0]?.value ?? 0}</span> startup
        {(payload[0]?.value ?? 0) !== 1 ? 's' : ''}
      </p>
      {group === 'valley' && (
        <p className="text-amber-600 text-xs mt-1">
          High dropout risk — needs active support
        </p>
      )}
    </div>
  );
}

export function TrlDistributionChart({ data }: TrlDistributionChartProps) {
  const chartData = buildChartData(data);

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart
        data={chartData}
        margin={{ top: 8, right: 16, left: 0, bottom: 40 }}
        barSize={56}
      >
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
        <XAxis
          dataKey="displayLabel"
          tick={<CustomXTick />}
          axisLine={false}
          tickLine={false}
          interval={0}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
          width={28}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {chartData.map((entry) => (
            <Cell key={entry.group} fill={GROUP_COLORS[entry.group]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
