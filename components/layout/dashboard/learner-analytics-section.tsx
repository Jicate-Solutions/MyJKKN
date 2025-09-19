'use client';

import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useState, useEffect } from 'react';
import {
  LearnerAnalyticsService,
  AttendanceStats
} from '@/lib/services/learner/analytics-service';
import { useAuth } from '@/hooks/use-auth';
import { Loader2, TrendingUp, TrendingDown } from 'lucide-react';

export function LearnerAnalyticsSection() {
  const { profile } = useAuth();
  const [timeframe, setTimeframe] = useState<'weekly' | 'monthly' | 'yearly'>(
    'monthly'
  );
  const [chartData, setChartData] = useState<AttendanceStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAnalytics = async () => {
      if (!profile?.id) {
        setError('User profile not found');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const { data, error: fetchError } =
          await LearnerAnalyticsService.getLearnerAnalytics(
            profile.id,
            timeframe
          );

        if (fetchError) {
          setError(fetchError);
          setChartData([]);
        } else if (data) {
          setChartData(data.attendanceData);
          setError(null);
        }
      } catch (err) {
        setError('Failed to load analytics data');
        console.error('Error loading analytics:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [profile?.id, timeframe]);

  const maxValue = Math.max(...chartData.map((d) => d.attendanceRate), 100);

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className='border-0 shadow-sm'>
        <CardHeader className='pb-4'>
          <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-4'>
            <div className='flex items-center gap-3'>
              <CardTitle className='text-base sm:text-lg font-semibold text-gray-900'>
                Attendance Analytics
              </CardTitle>
              {loading && (
                <Loader2 className='h-4 w-4 animate-spin text-blue-600' />
              )}
            </div>
            <div className='flex items-center gap-4'>
              <Select
                value={timeframe}
                onValueChange={(value: 'weekly' | 'monthly' | 'yearly') =>
                  setTimeframe(value)
                }
              >
                <SelectTrigger className='w-24 sm:w-28 h-8 text-sm'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='weekly'>Weekly</SelectItem>
                  <SelectItem value='monthly'>Monthly</SelectItem>
                  <SelectItem value='yearly'>Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className='flex items-center justify-center h-64'>
              <div className='text-center'>
                <Loader2 className='h-8 w-8 animate-spin text-blue-600 mx-auto mb-2' />
                <p className='text-sm text-gray-600'>Loading analytics...</p>
              </div>
            </div>
          ) : error ? (
            <div className='flex items-center justify-center h-64'>
              <div className='text-center'>
                <p className='text-sm text-red-600 mb-2'>
                  Failed to load analytics
                </p>
                <p className='text-xs text-gray-500'>{error}</p>
              </div>
            </div>
          ) : chartData.length === 0 ? (
            <div className='flex items-center justify-center h-64'>
              <div className='text-center'>
                <p className='text-sm text-gray-600'>No data available</p>
                <p className='text-xs text-gray-500'>
                  Start attending classes to see analytics
                </p>
              </div>
            </div>
          ) : (
            <div className='flex flex-col'>
              {/* Chart Area */}
              <div className='relative h-40 sm:h-56 mb-4'>
                {/* Chart Background */}
                <div className='absolute inset-0 flex flex-col justify-between'>
                  {[100, 80, 60, 40, 20, 0].map((value) => (
                    <div key={value} className='flex items-center'>
                      <span className='text-xs text-gray-500 w-6 sm:w-8'>{value}%</span>
                      <div className='flex-1 border-t border-gray-100 ml-2' />
                    </div>
                  ))}
                </div>

                {/* Chart Bars */}
                <div className='absolute inset-0 flex items-end justify-center gap-1 sm:gap-4 px-2 sm:px-10 pb-2'>
                {chartData.slice(0, 5).map((data, index) => { // Limit to 5 items for better mobile display
                  const height = (data.attendanceRate / 100) * 100; // Fixed height for mobile
                  const isGoodAttendance = data.attendanceRate >= 75;

                  return (
                    <div
                      key={data.period}
                      className='flex flex-col items-center group relative'
                    >
                      {/* Tooltip */}
                      <div className='absolute -top-16 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs rounded-lg px-2 sm:px-3 py-1 sm:py-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10'>
                        <div className='text-center'>
                          <div className='font-semibold'>{data.period}</div>
                          <div>Attendance: {data.attendanceRate}%</div>
                          <div className='hidden sm:block'>
                            Classes: {data.attendedClasses}/{data.totalClasses}
                          </div>
                        </div>
                        <div className='absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900'></div>
                      </div>

                      {/* Bar */}
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${height}px` }}
                        transition={{ duration: 0.8, delay: index * 0.1 }}
                        className={`w-8 sm:w-10 md:w-12 lg:w-14 rounded-t-lg transition-all duration-300 hover:scale-105 cursor-pointer relative ${
                          isGoodAttendance
                            ? 'bg-gradient-to-t from-green-500 to-green-400'
                            : data.attendanceRate >= 60
                            ? 'bg-gradient-to-t from-yellow-500 to-yellow-400'
                            : 'bg-gradient-to-t from-red-500 to-red-400'
                        }`}
                      >
                        {/* Percentage badge on hover */}
                        <div className='absolute -top-6 left-1/2 transform -translate-x-1/2 bg-white text-xs font-semibold px-1 py-0.5 rounded shadow opacity-0 group-hover:opacity-100 transition-opacity'>
                          {data.attendanceRate}%
                        </div>
                      </motion.div>

                      {/* Period Label */}
                      <span className='text-xs text-gray-600 mt-1 font-medium text-center w-8 sm:w-10 md:w-12 lg:w-14 truncate'>
                        {data.period.length > 4 ? data.period.substring(0, 3) + '.' : data.period}
                      </span>

                      {/* Trend indicator */}
                      {index > 0 && (
                        <div className='mt-1'>
                          {data.attendanceRate >
                          chartData[index - 1]?.attendanceRate ? (
                            <TrendingUp className='h-3 w-3 text-green-500' />
                          ) : data.attendanceRate <
                            chartData[index - 1]?.attendanceRate ? (
                            <TrendingDown className='h-3 w-3 text-red-500' />
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              </div>

              {/* Legend - Moved outside chart area */}
              <div className='flex justify-center items-center gap-4 text-xs pt-2 border-t border-gray-100'>
                <div className='flex items-center gap-1'>
                  <div className='w-2 h-2 bg-gradient-to-t from-green-500 to-green-400 rounded'></div>
                  <span className='text-gray-600 text-xs'>Good</span>
                </div>
                <div className='flex items-center gap-1'>
                  <div className='w-2 h-2 bg-gradient-to-t from-yellow-500 to-yellow-400 rounded'></div>
                  <span className='text-gray-600 text-xs'>Avg</span>
                </div>
                <div className='flex items-center gap-1'>
                  <div className='w-2 h-2 bg-gradient-to-t from-red-500 to-red-400 rounded'></div>
                  <span className='text-gray-600 text-xs'>Low</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
