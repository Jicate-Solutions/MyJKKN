'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Calendar,
  CreditCard,
  Bell,
  BookOpen,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface DashboardCardProps {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ElementType;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  badge?: {
    text: string;
    variant: 'default' | 'secondary' | 'destructive' | 'success';
  };
  className?: string;
}

function DashboardCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  badge,
  className
}: DashboardCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card
        className={cn(
          'relative overflow-hidden hover:shadow-lg dark:hover:shadow-2xl transition-all duration-300 dark:bg-gray-800 dark:border-gray-700',
          className
        )}
      >
        <CardContent className='p-6'>
          <div className='flex items-start justify-between'>
            <div className='flex-1'>
              <div className='flex items-center gap-2 mb-2'>
                <Icon className='h-5 w-5 text-green-600 dark:text-green-400' />
                <span className='text-sm font-medium text-gray-600 dark:text-gray-300'>
                  {title}
                </span>
                {badge && (
                  <Badge variant={badge.variant as any} className='text-xs'>
                    {badge.text}
                  </Badge>
                )}
              </div>
              <div className='space-y-1'>
                <div className='text-2xl font-bold text-gray-900 dark:text-white'>
                  {value}
                </div>
                <div className='text-sm text-gray-500 dark:text-gray-400'>
                  {subtitle}
                </div>
                {trend && (
                  <div
                    className={cn(
                      'flex items-center gap-1 text-xs',
                      trend.isPositive
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    )}
                  >
                    <TrendingUp
                      className={cn(
                        'h-3 w-3',
                        !trend.isPositive && 'rotate-180'
                      )}
                    />
                    <span>{Math.abs(trend.value)}% vs last month</span>
                  </div>
                )}
              </div>
            </div>
            <div className='w-12 h-12 bg-green-50 dark:bg-green-900/30 rounded-lg flex items-center justify-center'>
              <Icon className='h-6 w-6 text-green-600 dark:text-green-400' />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function LearnerDashboardCards() {
  const [attendanceData, setAttendanceData] = useState({
    percentage: 85,
    present: 45,
    total: 53
  });

  const [billingData, setBillingData] = useState({
    totalFees: 45000,
    paidAmount: 35000,
    pendingAmount: 10000
  });

  const dashboardCards = [
    {
      title: 'Attendance',
      value: `${attendanceData.percentage}%`,
      subtitle: `${attendanceData.present}/${attendanceData.total} days present`,
      icon: Calendar,
      trend: { value: 5.2, isPositive: true },
      badge:
        attendanceData.percentage >= 75
          ? { text: 'Good', variant: 'default' as const }
          : { text: 'Low', variant: 'destructive' as const },
      className: 'border-l-4 border-l-green-500'
    },
    {
      title: 'Fee Status',
      value: '₹35,000',
      subtitle: `₹${billingData.pendingAmount.toLocaleString()} pending`,
      icon: CreditCard,
      badge:
        billingData.pendingAmount === 0
          ? { text: 'Paid', variant: 'default' as const }
          : { text: 'Pending', variant: 'secondary' as const },
      className: 'border-l-4 border-l-blue-500'
    },
    {
      title: 'Notifications',
      value: '7',
      subtitle: '3 unread messages',
      icon: Bell,
      badge: { text: 'New', variant: 'destructive' as const },
      className: 'border-l-4 border-l-orange-500'
    },
    {
      title: 'Current Semester',
      value: 'Sem 5',
      subtitle: 'Computer Science',
      icon: BookOpen,
      badge: { text: 'Active', variant: 'default' as const },
      className: 'border-l-4 border-l-purple-500'
    },
    {
      title: "Today's Classes",
      value: '4',
      subtitle: 'Next: Data Structures at 2:00 PM',
      icon: Clock,
      badge: { text: 'Upcoming', variant: 'secondary' as const },
      className: 'border-l-4 border-l-indigo-500'
    },
    {
      title: 'Assignments',
      value: '2',
      subtitle: 'Due this week',
      icon: CheckCircle,
      badge: { text: 'Due Soon', variant: 'secondary' as const },
      className: 'border-l-4 border-l-red-500'
    }
  ];

  return (
    <div className='px-4 py-6'>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className='mb-6'
      >
        <h2 className='text-2xl font-bold text-gray-900 dark:text-white mb-2'>
          Dashboard Overview
        </h2>
        <p className='text-gray-600 dark:text-gray-300'>
          Welcome back! Here&apos;s your academic summary
        </p>
      </motion.div>

      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
        {dashboardCards.map((card, index) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
          >
            <DashboardCard {...card} />
          </motion.div>
        ))}
      </div>

      {/* Quick Actions Row */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.6 }}
        className='mt-8'
      >
        <Card className='bg-gradient-to-r from-green-500 to-green-600 border-0 text-white'>
          <CardContent className='p-6'>
            <div className='flex items-center justify-between'>
              <div>
                <h3 className='text-lg font-semibold mb-1'>Quick Actions</h3>
                <p className='text-green-100'>Access your most used features</p>
              </div>
              <div className='flex gap-2'>
                <div className='w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center cursor-pointer hover:bg-white/30 transition-colors'>
                  <Calendar className='h-5 w-5' />
                </div>
                <div className='w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center cursor-pointer hover:bg-white/30 transition-colors'>
                  <CreditCard className='h-5 w-5' />
                </div>
                <div className='w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center cursor-pointer hover:bg-white/30 transition-colors'>
                  <Bell className='h-5 w-5' />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
