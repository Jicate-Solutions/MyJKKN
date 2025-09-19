'use client';

import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ChevronLeft, ChevronRight, Bell, BookOpen, Calendar, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

export function LearnerRightSidebar() {
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear] = useState(new Date().getFullYear());

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  const today = new Date().getDate();

  const notices = [
    {
      title: "Notice of Special Examinations at Semester Spring 2021",
      author: "Jordan George",
      date: "19 JAN 2024",
      type: "examination",
      icon: BookOpen
    },
    {
      title: "Time Extension Notice of Semester Admission",
      author: "Rachel Valdez",
      date: "18 JAN 2024",
      type: "admission",
      icon: Calendar
    },
    {
      title: "COVID-19 Vaccination Survey October 2021",
      author: "Jacob Grant",
      date: "17 JAN 2024",
      type: "survey",
      icon: Bell
    },
    {
      title: "Scholarship Viva Notice Spring 2021",
      author: "Sarah Johnson",
      date: "16 JAN 2024",
      type: "scholarship",
      icon: Clock
    }
  ];

  const renderCalendarDays = () => {
    const days = [];
    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Add day headers
    daysOfWeek.forEach((day, index) => {
      days.push(
        <div key={`header-${index}`} className="text-center text-xs font-medium text-gray-500 py-2">
          {day}
        </div>
      );
    });

    // Add empty cells for days before month starts
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(<div key={`empty-${i}`} className="h-8" />);
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const isToday = day === today && currentMonth === new Date().getMonth();
      const isSelected = day === 11; // Highlight 11th day as shown in image

      days.push(
        <button
          key={day}
          className={`h-8 w-8 rounded-lg text-sm font-medium transition-colors ${
            isToday
              ? 'bg-blue-500 text-white'
              : isSelected
              ? 'bg-purple-500 text-white'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          {day}
        </button>
      );
    }

    return days;
  };

  return (
    <div className="space-y-6">
      {/* Course Activities */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card className='border-0 shadow-sm'>
          <CardHeader className='pb-4'>
            <CardTitle className='text-lg font-semibold text-gray-900'>
              Course Activities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='flex flex-col items-center'>
              {/* Progress Circle */}
              <div className='relative w-32 h-32 mb-6'>
                <svg
                  className='w-32 h-32 transform -rotate-90'
                  viewBox='0 0 120 120'
                >
                  {/* Background circle */}
                  <circle
                    cx='60'
                    cy='60'
                    r='50'
                    stroke='#e5e7eb'
                    strokeWidth='8'
                    fill='transparent'
                    className='opacity-30'
                  />
                  {/* Progress circle */}
                  <motion.circle
                    cx='60'
                    cy='60'
                    r='50'
                    stroke='url(#gradient)'
                    strokeWidth='8'
                    fill='transparent'
                    strokeLinecap='round'
                    initial={{ strokeDasharray: '0 314' }}
                    animate={{ strokeDasharray: '235 314' }} // 75% of 314
                    transition={{ duration: 1, delay: 0.5 }}
                  />
                  <defs>
                    <linearGradient
                      id='gradient'
                      x1='0%'
                      y1='0%'
                      x2='100%'
                      y2='100%'
                    >
                      <stop offset='0%' stopColor='#3b82f6' />
                      <stop offset='100%' stopColor='#1e40af' />
                    </linearGradient>
                  </defs>
                </svg>
                <div className='absolute inset-0 flex items-center justify-center'>
                  <div className='text-center'>
                    <div className='text-2xl font-bold text-gray-900'>75%</div>
                  </div>
                </div>
              </div>

              {/* Legend */}
              <div className='w-full space-y-3'>
                <div className='flex items-center justify-between'>
                  <div className='flex items-center gap-2'>
                    <div className='w-3 h-3 bg-blue-500 rounded-full' />
                    <span className='text-sm text-gray-600'>Process</span>
                  </div>
                  <span className='text-sm font-medium text-gray-900'>75%</span>
                </div>
                <div className='flex items-center justify-between'>
                  <div className='flex items-center gap-2'>
                    <div className='w-3 h-3 bg-gray-300 rounded-full' />
                    <span className='text-sm text-gray-600'>In process</span>
                  </div>
                  <span className='text-sm font-medium text-gray-900'>25%</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Calendar */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold text-gray-900">
                {months[currentMonth]} {currentYear}
              </CardTitle>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentMonth(Math.max(0, currentMonth - 1))}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentMonth(Math.min(11, currentMonth + 1))}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1">
              {renderCalendarDays()}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Notice Board */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold text-gray-900">Notice Board</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {notices.map((notice, index) => (
                <motion.div
                  key={notice.title}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.1 }}
                  className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <notice.icon className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-gray-900 line-clamp-2 leading-tight">
                      {notice.title}
                    </h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-gray-500">by {notice.author}</span>
                      <span className="text-xs text-gray-400">•</span>
                      <span className="text-xs text-gray-500">{notice.date}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}