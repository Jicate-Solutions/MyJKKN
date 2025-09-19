'use client';

import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Calendar,
  CreditCard,
  Clock,
  BookOpen,
  Users,
  FileText,
  Bug,
  Settings,
  ArrowRight,
  Bell,
  Download
} from 'lucide-react';
import Link from 'next/link';

interface QuickActionItem {
  title: string;
  description: string;
  icon: React.ElementType;
  href: string;
  color: string;
  bgColor: string;
  badge?: string;
  badgeColor?: string;
}

const quickActions: QuickActionItem[] = [
  {
    title: 'View Timetable',
    description: 'Check today\'s classes',
    icon: Clock,
    href: '/learner/time-table',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    badge: 'Today',
    badgeColor: 'bg-blue-100 text-blue-700'
  },
  {
    title: 'Mark Attendance',
    description: 'Submit attendance for current period',
    icon: Calendar,
    href: '/learner/attendance',
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    badge: 'Live',
    badgeColor: 'bg-green-100 text-green-700'
  },
  {
    title: 'Pay Bills',
    description: 'View pending payments',
    icon: CreditCard,
    href: '/learner/billing',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    badge: '2 Pending',
    badgeColor: 'bg-red-100 text-red-700'
  },
  {
    title: 'Browse Apps',
    description: 'Educational tools & resources',
    icon: BookOpen,
    href: '/learner/apps',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50'
  },
  {
    title: 'Contact Faculty',
    description: 'Get in touch with facilitators',
    icon: Users,
    href: '/learner',
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-50'
  },
  {
    title: 'Report Bug',
    description: 'Help improve the platform',
    icon: Bug,
    href: '/learner/bug-reports',
    color: 'text-pink-600',
    bgColor: 'bg-pink-50'
  }
];

function QuickActionCard({ action, index }: { action: QuickActionItem; index: number }) {
  const Icon = action.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      <Card className="group hover:shadow-lg transition-all duration-300 border-0 shadow-sm h-full">
        <CardContent className="p-4">
          <Link href={action.href} className="block">
            <div className="flex items-center justify-between mb-3">
              <div className={`w-10 h-10 rounded-xl ${action.bgColor} flex items-center justify-center group-hover:scale-110 transition-transform duration-200`}>
                <Icon className={`h-5 w-5 ${action.color}`} />
              </div>
              {action.badge && (
                <Badge className={`text-xs ${action.badgeColor} border-0`}>
                  {action.badge}
                </Badge>
              )}
              <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600 group-hover:translate-x-1 transition-all duration-200" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-1 group-hover:text-blue-600 transition-colors">
              {action.title}
            </h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              {action.description}
            </p>
          </Link>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function LearnerQuickActions() {
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
          <h2 className="text-xl font-bold text-gray-900">Quick Actions</h2>
          <p className="text-sm text-gray-600">Access your most used features</p>
        </div>
        <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700">
          <Settings className="h-4 w-4 mr-2" />
          Customize
        </Button>
      </div>

      {/* Quick Actions Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {quickActions.map((action, index) => (
          <QuickActionCard key={action.title} action={action} index={index} />
        ))}
      </div>
    </motion.div>
  );
}