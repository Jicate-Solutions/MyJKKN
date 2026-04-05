'use client';

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

const FINKS_DIMENSIONS = [
  { key: 'foundational_knowledge', label: 'Foundational Knowledge', short: 'FK' },
  { key: 'application', label: 'Application', short: 'App' },
  { key: 'integration', label: 'Integration', short: 'Int' },
  { key: 'human_dimension', label: 'Human Dimension', short: 'HD' },
  { key: 'caring', label: 'Caring', short: 'Car' },
  { key: 'learning_how_to_learn', label: 'Learning How to Learn', short: 'L2L' },
] as const;

interface FinksRadarProps {
  data: Record<string, number>;
  target?: Record<string, number>;
  isLoading?: boolean;
}

export function FinksRadar({ data, target, isLoading }: FinksRadarProps) {
  if (isLoading) {
    return (
      <div className="animate-pulse flex items-center justify-center h-[300px]">
        <div className="w-48 h-48 rounded-full bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  const hasData = Object.values(data).some((v) => v > 0);
  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
        No Fink&apos;s dimension data available yet.
      </div>
    );
  }

  const chartData = FINKS_DIMENSIONS.map((dim) => ({
    dimension: dim.short,
    fullName: dim.label,
    score: Math.round(data[dim.key] || 0),
    target: target ? Math.round(target[dim.key] || 0) : undefined,
  }));

  return (
    <div className="space-y-2">
      <ResponsiveContainer width="100%" height={300}>
        <RadarChart data={chartData} cx="50%" cy="50%" outerRadius="75%">
          <PolarGrid stroke="#e5e7eb" />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{ fontSize: 12, fill: '#6b7280' }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            tickCount={5}
          />
          {target && (
            <Radar
              name="Target"
              dataKey="target"
              stroke="#ffde59"
              fill="#ffde59"
              fillOpacity={0.15}
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
          )}
          <Radar
            name="Cohort Average"
            dataKey="score"
            stroke="#0b6d41"
            fill="#0b6d41"
            fillOpacity={0.25}
            strokeWidth={2}
          />
          <Tooltip
            content={({ payload }) => {
              if (!payload || payload.length === 0) return null;
              const item = payload[0]?.payload;
              return (
                <div className="bg-white dark:bg-gray-900 border rounded-md px-3 py-2 shadow-md">
                  <p className="text-sm font-medium">{item?.fullName}</p>
                  <p className="text-xs text-muted-foreground">
                    Score: <span className="font-bold text-[#0b6d41]">{item?.score}%</span>
                  </p>
                  {item?.target !== undefined && (
                    <p className="text-xs text-muted-foreground">
                      Target: <span className="font-bold text-[#ffde59]">{item?.target}%</span>
                    </p>
                  )}
                </div>
              );
            }}
          />
        </RadarChart>
      </ResponsiveContainer>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 text-xs text-muted-foreground px-2">
        {FINKS_DIMENSIONS.map((dim) => (
          <div key={dim.key}>
            <span className="font-medium">{dim.short}</span> = {dim.label}
          </div>
        ))}
      </div>
    </div>
  );
}
