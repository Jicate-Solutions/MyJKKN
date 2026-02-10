'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Building2, ArrowUpDown, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import type { DepartmentCompliance } from '@/types/compliance';

interface DepartmentBreakdownProps {
  data?: DepartmentCompliance[];
  isLoading: boolean;
}

type SortKey = 'departmentName' | 'totalLearners' | 'clearanceRate' | 'notStarted';
type SortDir = 'asc' | 'desc';

export function DepartmentBreakdown({ data, isLoading }: DepartmentBreakdownProps) {
  const [sortKey, setSortKey] = useState<SortKey>('clearanceRate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showAll, setShowAll] = useState(false);

  if (isLoading) {
    return (
      <div className='space-y-4'>
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <CardContent className='pt-6'>
              <div className='flex justify-between items-center'>
                <Skeleton className='h-5 w-48' />
                <Skeleton className='h-5 w-20' />
              </div>
              <Skeleton className='h-2 w-full mt-3' />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className='pt-6 text-center text-muted-foreground'>
          <Building2 className='h-12 w-12 mx-auto mb-3 opacity-30' />
          <p>No department data available</p>
        </CardContent>
      </Card>
    );
  }

  const sorted = [...data].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDir === 'asc'
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    }
    return sortDir === 'asc'
      ? (aVal as number) - (bVal as number)
      : (bVal as number) - (aVal as number);
  });

  const displayed = showAll ? sorted : sorted.slice(0, 10);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  return (
    <div className='space-y-4'>
      {/* Sort controls */}
      <div className='flex flex-wrap gap-2'>
        <span className='text-sm text-muted-foreground self-center mr-1'>Sort by:</span>
        {[
          { key: 'departmentName' as SortKey, label: 'Name' },
          { key: 'clearanceRate' as SortKey, label: 'Clearance Rate' },
          { key: 'totalLearners' as SortKey, label: 'Total Learners' },
          { key: 'notStarted' as SortKey, label: 'Not Started' }
        ].map((btn) => (
          <Button
            key={btn.key}
            variant={sortKey === btn.key ? 'default' : 'outline'}
            size='sm'
            onClick={() => toggleSort(btn.key)}
            className='gap-1'
          >
            {btn.label}
            {sortKey === btn.key && (
              sortDir === 'asc' ? <ChevronUp className='h-3 w-3' /> : <ChevronDown className='h-3 w-3' />
            )}
          </Button>
        ))}
      </div>

      {/* Department cards */}
      {displayed.map((dept, index) => (
        <motion.div
          key={dept.departmentId}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05 }}
        >
          <Card>
            <CardContent className='pt-6'>
              <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3'>
                <div className='flex items-center gap-2'>
                  <Building2 className='h-4 w-4 text-muted-foreground' />
                  <span className='font-semibold'>{dept.departmentName}</span>
                  <span className='text-xs text-muted-foreground'>
                    {dept.institutionName}
                  </span>
                </div>
                <div className='flex items-center gap-2'>
                  <Badge
                    variant='outline'
                    className={
                      dept.clearanceRate >= 80
                        ? 'border-green-200 text-green-700 bg-green-50'
                        : dept.clearanceRate >= 50
                          ? 'border-amber-200 text-amber-700 bg-amber-50'
                          : 'border-red-200 text-red-700 bg-red-50'
                    }
                  >
                    {dept.clearanceRate.toFixed(1)}% cleared
                  </Badge>
                  <span className='text-sm text-muted-foreground'>
                    {dept.totalLearners} learners
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className='h-2 bg-muted rounded-full overflow-hidden flex'>
                <div
                  className='bg-green-500 h-full'
                  style={{
                    width: `${dept.totalLearners > 0 ? (dept.cleared / dept.totalLearners) * 100 : 0}%`
                  }}
                />
                <div
                  className='bg-amber-500 h-full'
                  style={{
                    width: `${dept.totalLearners > 0 ? (dept.inProgress / dept.totalLearners) * 100 : 0}%`
                  }}
                />
                <div
                  className='bg-red-500 h-full'
                  style={{
                    width: `${dept.totalLearners > 0 ? (dept.notStarted / dept.totalLearners) * 100 : 0}%`
                  }}
                />
              </div>

              {/* Legend */}
              <div className='flex gap-4 mt-2 text-xs text-muted-foreground'>
                <span className='flex items-center gap-1'>
                  <span className='w-2 h-2 rounded-full bg-green-500' />
                  Cleared: {dept.cleared}
                </span>
                <span className='flex items-center gap-1'>
                  <span className='w-2 h-2 rounded-full bg-amber-500' />
                  In Progress: {dept.inProgress}
                </span>
                <span className='flex items-center gap-1'>
                  <span className='w-2 h-2 rounded-full bg-red-500' />
                  Not Started: {dept.notStarted}
                </span>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}

      {/* Show more/less */}
      {sorted.length > 10 && (
        <div className='text-center'>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => setShowAll(!showAll)}
          >
            {showAll
              ? `Show less`
              : `Show all ${sorted.length} departments`}
          </Button>
        </div>
      )}
    </div>
  );
}
