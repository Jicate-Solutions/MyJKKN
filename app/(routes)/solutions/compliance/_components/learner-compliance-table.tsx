'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Search,
  ChevronUp,
  ChevronDown,
  UserCircle,
  Star
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import type { LearnerCompliance, ComplianceFilters, ClearanceStatus } from '@/types/compliance';
import { CLEARANCE_STATUS_CONFIG } from '@/types/compliance';

interface LearnerComplianceTableProps {
  data?: LearnerCompliance[];
  isLoading: boolean;
  filters: ComplianceFilters;
  onFiltersChange: (filters: ComplianceFilters) => void;
}

type SortKey = 'lastName' | 'departmentName' | 'clearanceStatus' | 'solutionTitle';
type SortDir = 'asc' | 'desc';

const STATUS_ORDER: Record<ClearanceStatus, number> = {
  cleared: 0,
  completed: 1,
  in_progress: 2,
  registered: 3,
  not_started: 4
};

export function LearnerComplianceTable({
  data,
  isLoading,
  filters,
  onFiltersChange
}: LearnerComplianceTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('clearanceStatus');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [statusFilter, setStatusFilter] = useState<ClearanceStatus | 'all'>('all');
  const [showCount, setShowCount] = useState(25);

  const filtered = useMemo(() => {
    if (!data) return [];
    let result = [...data];

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((l) => l.clearanceStatus === statusFilter);
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (l) =>
          l.firstName.toLowerCase().includes(q) ||
          l.lastName.toLowerCase().includes(q) ||
          (l.rollNumber && l.rollNumber.toLowerCase().includes(q)) ||
          (l.registerNumber && l.registerNumber.toLowerCase().includes(q)) ||
          (l.departmentName && l.departmentName.toLowerCase().includes(q)) ||
          (l.solutionTitle && l.solutionTitle.toLowerCase().includes(q)) ||
          (l.builderCode && l.builderCode.toLowerCase().includes(q))
      );
    }

    // Sort
    result.sort((a, b) => {
      if (sortKey === 'clearanceStatus') {
        const aOrder = STATUS_ORDER[a.clearanceStatus];
        const bOrder = STATUS_ORDER[b.clearanceStatus];
        return sortDir === 'asc' ? aOrder - bOrder : bOrder - aOrder;
      }
      const aVal = (a[sortKey] ?? '') as string;
      const bVal = (b[sortKey] ?? '') as string;
      return sortDir === 'asc'
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    });

    return result;
  }, [data, searchQuery, sortKey, sortDir, statusFilter]);

  const displayed = filtered.slice(0, showCount);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'clearanceStatus' ? 'desc' : 'asc');
    }
  };

  if (isLoading) {
    return (
      <div className='space-y-4'>
        <div className='flex gap-3'>
          <Skeleton className='h-10 w-64' />
          <Skeleton className='h-10 w-40' />
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className='h-16 w-full' />
        ))}
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      {/* Search and status filter */}
      <div className='flex flex-col sm:flex-row gap-3'>
        <div className='relative flex-1 max-w-sm'>
          <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
          <Input
            placeholder='Search by name, roll number, solution...'
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className='pl-9'
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as ClearanceStatus | 'all')}
        >
          <SelectTrigger className='w-full sm:w-[200px]'>
            <SelectValue placeholder='All Statuses' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All Statuses</SelectItem>
            {Object.entries(CLEARANCE_STATUS_CONFIG).map(([key, config]) => (
              <SelectItem key={key} value={key}>
                {config.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {data && (
          <span className='text-sm text-muted-foreground self-center'>
            {filtered.length} of {data.length} learners
          </span>
        )}
      </div>

      {/* Sort buttons */}
      <div className='flex flex-wrap gap-2'>
        <span className='text-sm text-muted-foreground self-center mr-1'>Sort:</span>
        {[
          { key: 'lastName' as SortKey, label: 'Name' },
          { key: 'departmentName' as SortKey, label: 'Department' },
          { key: 'clearanceStatus' as SortKey, label: 'Status' },
          { key: 'solutionTitle' as SortKey, label: 'Solution' }
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

      {/* Learner rows */}
      {displayed.length === 0 ? (
        <Card>
          <CardContent className='pt-6 text-center text-muted-foreground'>
            <UserCircle className='h-12 w-12 mx-auto mb-3 opacity-30' />
            <p>No learners found matching your criteria</p>
          </CardContent>
        </Card>
      ) : (
        <div className='space-y-2'>
          {displayed.map((learner, index) => {
            const statusConfig = CLEARANCE_STATUS_CONFIG[learner.clearanceStatus];

            return (
              <motion.div
                key={learner.learnerId}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.02 }}
              >
                <Card className='hover:shadow-sm transition-shadow'>
                  <CardContent className='py-4'>
                    <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2'>
                      {/* Left: Name and details */}
                      <div className='flex items-start gap-3'>
                        <div className='p-2 rounded-full bg-muted/50'>
                          <UserCircle className='h-5 w-5 text-muted-foreground' />
                        </div>
                        <div>
                          <p className='font-semibold'>
                            {learner.firstName} {learner.lastName}
                          </p>
                          <div className='flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground'>
                            {learner.rollNumber && (
                              <span>Roll: {learner.rollNumber}</span>
                            )}
                            {learner.departmentName && (
                              <span>{learner.departmentName}</span>
                            )}
                            {learner.builderCode && (
                              <span>Builder: {learner.builderCode}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Status and solution */}
                      <div className='flex items-center gap-2 sm:gap-3'>
                        {learner.solutionTitle && (
                          <span className='text-xs text-muted-foreground max-w-[150px] truncate'>
                            {learner.solutionTitle}
                          </span>
                        )}
                        {learner.assignmentRole && (
                          <Badge variant='outline' className='text-xs capitalize'>
                            {learner.assignmentRole}
                          </Badge>
                        )}
                        {learner.assignmentRating != null && (
                          <span className='flex items-center gap-0.5 text-xs text-amber-600'>
                            <Star className='h-3 w-3 fill-amber-400 text-amber-400' />
                            {learner.assignmentRating.toFixed(1)}
                          </span>
                        )}
                        <Badge
                          variant='outline'
                          className={`text-xs border ${statusConfig.color}`}
                        >
                          {statusConfig.label}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Show more/less */}
      {filtered.length > showCount && (
        <div className='text-center'>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => setShowCount((c) => c + 25)}
          >
            Show more ({filtered.length - showCount} remaining)
          </Button>
        </div>
      )}
      {showCount > 25 && filtered.length > 25 && (
        <div className='text-center'>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => setShowCount(25)}
          >
            Show less
          </Button>
        </div>
      )}
    </div>
  );
}
