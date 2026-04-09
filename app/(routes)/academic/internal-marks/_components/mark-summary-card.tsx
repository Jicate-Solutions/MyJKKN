'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Users, CheckCircle2, Clock, UserX } from 'lucide-react';

interface MarkSummaryCardProps {
  totalLearners: number;
  marksEntered: number;
  pending: number;
  absentCount: number;
}

export function MarkSummaryCard({
  totalLearners,
  marksEntered,
  pending,
  absentCount,
}: MarkSummaryCardProps) {
  const stats = [
    {
      label: 'Total Learners',
      value: totalLearners,
      icon: Users,
      color: 'text-blue-600',
    },
    {
      label: 'Marks Entered',
      value: marksEntered,
      icon: CheckCircle2,
      color: 'text-green-600',
    },
    {
      label: 'Pending',
      value: pending,
      icon: Clock,
      color: 'text-amber-600',
    },
    {
      label: 'Absent',
      value: absentCount,
      icon: UserX,
      color: 'text-red-600',
    },
  ];

  return (
    <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className='flex items-center gap-3 p-4'>
            <stat.icon className={`h-8 w-8 ${stat.color}`} />
            <div>
              <p className='text-2xl font-bold'>{stat.value}</p>
              <p className='text-xs text-muted-foreground'>{stat.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
