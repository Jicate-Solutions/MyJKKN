'use client';

import { useMemo } from 'react';

interface HeatmapData {
  name: string; // Organization unit name
  values: number[]; // Engagement scores for each day/period
}

interface EngagementHeatmapProps {
  data: HeatmapData[];
  labels: string[]; // Date labels (e.g., day names or dates)
  height?: number;
  title?: string;
  colorScheme?: 'green' | 'blue' | 'red';
}

// Color intensity calculation
const getColorIntensity = (value: number, max: number, scheme: string = 'blue') => {
  const intensity = Math.min(value / max, 1);

  const schemes = {
    blue: [
      'rgba(239, 246, 255, 1)',    // Very light
      'rgba(191, 219, 254, 1)',    // Light
      'rgba(147, 197, 253, 1)',    // Medium light
      'rgba(96, 165, 250, 1)',     // Medium
      'rgba(59, 130, 246, 1)',     // Medium dark
      'rgba(37, 99, 235, 1)',      // Dark
      'rgba(29, 78, 216, 1)'       // Very dark
    ],
    green: [
      'rgba(236, 253, 245, 1)',
      'rgba(209, 250, 229, 1)',
      'rgba(167, 243, 208, 1)',
      'rgba(110, 231, 183, 1)',
      'rgba(52, 211, 153, 1)',
      'rgba(16, 185, 129, 1)',
      'rgba(5, 150, 105, 1)'
    ],
    red: [
      'rgba(254, 242, 242, 1)',
      'rgba(254, 226, 226, 1)',
      'rgba(254, 202, 202, 1)',
      'rgba(252, 165, 165, 1)',
      'rgba(248, 113, 113, 1)',
      'rgba(239, 68, 68, 1)',
      'rgba(220, 38, 38, 1)'
    ]
  };

  const colors = schemes[scheme as keyof typeof schemes] || schemes.blue;
  const index = Math.floor(intensity * (colors.length - 1));
  return colors[index];
};

export function EngagementHeatmap({
  data,
  labels,
  height = 400,
  title,
  colorScheme = 'blue'
}: EngagementHeatmapProps) {
  // Calculate max value for color scaling
  const maxValue = useMemo(() => {
    return Math.max(...data.flatMap(d => d.values), 1);
  }, [data]);

  // Cell size calculations
  const cellWidth = 40;
  const cellHeight = 30;
  const labelWidth = 150;
  const labelHeight = 60;

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <p className="text-gray-500 text-sm">No heatmap data available</p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      {title && (
        <h3 className="text-lg font-semibold text-gray-900 mb-4 px-4">{title}</h3>
      )}

      <div className="min-w-max p-4">
        {/* Column headers (dates/periods) */}
        <div className="flex mb-2" style={{ marginLeft: labelWidth }}>
          {labels.map((label, idx) => (
            <div
              key={idx}
              className="text-xs text-gray-600 text-center"
              style={{ width: cellWidth }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Heatmap grid */}
        <div className="space-y-1">
          {data.map((row, rowIdx) => (
            <div key={rowIdx} className="flex items-center">
              {/* Row label (organization unit) */}
              <div
                className="text-sm text-gray-900 font-medium pr-3 truncate"
                style={{ width: labelWidth }}
                title={row.name}
              >
                {row.name}
              </div>

              {/* Heatmap cells */}
              <div className="flex gap-1">
                {row.values.map((value, colIdx) => (
                  <div
                    key={colIdx}
                    className="rounded border border-gray-200 flex items-center justify-center text-xs font-medium transition-all hover:scale-110 hover:shadow-md cursor-pointer"
                    style={{
                      width: cellWidth,
                      height: cellHeight,
                      backgroundColor: getColorIntensity(value, maxValue, colorScheme),
                      color: value / maxValue > 0.5 ? 'white' : '#374151'
                    }}
                    title={`${row.name} - ${labels[colIdx]}: ${value}`}
                  >
                    {value}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="mt-6 flex items-center justify-center gap-2">
          <span className="text-xs text-gray-600">Less</span>
          <div className="flex gap-1">
            {Array.from({ length: 7 }).map((_, idx) => (
              <div
                key={idx}
                className="w-6 h-6 rounded border border-gray-200"
                style={{
                  backgroundColor: getColorIntensity(
                    (idx / 6) * maxValue,
                    maxValue,
                    colorScheme
                  )
                }}
              />
            ))}
          </div>
          <span className="text-xs text-gray-600">More</span>
        </div>
      </div>
    </div>
  );
}
