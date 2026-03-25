/**
 * Tool Usage Chart Component
 * Bar chart showing launches by tool
 *
 * Created: 2026-01-12
 */

'use client';

interface ToolStat {
  name: string;
  count: number;
}

interface ToolUsageChartProps {
  tools: ToolStat[];
}

export function ToolUsageChart({ tools }: ToolUsageChartProps) {
  if (tools.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No tool usage data available</p>
      </div>
    );
  }

  const maxCount = Math.max(...tools.map((t) => t.count), 1);
  const totalCount = tools.reduce((sum, t) => sum + t.count, 0);

  return (
    <div className="space-y-4">
      {tools.map((tool, index) => {
        const percentage = (tool.count / totalCount) * 100;
        const colors = [
          'bg-blue-500',
          'bg-green-500',
          'bg-purple-500',
          'bg-orange-500',
          'bg-pink-500'
        ];
        const color = colors[index % colors.length];

        return (
          <div key={tool.name} className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{tool.name}</span>
              <span className="text-muted-foreground">
                {tool.count.toLocaleString()} ({percentage.toFixed(1)}%)
              </span>
            </div>
            <div className="w-full bg-secondary rounded-full h-6 relative overflow-hidden">
              <div
                className={`${color} h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2`}
                style={{
                  width: `${(tool.count / maxCount) * 100}%`
                }}
              >
                {tool.count > 0 && (
                  <span className="text-xs font-medium text-white">
                    {tool.count}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
