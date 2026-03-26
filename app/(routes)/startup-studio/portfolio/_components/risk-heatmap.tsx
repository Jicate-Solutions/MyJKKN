'use client';

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface RiskHeatmapPoint {
  candidate_id: string;
  startup_name: string;
  overall_risk_score: number;
  current_trl: number;
  overall_risk_level: string;
}

interface RiskHeatmapProps {
  data: RiskHeatmapPoint[];
}

const RISK_COLORS: Record<string, string> = {
  low: '#10b981',      // emerald
  moderate: '#eab308', // yellow
  high: '#f97316',     // orange
  critical: '#ef4444', // red
};

function getRiskColor(level: string): string {
  return RISK_COLORS[level?.toLowerCase()] ?? '#6b7280';
}

interface TooltipPayloadItem {
  payload?: RiskHeatmapPoint;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;

  const levelLabel =
    d.overall_risk_level
      ? d.overall_risk_level.charAt(0).toUpperCase() + d.overall_risk_level.slice(1).toLowerCase()
      : 'Unknown';

  return (
    <div className="rounded-lg border bg-white px-3 py-2 shadow-sm text-sm max-w-[200px]">
      <p className="font-semibold text-gray-800 truncate">{d.startup_name || 'Unnamed Startup'}</p>
      <div className="mt-1 space-y-0.5 text-gray-600">
        <p>Risk Score: <span className="font-medium">{d.overall_risk_score}/10</span></p>
        <p>TRL Level: <span className="font-medium">{d.current_trl}</span></p>
        <p>
          Risk Level:{' '}
          <span
            className="font-medium"
            style={{ color: getRiskColor(d.overall_risk_level) }}
          >
            {levelLabel}
          </span>
        </p>
      </div>
    </div>
  );
}

export function RiskHeatmap({ data }: RiskHeatmapProps) {
  return (
    <div className="space-y-3">
      <ResponsiveContainer width="100%" height={240}>
        <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis
            type="number"
            dataKey="overall_risk_score"
            name="Risk Score"
            domain={[0, 10]}
            ticks={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            axisLine={false}
            tickLine={false}
            label={{ value: 'Overall Risk Score', position: 'insideBottom', offset: -2, fontSize: 11, fill: '#9ca3af' }}
          />
          <YAxis
            type="number"
            dataKey="current_trl"
            name="TRL Level"
            domain={[0, 10]}
            ticks={[1, 2, 3, 4, 5, 6, 7, 8, 9]}
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            axisLine={false}
            tickLine={false}
            width={32}
            label={{ value: 'TRL Level', angle: -90, position: 'insideLeft', offset: 8, fontSize: 11, fill: '#9ca3af' }}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
          <Scatter data={data} name="Startups">
            {data.map((entry) => (
              <Cell
                key={entry.candidate_id}
                fill={getRiskColor(entry.overall_risk_level)}
                fillOpacity={0.8}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 justify-end">
        {[
          { level: 'low', label: 'Low', color: RISK_COLORS.low },
          { level: 'moderate', label: 'Moderate', color: RISK_COLORS.moderate },
          { level: 'high', label: 'High', color: RISK_COLORS.high },
          { level: 'critical', label: 'Critical', color: RISK_COLORS.critical },
        ].map(({ level, label, color }) => (
          <span key={level} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
