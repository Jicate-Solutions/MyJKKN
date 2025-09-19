'use client';

import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Calendar,
  Clock,
  CreditCard,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  BookOpen,
  Users,
  Target,
  Award,
  ArrowRight,
  DollarSign
} from 'lucide-react';
import Link from 'next/link';

interface SummaryCardProps {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  actionText: string;
  actionHref: string;
  badge?: {
    text: string;
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
  };
}

const summaryData: SummaryCardProps[] = [
  {
    title: 'Today\'s Classes',
    value: '4',
    subtitle: 'Next: Data Structures at 2:00 PM',
    icon: Clock,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    actionText: 'View Timetable',
    actionHref: '/learner/time-table',
    badge: {
      text: 'Live',
      variant: 'default'
    }
  },
  {
    title: 'Attendance Rate',
    value: '87%',
    subtitle: 'Current semester average',
    icon: Calendar,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    trend: {
      value: '+5%',
      isPositive: true
    },
    actionText: 'View Details',
    actionHref: '/learner/attendance'
  },
  {
    title: 'Pending Bills',
    value: '₹15,000',
    subtitle: 'Tuition fee due in 3 days',
    icon: CreditCard,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    actionText: 'Pay Now',
    actionHref: '/learner/billing',
    badge: {
      text: 'Due Soon',
      variant: 'destructive'
    }
  },
  {
    title: 'Course Progress',
    value: '12/15',
    subtitle: 'Subjects completed',
    icon: BookOpen,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    trend: {
      value: '+2',
      isPositive: true
    },
    actionText: 'View Progress',
    actionHref: '/learner/time-table'
  },
  {
    title: 'Active Apps',
    value: '8',
    subtitle: 'Educational tools in use',
    icon: Target,
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-50',
    actionText: 'Browse Apps',
    actionHref: '/learner/apps'
  },
  {
    title: 'Bug Reports',
    value: '12',
    subtitle: 'Community contributions',
    icon: Award,
    color: 'text-pink-600',
    bgColor: 'bg-pink-50',
    trend: {
      value: '+3',
      isPositive: true
    },
    actionText: 'View Reports',
    actionHref: '/learner/bug-reports',
    badge: {
      text: 'Level 3',
      variant: 'secondary'
    }
  }
];

function SummaryCard({ card, index }: { card: SummaryCardProps; index: number }) {
  const Icon = card.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.1 }}
    >
      <Card className="group hover:shadow-lg transition-all duration-300 border-0 shadow-sm h-full">
        <CardContent className="p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className={`w-10 h-10 rounded-xl ${card.bgColor} flex items-center justify-center group-hover:scale-110 transition-transform duration-200`}>
              <Icon className={`h-5 w-5 ${card.color}`} />
            </div>
            <div className="flex items-center gap-2">
              {card.trend && (
                <div className={`flex items-center gap-1 text-xs ${
                  card.trend.isPositive ? 'text-green-600' : 'text-red-600'
                }`}>
                  <TrendingUp className={`h-3 w-3 ${
                    card.trend.isPositive ? '' : 'rotate-180'
                  }`} />
                  {card.trend.value}
                </div>
              )}
              {card.badge && (
                <Badge variant={card.badge.variant} className="text-xs">
                  {card.badge.text}
                </Badge>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="space-y-2 mb-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-gray-600 text-sm">
                {card.title}
              </h3>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {card.value}
            </div>
            <p className="text-sm text-gray-600 line-clamp-2">
              {card.subtitle}
            </p>
          </div>

          {/* Action */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-between text-gray-600 hover:text-blue-600 hover:bg-blue-50 group-hover:bg-blue-50"
            asChild
          >
            <Link href={card.actionHref}>
              {card.actionText}
              <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform duration-200" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function LearnerSummaryCards() {
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
          <h2 className="text-xl font-bold text-gray-900">Dashboard Overview</h2>
          <p className="text-sm text-gray-600">Your academic summary at a glance</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
          <span>Live Data</span>
        </div>
      </div>

      {/* Summary Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {summaryData.map((card, index) => (
          <SummaryCard key={card.title} card={card} index={index} />
        ))}
      </div>
    </motion.div>
  );
}