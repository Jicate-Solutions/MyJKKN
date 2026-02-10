'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Search,
  ChevronDown,
  ChevronUp,
  BookOpen,
  User
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { FacilitatorImpactRow } from '@/types/facilitator-impact';

interface FacilitatorListProps {
  data?: FacilitatorImpactRow[];
  isLoading: boolean;
}

type SortKey = 'name' | 'courseCount' | 'department';
type SortDir = 'asc' | 'desc';

const ROLE_BADGES: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  facilitator: { label: 'Facilitator', variant: 'default' },
  trainer: { label: 'Trainer', variant: 'secondary' },
  industry_mentor: { label: 'Industry Mentor', variant: 'outline' },
  hybrid: { label: 'Hybrid', variant: 'secondary' },
  teacher: { label: 'Teacher', variant: 'outline' }
};

export function FacilitatorListTable({
  data,
  isLoading
}: FacilitatorListProps) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('courseCount');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    if (!data) return [];
    const term = search.toLowerCase();
    return data
      .filter(
        (f) =>
          !term ||
          `${f.firstName} ${f.lastName}`.toLowerCase().includes(term) ||
          f.departmentName.toLowerCase().includes(term) ||
          f.designation.toLowerCase().includes(term) ||
          f.courses.some((c) => c.toLowerCase().includes(term))
      )
      .sort((a, b) => {
        const dir = sortDir === 'asc' ? 1 : -1;
        if (sortKey === 'name') {
          return (
            dir *
            `${a.firstName} ${a.lastName}`.localeCompare(
              `${b.firstName} ${b.lastName}`
            )
          );
        }
        if (sortKey === 'courseCount') {
          return dir * (a.courseCount - b.courseCount);
        }
        if (sortKey === 'department') {
          return dir * a.departmentName.localeCompare(b.departmentName);
        }
        return 0;
      });
  }, [data, search, sortKey, sortDir]);

  const displayed = showAll ? filtered : filtered.slice(0, 20);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortKey !== columnKey)
      return <ChevronDown className='h-3 w-3 text-muted-foreground/50' />;
    return sortDir === 'asc' ? (
      <ChevronUp className='h-3 w-3' />
    ) : (
      <ChevronDown className='h-3 w-3' />
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className='h-6 w-40' />
          <Skeleton className='h-4 w-64' />
        </CardHeader>
        <CardContent>
          <Skeleton className='h-10 w-full mb-4' />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={`row-sk-${i}`} className='h-16 w-full mb-2' />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const facilitatorsWithCourses = data.filter((f) => f.courseCount > 0).length;
  const facilitatorsWithout = data.filter((f) => f.courseCount === 0).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
    >
      <Card>
        <CardHeader>
          <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-3'>
            <div>
              <CardTitle>Facilitator Impact View</CardTitle>
              <CardDescription>
                {data.length} facilitators &middot;{' '}
                {facilitatorsWithCourses} with courses &middot;{' '}
                {facilitatorsWithout} unassigned
              </CardDescription>
            </div>
            <div className='relative w-full sm:w-72'>
              <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
              <Input
                placeholder='Search name, department, course...'
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className='pl-9'
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Table */}
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='border-b'>
                  <th
                    className='text-left py-3 px-2 cursor-pointer select-none'
                    onClick={() => toggleSort('name')}
                  >
                    <div className='flex items-center gap-1'>
                      Facilitator
                      <SortIcon columnKey='name' />
                    </div>
                  </th>
                  <th
                    className='text-left py-3 px-2 cursor-pointer select-none hidden md:table-cell'
                    onClick={() => toggleSort('department')}
                  >
                    <div className='flex items-center gap-1'>
                      Department
                      <SortIcon columnKey='department' />
                    </div>
                  </th>
                  <th className='text-left py-3 px-2 hidden lg:table-cell'>
                    Role
                  </th>
                  <th
                    className='text-center py-3 px-2 cursor-pointer select-none'
                    onClick={() => toggleSort('courseCount')}
                  >
                    <div className='flex items-center justify-center gap-1'>
                      Courses
                      <SortIcon columnKey='courseCount' />
                    </div>
                  </th>
                  <th className='text-left py-3 px-2 hidden xl:table-cell'>
                    Assigned Courses
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayed.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className='text-center py-8 text-muted-foreground'
                    >
                      {search
                        ? 'No facilitators match your search'
                        : 'No facilitator data available'}
                    </td>
                  </tr>
                )}
                {displayed.map((f, i) => {
                  const roleBadge =
                    ROLE_BADGES[f.roleType] ?? ROLE_BADGES.teacher;
                  return (
                    <motion.tr
                      key={f.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                      className='border-b hover:bg-muted/30 transition-colors'
                    >
                      <td className='py-3 px-2'>
                        <div className='flex items-center gap-2'>
                          <div className='h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0'>
                            <User className='h-4 w-4 text-primary' />
                          </div>
                          <div>
                            <div className='font-medium'>
                              {f.firstName} {f.lastName}
                            </div>
                            <div className='text-xs text-muted-foreground'>
                              {f.designation || f.staffId}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className='py-3 px-2 hidden md:table-cell text-muted-foreground'>
                        {f.departmentName}
                      </td>
                      <td className='py-3 px-2 hidden lg:table-cell'>
                        <Badge variant={roleBadge.variant} className='text-xs'>
                          {roleBadge.label}
                        </Badge>
                      </td>
                      <td className='py-3 px-2 text-center'>
                        <div className='flex items-center justify-center gap-1'>
                          <BookOpen className='h-3.5 w-3.5 text-muted-foreground' />
                          <span
                            className={
                              f.courseCount > 0
                                ? 'font-semibold'
                                : 'text-muted-foreground'
                            }
                          >
                            {f.courseCount}
                          </span>
                        </div>
                      </td>
                      <td className='py-3 px-2 hidden xl:table-cell'>
                        <div className='flex flex-wrap gap-1'>
                          {f.courses.length === 0 && (
                            <span className='text-xs text-muted-foreground italic'>
                              No courses assigned
                            </span>
                          )}
                          {f.courses.slice(0, 3).map((c) => (
                            <Badge
                              key={c}
                              variant='outline'
                              className='text-xs font-normal'
                            >
                              {c.length > 30 ? c.slice(0, 28) + '...' : c}
                            </Badge>
                          ))}
                          {f.courses.length > 3 && (
                            <Badge variant='secondary' className='text-xs'>
                              +{f.courses.length - 3} more
                            </Badge>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Show more */}
          {filtered.length > 20 && !showAll && (
            <div className='text-center mt-4'>
              <button
                onClick={() => setShowAll(true)}
                className='text-sm text-primary hover:underline'
              >
                Show all {filtered.length} facilitators
              </button>
            </div>
          )}
          {showAll && filtered.length > 20 && (
            <div className='text-center mt-4'>
              <button
                onClick={() => setShowAll(false)}
                className='text-sm text-muted-foreground hover:underline'
              >
                Show less
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
