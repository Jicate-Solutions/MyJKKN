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
  LineChart,
  Line,
  Legend,
} from 'recharts';

const AGENCY_LEVELS = [
  { key: 'dependent', label: 'Dependent', color: '#ef4444' },
  { key: 'guided', label: 'Guided', color: '#f97316' },
  { key: 'collaborative', label: 'Collaborative', color: '#eab308' },
  { key: 'self_directed', label: 'Self-Directed', color: '#22c55e' },
  { key: 'principal', label: 'Principal', color: '#0b6d41' },
] as const;

// ---------- Bar Chart: Distribution ----------

interface AgencyDistributionBarProps {
  distribution: Record<string, number>;
  isLoading?: boolean;
}

export function AgencyDistributionBar({
  distribution,
  isLoading,
}: AgencyDistributionBarProps) {
  if (isLoading) {
    return (
      <div className="animate-pulse h-[280px] bg-gray-50 dark:bg-gray-800 rounded" />
    );
  }

  const hasData = Object.values(distribution).some((v) => v > 0);
  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-[280px] text-muted-foreground text-sm">
        No agency index data available yet.
      </div>
    );
  }

  const chartData = AGENCY_LEVELS.map((level) => ({
    name: level.label,
    count: distribution[level.key] || 0,
    color: level.color,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
        <Tooltip
          content={({ payload }) => {
            if (!payload || payload.length === 0) return null;
            const item = payload[0]?.payload;
            return (
              <div className="bg-white dark:bg-gray-900 border rounded-md px-3 py-2 shadow-md">
                <p className="text-sm font-medium">{item?.name}</p>
                <p className="text-xs">
                  {item?.count} Learner{item?.count !== 1 ? 's' : ''}
                </p>
              </div>
            );
          }}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={60}>
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------- Line Chart: Agency Trend Over Time ----------

interface AgencyTrendPoint {
  date: string;
  average: number;
}

interface AgencyTrendLineProps {
  data: AgencyTrendPoint[];
  isLoading?: boolean;
}

export function AgencyTrendLine({ data, isLoading }: AgencyTrendLineProps) {
  if (isLoading) {
    return (
      <div className="animate-pulse h-[200px] bg-gray-50 dark:bg-gray-800 rounded" />
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
        Not enough data for trend analysis yet.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
        <Tooltip
          content={({ payload }) => {
            if (!payload || payload.length === 0) return null;
            const item = payload[0]?.payload;
            return (
              <div className="bg-white dark:bg-gray-900 border rounded-md px-3 py-2 shadow-md">
                <p className="text-xs text-muted-foreground">{item?.date}</p>
                <p className="text-sm font-medium">
                  Avg Agency: <span className="text-[#0b6d41]">{item?.average}</span>
                </p>
              </div>
            );
          }}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="average"
          name="Average Agency Index"
          stroke="#0b6d41"
          strokeWidth={2}
          dot={{ fill: '#0b6d41', r: 3 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
