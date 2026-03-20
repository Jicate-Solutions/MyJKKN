'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle,
  BookOpen,
  Calendar,
  CalendarX,
  Clock,
  GraduationCap,
  Users,
} from 'lucide-react';
import { format } from 'date-fns';

interface PendingStatsCardsProps {
  metadata: {
    total: number;
    overdueCount: number;
    todayCount: number;
    sectionsCount: number;
    subjectsCount: number;
    staffCount: number;
  };
  isLoading: boolean;
  isFaculty: boolean;
  startDate?: string;
  endDate?: string;
}

const formatDateRange = (start?: string, end?: string): string => {
  if (!start || !end) return 'Last 7 days';
  const s = format(new Date(start + 'T00:00:00'), 'd MMM');
  const e = format(new Date(end + 'T00:00:00'), 'd MMM');
  return `${s} – ${e}`;
};

export function PendingStatsCards({
  metadata,
  isLoading,
  isFaculty,
  startDate,
  endDate,
}: PendingStatsCardsProps) {
  const cardCount = isFaculty ? 5 : 6;
  const gridClass = isFaculty
    ? 'grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5'
    : 'grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6';

  if (isLoading) {
    return (
      <div className={gridClass}>
        {Array.from({ length: cardCount }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-7 w-16 mb-1" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const adminCards = [
    {
      label: 'Total Pending',
      icon: CalendarX,
      iconBg: 'bg-blue-500',
      bgGradient: 'from-blue-50 to-blue-100',
      gradient: 'from-blue-500 to-blue-600',
      value: metadata.total,
    },
    {
      label: 'Overdue',
      icon: AlertTriangle,
      iconBg: 'bg-red-500',
      bgGradient: 'from-red-50 to-red-100',
      gradient: 'from-red-500 to-red-600',
      value: metadata.overdueCount,
    },
    {
      label: 'Due Today',
      icon: Clock,
      iconBg: 'bg-amber-500',
      bgGradient: 'from-amber-50 to-amber-100',
      gradient: 'from-amber-500 to-amber-600',
      value: metadata.todayCount,
    },
    {
      label: 'Sections Affected',
      icon: GraduationCap,
      iconBg: 'bg-purple-500',
      bgGradient: 'from-purple-50 to-purple-100',
      gradient: 'from-purple-500 to-purple-600',
      value: metadata.sectionsCount,
    },
    {
      label: 'Subjects Affected',
      icon: BookOpen,
      iconBg: 'bg-green-500',
      bgGradient: 'from-green-50 to-green-100',
      gradient: 'from-green-500 to-green-600',
      value: metadata.subjectsCount,
    },
    {
      label: 'Staff With Pending',
      icon: Users,
      iconBg: 'bg-slate-500',
      bgGradient: 'from-slate-50 to-slate-100',
      gradient: 'from-slate-500 to-slate-600',
      value: metadata.staffCount,
    },
  ];

  const facultyCards = [
    {
      label: 'Total Pending',
      icon: CalendarX,
      iconBg: 'bg-blue-500',
      bgGradient: 'from-blue-50 to-blue-100',
      gradient: 'from-blue-500 to-blue-600',
      value: metadata.total as number | string,
    },
    {
      label: 'Date Range',
      icon: Calendar,
      iconBg: 'bg-slate-500',
      bgGradient: 'from-slate-50 to-slate-100',
      gradient: 'from-slate-500 to-slate-600',
      value: formatDateRange(startDate, endDate) as number | string,
    },
    {
      label: 'Due Today',
      icon: Clock,
      iconBg: 'bg-amber-500',
      bgGradient: 'from-amber-50 to-amber-100',
      gradient: 'from-amber-500 to-amber-600',
      value: metadata.todayCount as number | string,
    },
    {
      label: 'Sections Affected',
      icon: GraduationCap,
      iconBg: 'bg-purple-500',
      bgGradient: 'from-purple-50 to-purple-100',
      gradient: 'from-purple-500 to-purple-600',
      value: metadata.sectionsCount as number | string,
    },
    {
      label: 'Subjects Affected',
      icon: BookOpen,
      iconBg: 'bg-green-500',
      bgGradient: 'from-green-50 to-green-100',
      gradient: 'from-green-500 to-green-600',
      value: metadata.subjectsCount as number | string,
    },
  ];

  const cards = isFaculty ? facultyCards : adminCards;

  return (
    <div className={gridClass}>
      {cards.map((card, index) => (
        <Card
          key={index}
          className={`border-0 shadow-sm bg-gradient-to-br ${card.bgGradient} hover:shadow-md transition-shadow`}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.label}
            </CardTitle>
            <div className={`p-1.5 rounded-full ${card.iconBg}`}>
              <card.icon className="h-3.5 w-3.5 text-white" />
            </div>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold bg-gradient-to-r ${card.gradient} bg-clip-text text-transparent`}
            >
              {typeof card.value === 'number' ? card.value.toLocaleString() : card.value}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
