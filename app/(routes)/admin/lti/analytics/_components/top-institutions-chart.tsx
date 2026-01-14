/**
 * Top Institutions Chart Component
 * Bar chart showing top 10 institutions by launch count
 *
 * Created: 2026-01-12
 */

'use client';

import { Building2 } from 'lucide-react';

interface InstitutionStat {
  name: string;
  count: number;
}

interface TopInstitutionsChartProps {
  institutions: InstitutionStat[];
}

export function TopInstitutionsChart({
  institutions
}: TopInstitutionsChartProps) {
  if (institutions.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          No institution data available
        </p>
      </div>
    );
  }

  const maxCount = Math.max(...institutions.map((i) => i.count), 1);
  const totalCount = institutions.reduce((sum, i) => sum + i.count, 0);

  return (
    <div className="space-y-4">
      {institutions.map((institution, index) => {
        const percentage = (institution.count / totalCount) * 100;
        const colors = [
          'bg-blue-500',
          'bg-purple-500',
          'bg-green-500',
          'bg-orange-500',
          'bg-pink-500',
          'bg-indigo-500',
          'bg-red-500',
          'bg-yellow-500',
          'bg-teal-500',
          'bg-cyan-500'
        ];
        const color = colors[index % colors.length];

        return (
          <div key={institution.name} className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground font-mono text-xs">
                  #{index + 1}
                </span>
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{institution.name}</span>
              </div>
              <span className="text-muted-foreground">
                {institution.count.toLocaleString()} ({percentage.toFixed(1)}%)
              </span>
            </div>
            <div className="w-full bg-secondary rounded-full h-6 relative overflow-hidden">
              <div
                className={`${color} h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2`}
                style={{
                  width: `${(institution.count / maxCount) * 100}%`
                }}
              >
                {institution.count > 0 && (
                  <span className="text-xs font-medium text-white">
                    {institution.count}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Summary */}
      <div className="mt-6 p-4 bg-secondary/50 rounded-lg">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Total Launches</span>
          <span className="text-lg font-bold">{totalCount.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}
