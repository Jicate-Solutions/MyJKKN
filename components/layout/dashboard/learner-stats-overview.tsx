'use client';

import { motion } from 'framer-motion';
import {
  Users,
  GraduationCap,
  BookOpen,
  Building
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}

function StatCard({ title, value, icon: Icon, color, bgColor }: StatCardProps) {
  return (
    <Card className="relative overflow-hidden border-0 shadow-sm hover:shadow-md transition-all duration-300 h-32">
      <CardContent className="p-4 h-full">
        <div className="flex items-center justify-between h-full">
          <div className="flex flex-col justify-center">
            <p className="text-sm font-medium text-gray-600 mb-2">{title}</p>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
          </div>
          <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0", bgColor)}>
            <Icon className={cn("h-6 w-6", color)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function LearnerStatsOverview() {
  const stats = [
    {
      title: "Total Students",
      value: "1220",
      icon: Users,
      color: "text-blue-600",
      bgColor: "bg-blue-100"
    },
    {
      title: "Total Teacher",
      value: "120",
      icon: GraduationCap,
      color: "text-pink-600",
      bgColor: "bg-pink-100"
    },
    {
      title: "Total Courses",
      value: "15",
      icon: BookOpen,
      color: "text-cyan-600",
      bgColor: "bg-cyan-100"
    },
    {
      title: "Faculty Room",
      value: "100",
      icon: Building,
      color: "text-orange-600",
      bgColor: "bg-orange-100"
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {stats.map((stat, index) => (
        <motion.div
          key={stat.title}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: index * 0.1 }}
        >
          <StatCard {...stat} />
        </motion.div>
      ))}
    </div>
  );
}