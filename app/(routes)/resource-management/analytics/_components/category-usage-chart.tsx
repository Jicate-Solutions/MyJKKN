// app/(routes)/resource-management/analytics/_components/category-usage-chart.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package } from 'lucide-react';

interface CategoryUsage {
  category_name: string;
  reservation_count: number;
  percentage: number;
}

interface CategoryUsageChartProps {
  data: CategoryUsage[];
  isLoading?: boolean;
}

export function CategoryUsageChart({
  data,
  isLoading = false
}: CategoryUsageChartProps) {
  const colors = [
    'bg-blue-500',
    'bg-green-500',
    'bg-purple-500',
    'bg-orange-500',
    'bg-pink-500',
    'bg-indigo-500',
    'bg-teal-500',
    'bg-red-500'
  ];

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Package className='h-5 w-5' />
            Usage by Category
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='space-y-4'>
            <div className='h-40 bg-gray-200 rounded animate-pulse'></div>
            <div className='space-y-2'>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className='flex items-center gap-2'>
                  <div className='h-3 w-3 bg-gray-200 rounded'></div>
                  <div className='h-3 bg-gray-200 rounded flex-1'></div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Package className='h-5 w-5' />
            Usage by Category
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className='text-sm text-muted-foreground text-center py-8'>
            No category data available
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Package className='h-5 w-5' />
          Usage by Category
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className='space-y-6'>
          {/* Horizontal Bar Chart */}
          <div className='space-y-3'>
            {data.map((category, index) => (
              <div key={category.category_name} className='space-y-1'>
                <div className='flex items-center justify-between text-sm'>
                  <div className='flex items-center gap-2'>
                    <div
                      className={`h-3 w-3 rounded ${
                        colors[index % colors.length]
                      }`}
                    />
                    <span className='font-medium'>
                      {category.category_name}
                    </span>
                  </div>
                  <span className='text-muted-foreground'>
                    {category.reservation_count} (
                    {category.percentage.toFixed(1)}%)
                  </span>
                </div>
                <div className='relative h-6 bg-gray-100 rounded-lg overflow-hidden'>
                  <div
                    className={`h-full ${
                      colors[index % colors.length]
                    } transition-all duration-500`}
                    style={{ width: `${category.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Donut Chart Visualization */}
          <div className='flex items-center justify-center pt-4'>
            <div className='relative w-48 h-48'>
              <svg viewBox='0 0 100 100' className='transform -rotate-90'>
                {data.map((category, index) => {
                  const prevPercentages = data
                    .slice(0, index)
                    .reduce((sum, cat) => sum + cat.percentage, 0);
                  const strokeDasharray = `${category.percentage} ${
                    100 - category.percentage
                  }`;
                  const strokeDashoffset = -prevPercentages;

                  return (
                    <circle
                      key={category.category_name}
                      cx='50'
                      cy='50'
                      r='40'
                      fill='none'
                      stroke={colors[index % colors.length]
                        .replace('bg-', '#')
                        .replace('500', '')
                        .replace('blue', '3b82f6')
                        .replace('green', '22c55e')
                        .replace('purple', 'a855f7')
                        .replace('orange', 'f97316')
                        .replace('pink', 'ec4899')
                        .replace('indigo', '6366f1')
                        .replace('teal', '14b8a6')
                        .replace('red', 'ef4444')}
                      strokeWidth='20'
                      strokeDasharray={strokeDasharray}
                      strokeDashoffset={strokeDashoffset}
                      className='transition-all duration-500'
                    />
                  );
                })}
                <circle cx='50' cy='50' r='30' fill='white' />
              </svg>
              <div className='absolute inset-0 flex items-center justify-center'>
                <div className='text-center'>
                  <p className='text-2xl font-bold'>
                    {data.reduce((sum, cat) => sum + cat.reservation_count, 0)}
                  </p>
                  <p className='text-xs text-muted-foreground'>Total</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
