'use client';

import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Clock,
  Calendar,
  CreditCard,
  BookOpen,
  CheckCircle,
  AlertTriangle,
  Users,
  FileText,
  ArrowRight,
  Bell,
  TrendingUp
} from 'lucide-react';
import Link from 'next/link';

interface ActivityItem {
  id: string;
  type: 'attendance' | 'payment' | 'course' | 'notification' | 'achievement' | 'facilitator';
  title: string;
  description: string;
  timestamp: string;
  status?: 'success' | 'warning' | 'info' | 'error';
  actionText?: string;
  actionHref?: string;
  avatar?: string;
  badge?: string;
}

const recentActivities: ActivityItem[] = [
  {
    id: '1',
    type: 'attendance',
    title: 'Attendance Marked',
    description: 'Successfully marked present for Computer Networks Lab',
    timestamp: '2 hours ago',
    status: 'success',
    actionText: 'View Details',
    actionHref: '/learner/attendance'
  },
  {
    id: '2',
    type: 'payment',
    title: 'Payment Reminder',
    description: 'Tuition fee payment due in 3 days (₹15,000)',
    timestamp: '4 hours ago',
    status: 'warning',
    actionText: 'Pay Now',
    actionHref: '/learner/billing',
    badge: 'Due Soon'
  },
  {
    id: '3',
    type: 'facilitator',
    title: 'New Message',
    description: 'Dr. Sarah Johnson sent you a message about project submission',
    timestamp: '6 hours ago',
    status: 'info',
    actionText: 'View Message',
    actionHref: '/learner',
    avatar: '/images/faculty/dr-sarah.jpg'
  },
  {
    id: '4',
    type: 'achievement',
    title: 'Achievement Unlocked!',
    description: 'Perfect Attendance: Attended all classes this week',
    timestamp: '1 day ago',
    status: 'success',
    actionText: 'View Achievements',
    actionHref: '/learner/bug-reports',
    badge: 'New'
  },
  {
    id: '5',
    type: 'course',
    title: 'New Assignment',
    description: 'Data Structures assignment uploaded - Due: March 25th',
    timestamp: '1 day ago',
    status: 'info',
    actionText: 'View Assignment',
    actionHref: '/learner/time-table'
  },
  {
    id: '6',
    type: 'notification',
    title: 'System Update',
    description: 'New features added to the student portal',
    timestamp: '2 days ago',
    status: 'info',
    actionText: 'Learn More',
    actionHref: '/learner/apps'
  }
];

function ActivityIcon({ type }: { type: ActivityItem['type'] }) {
  const iconMap = {
    attendance: Calendar,
    payment: CreditCard,
    course: BookOpen,
    notification: Bell,
    achievement: TrendingUp,
    facilitator: Users
  };

  const Icon = iconMap[type];
  return <Icon className="h-4 w-4" />;
}

function StatusBadge({ status }: { status: ActivityItem['status'] }) {
  if (!status) return null;

  const statusConfig = {
    success: 'bg-green-100 text-green-700 border-green-200',
    warning: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    info: 'bg-blue-100 text-blue-700 border-blue-200',
    error: 'bg-red-100 text-red-700 border-red-200'
  };

  return (
    <div className={`w-2 h-2 rounded-full ${statusConfig[status].replace('text-', 'bg-').replace('100', '500')}`} />
  );
}

function ActivityCard({ activity, index }: { activity: ActivityItem; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="group"
    >
      <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
        {/* Icon/Avatar */}
        <div className="flex-shrink-0 mt-1">
          {activity.avatar ? (
            <Avatar className="h-8 w-8">
              <AvatarImage src={activity.avatar} alt="Profile" />
              <AvatarFallback>
                <ActivityIcon type={activity.type} />
              </AvatarFallback>
            </Avatar>
          ) : (
            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
              <ActivityIcon type={activity.type} />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-medium text-gray-900 text-sm truncate">
              {activity.title}
            </h4>
            <StatusBadge status={activity.status} />
            {activity.badge && (
              <Badge variant="secondary" className="text-xs">
                {activity.badge}
              </Badge>
            )}
          </div>
          <p className="text-sm text-gray-600 mb-2 line-clamp-2">
            {activity.description}
          </p>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {activity.timestamp}
            </span>
            {activity.actionText && activity.actionHref && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-6 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                asChild
              >
                <Link href={activity.actionHref}>
                  {activity.actionText}
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function LearnerRecentActivity() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold text-gray-900">
                Recent Activity
              </CardTitle>
              <p className="text-sm text-gray-600 mt-1">
                Stay updated with your latest activities
              </p>
            </div>
            <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700">
              View All
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-1">
          {recentActivities.map((activity, index) => (
            <ActivityCard key={activity.id} activity={activity} index={index} />
          ))}

          {/* Show More Button */}
          <div className="pt-3">
            <Button
              variant="outline"
              className="w-full"
              asChild
            >
              <Link href="/learner/notifications">
                <Bell className="h-4 w-4 mr-2" />
                View All Notifications
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}