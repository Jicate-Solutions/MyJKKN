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

export function LearnerAnalyticsSection() {
  const chartData = [
    { year: '2017', value: 200 },
    { year: '2018', value: 300 },
    { year: '2019', value: 350 },
    { year: '2020', value: 600 },
    { year: '2021', value: 400 },
    { year: '2022', value: 300 }
  ];

  const maxValue = Math.max(...chartData.map((d) => d.value));

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
    >
        <Card className='border-0 shadow-sm'>
          <CardHeader className='pb-4'>
            <div className='flex items-center justify-between'>
              <CardTitle className='text-lg font-semibold text-gray-900'>
                Statistics
              </CardTitle>
              <div className='flex items-center gap-4'>
                <Select defaultValue='yearly'>
                  <SelectTrigger className='w-28 h-8 text-sm'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='yearly'>Yearly</SelectItem>
                    <SelectItem value='monthly'>Monthly</SelectItem>
                    <SelectItem value='weekly'>Weekly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className='relative h-64'>
              {/* Chart Background */}
              <div className='absolute inset-0 flex flex-col justify-between'>
                {[800, 600, 400, 200, 0].map((value) => (
                  <div key={value} className='flex items-center'>
                    <span className='text-xs text-gray-500 w-8'>{value}</span>
                    <div className='flex-1 border-t border-gray-100 ml-2' />
                  </div>
                ))}
              </div>

              {/* Chart Bars */}
              <div className='absolute inset-0 flex items-end justify-between px-10 pb-6'>
                {chartData.map((data, index) => (
                  <div
                    key={data.year}
                    className='flex flex-col items-center group'
                  >
                    {/* Bar */}
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${(data.value / maxValue) * 180}px` }}
                      transition={{ duration: 0.8, delay: index * 0.1 }}
                      className={`w-12 rounded-t-lg transition-all duration-300 hover:opacity-80 cursor-pointer ${
                        data.year === '2020'
                          ? 'bg-gradient-to-t from-purple-500 to-purple-400'
                          : 'bg-gradient-to-t from-gray-300 to-gray-200'
                      }`}
                    />
                    {/* Year Label */}
                    <span className='text-xs text-gray-600 mt-2 font-medium'>
                      {data.year}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
    </motion.div>
  );
}
