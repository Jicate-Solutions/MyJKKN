'use client';

import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Calendar,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  CreditCard,
  Target,
  Award,
  ArrowRight,
  TrendingDown
} from 'lucide-react';
import Link from 'next/link';

interface ProgressWidgetProps {
  title: string;
  value: number;
  maxValue: number;
  percentage: number;
  status: 'excellent' | 'good' | 'warning' | 'critical';
  icon: React.ElementType;
  description: string;
  actionText: string;
  actionHref: string;
}

function ProgressWidget({
  title,
  value,
  maxValue,
  percentage,
  status,
  icon: Icon,
  description,
  actionText,
  actionHref
}: ProgressWidgetProps) {
  const statusConfig = {
    excellent: {
      color: 'text-green-600',
      bgColor: 'bg-green-100',
      progressColor: 'bg-green-500',
      badgeColor: 'bg-green-100 text-green-700'
    },
    good: {
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
      progressColor: 'bg-blue-500',
      badgeColor: 'bg-blue-100 text-blue-700'
    },
    warning: {
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-100',
      progressColor: 'bg-yellow-500',
      badgeColor: 'bg-yellow-100 text-yellow-700'
    },
    critical: {
      color: 'text-red-600',
      bgColor: 'bg-red-100',
      progressColor: 'bg-red-500',
      badgeColor: 'bg-red-100 text-red-700'
    }
  };

  const config = statusConfig[status];

  return (
    <Card className="group hover:shadow-lg transition-all duration-300 border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${config.bgColor} flex items-center justify-center`}>
              <Icon className={`h-5 w-5 ${config.color}`} />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-gray-900">{title}</CardTitle>
              <p className="text-sm text-gray-600">{description}</p>
            </div>
          </div>
          <Badge className={`${config.badgeColor} border-0`}>
            {percentage}%
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">{value} of {maxValue}</span>
            <span className="font-medium text-gray-900">{percentage}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${percentage}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className={`h-2 rounded-full ${config.progressColor}`}
            />
          </div>
        </div>

        {/* Action Button */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-between text-gray-600 hover:text-blue-600 hover:bg-blue-50"
          asChild
        >
          <Link href={actionHref}>
            {actionText}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function LearnerProgressWidgets() {
  const progressData = [
    {
      title: 'Attendance Rate',
      value: 87,
      maxValue: 100,
      percentage: 87,
      status: 'good' as const,
      icon: Calendar,
      description: 'Current semester attendance',
      actionText: 'View Details',
      actionHref: '/learner/attendance'
    },
    {
      title: 'Bill Payments',
      value: 3,
      maxValue: 5,
      percentage: 60,
      status: 'warning' as const,
      icon: CreditCard,
      description: '2 payments pending',
      actionText: 'Pay Now',
      actionHref: '/learner/billing'
    },
    {
      title: 'Course Progress',
      value: 12,
      maxValue: 15,
      percentage: 80,
      status: 'good' as const,
      icon: Target,
      description: 'Subjects completed',
      actionText: 'View Courses',
      actionHref: '/learner/time-table'
    },
    {
      title: 'Bug Reports',
      value: 8,
      maxValue: 10,
      percentage: 80,
      status: 'excellent' as const,
      icon: Award,
      description: 'Community contributions',
      actionText: 'View Reports',
      actionHref: '/learner/bug-reports'
    }
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Your Progress</h2>
          <p className="text-sm text-gray-600">Track your academic journey</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <TrendingUp className="h-4 w-4 text-green-500" />
          <span>Overall: 77% Complete</span>
        </div>
      </div>

      {/* Progress Widgets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {progressData.map((widget, index) => (
          <motion.div
            key={widget.title}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
          >
            <ProgressWidget {...widget} />
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}