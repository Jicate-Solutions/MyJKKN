'use client';

import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChevronLeft,
  ChevronRight,
  Star,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import {
  LearnerNoticesService,
  CourseProgress
} from '@/lib/services/learner/notices-service';
import { useAuth } from '@/hooks/use-auth';

export function LearnerRightSidebar() {
  const { profile } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear] = useState(new Date().getFullYear());
  const [courseProgress, setCourseProgress] = useState<CourseProgress | null>(
    null
  );
  const [loadingProgress, setLoadingProgress] = useState(true);

  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
  ];

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  const today = new Date().getDate();

  // Fetch course progress
  useEffect(() => {
    const fetchData = async () => {
      if (!profile?.id) {
        setLoadingProgress(false);
        return;
      }

      try {
        // Fetch course progress
        setLoadingProgress(true);
        const { data: progressData, error: progressError } =
          await LearnerNoticesService.getCourseProgress(profile.id);

        if (progressError) {
          console.warn('Course progress error:', progressError);
        } else {
          setCourseProgress(progressData);
        }
      } catch (err) {
        console.error('Error loading course progress:', err);
      } finally {
        setLoadingProgress(false);
      }
    };

    fetchData();
  }, [profile?.id]);

  const renderCalendarDays = () => {
    const days = [];
    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Add day headers
    daysOfWeek.forEach((day, index) => {
      days.push(
        <div
          key={`header-${index}`}
          className='text-center text-xs font-medium text-gray-500 py-2'
        >
          {day}
        </div>
      );
    });

    // Add empty cells for days before month starts
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(<div key={`empty-${i}`} className='h-8' />);
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
    <div className='space-y-4 sm:space-y-6'>
      {/* Calendar */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <Card className='border-0 shadow-sm'>
          <CardHeader className='pb-3 sm:pb-4'>
            <div className='flex items-center justify-between'>
              <CardTitle className='text-base sm:text-lg font-semibold text-gray-900'>
                {months[currentMonth]} {currentYear}
              </CardTitle>
              <div className='flex items-center gap-1'>
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={() => setCurrentMonth(Math.max(0, currentMonth - 1))}
                  className='h-6 w-6 sm:h-8 sm:w-8 p-0'
                >
                  <ChevronLeft className='h-3 w-3 sm:h-4 sm:w-4' />
                </Button>
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={() =>
                    setCurrentMonth(Math.min(11, currentMonth + 1))
                  }
                  className='h-6 w-6 sm:h-8 sm:w-8 p-0'
                >
                  <ChevronRight className='h-3 w-3 sm:h-4 sm:w-4' />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className='grid grid-cols-7 gap-1'>{renderCalendarDays()}</div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
