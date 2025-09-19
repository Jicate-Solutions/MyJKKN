'use client';

import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/use-auth';
import { Star, Sparkles, Heart } from 'lucide-react';
import { useState, useEffect } from 'react';
import { AuroraText } from '@/components/ui/aurora-text';
import { FlipText } from '@/components/ui/flip-text';
import { SparklesText } from '@/components/ui/sparkles-text';

const motivationalQuotes = [
  {
    text: 'The future belongs to those who believe in the beauty of their dreams.',
    author: 'Eleanor Roosevelt'
  },
  {
    text: 'Success is not final, failure is not fatal: it is the courage to continue that counts.',
    author: 'Winston Churchill'
  },
  {
    text: 'The only way to do great work is to love what you do.',
    author: 'Steve Jobs'
  },
  {
    text: "Believe you can and you're halfway there.",
    author: 'Theodore Roosevelt'
  },
  {
    text: 'Your education is a gift that no one can take away from you.',
    author: 'B.B. King'
  },
  {
    text: 'The expert in anything was once a beginner.',
    author: 'Helen Hayes'
  },
  {
    text: 'Education is the most powerful weapon which you can use to change the world.',
    author: 'Nelson Mandela'
  },
  {
    text: "Don't let what you cannot do interfere with what you can do.",
    author: 'John Wooden'
  }
];

export function LearnerWelcomeHeader() {
  const { profile } = useAuth();
  const [currentQuote, setCurrentQuote] = useState(motivationalQuotes[0]);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    // Get daily quote based on date
    const today = new Date();
    const dayOfYear = Math.floor(
      (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) /
        (1000 * 60 * 60 * 24)
    );
    const quoteIndex = dayOfYear % motivationalQuotes.length;
    setCurrentQuote(motivationalQuotes[quoteIndex]);

    // Update time every minute
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const formatTime = () => {
    return currentTime.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDate = () => {
    return currentTime.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getStudentName = () => {
    return profile?.full_name || 'Student';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className='relative mb-4 sm:mb-6 lg:mb-8 overflow-hidden bg-white rounded-xl sm:rounded-2xl shadow-sm border border-gray-100 mx-2 sm:mx-4 lg:mx-0'
    >
      {/* Subtle Background Pattern */}
      <div className='absolute inset-0 opacity-[0.02]'>
        <div className='h-full w-full bg-[linear-gradient(rgba(0,0,0,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.03)_1px,transparent_1px)] bg-[size:20px_20px]' />
      </div>

      {/* Content */}
      <div className='relative z-10 p-4 sm:p-6 lg:p-8'>
        <div className='max-w-6xl mx-auto'>
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8 items-center'>
            {/* Left Side - Welcome Message */}
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className='order-1 lg:order-1 py-4'
            >
              <div className='flex items-center gap-4 mb-5 sm:mb-4'>
                <motion.div
                  animate={{ rotate: [0, 15, -15, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className='w-8 h-8 sm:w-10 sm:h-10 bg-blue-100 rounded-full flex items-center justify-center'
                >
                  <Sparkles className='h-4 w-4 sm:h-5 sm:w-5 text-blue-600' />
                </motion.div>
                <div className='text-sm sm:text-base lg:text-lg font-medium text-gray-700'>
                  <div className='flex items-start flex-col sm:flex-row sm:items-center gap-0 lg:gap-2'>
                    <FlipText
                      className='text-lg
                       lg:text-xl font-medium text-gray-700'
                      delayMultiple={0.05}
                    >
                      {getGreeting()},
                    </FlipText>
                    <FlipText
                      className='text-sm sm:text-base lg:text-lg font-bold text-gray-800'
                      delayMultiple={0.1}
                    >
                      {getStudentName()} !
                    </FlipText>
                  </div>
                </div>
              </div>

              <h1 className='text-3xl sm:text-3xl lg:text-4xl xl:text-5xl font-bold mb-3 sm:mb-4 leading-snug lg:leading-loose text-gray-900'>
                Ready to{' '}
                <AuroraText colors={['#3B82F6', '#1D4ED8', '#2563EB']}>
                  Learn
                </AuroraText>{' '}
                & <br />
                <AuroraText
                  colors={['#10B981', '#059669', '#047857']}
                  className='lg:leading-snug'
                >
                  Achieve Great Things
                </AuroraText>
                ?
              </h1>

              <div className='flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-gray-600'>
                <div className='flex items-center gap-2'>
                  <div className='w-6 h-6 sm:w-8 sm:h-8 bg-green-100 rounded-full flex items-center justify-center'>
                    <Star className='h-3 w-3 sm:h-4 sm:w-4 text-green-600' />
                  </div>
                  <span className='text-base'>{formatDate()}</span>
                </div>
                <div className='hidden sm:block w-1 h-1 bg-gray-400 rounded-full' />
                <div className='text-base font-medium'>{formatTime()}</div>
              </div>
            </motion.div>

            {/* Right Side - Daily Quote */}
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className='order-2 lg:order-2 bg-gray-50 rounded-xl sm:rounded-2xl p-4 sm:p-5 lg:p-6 border border-gray-200'
            >
              <div className='flex items-center gap-2 mb-3 sm:mb-4'>
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className='w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 bg-pink-100 rounded-full flex items-center justify-center'
                >
                  <Heart className='h-3 w-3 sm:h-3.5 sm:w-3.5 lg:h-4 lg:w-4 text-pink-600' />
                </motion.div>
                <span className='text-gray-800 font-semibold text-sm sm:text-base'>
                  Daily Inspiration
                </span>
              </div>

              <blockquote className='text-gray-700 text-sm sm:text-base lg:text-lg italic leading-relaxed mb-3 sm:mb-4'>
                &ldquo;{currentQuote.text}&rdquo;
              </blockquote>

              <div className='flex items-center justify-between'>
                <cite className='text-gray-600 text-xs sm:text-sm not-italic'>
                  — {currentQuote.author}
                </cite>
                <div className='flex gap-1'>
                  {[...Array(3)].map((_, i) => (
                    <motion.div
                      key={i}
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        delay: i * 0.2,
                        ease: 'easeInOut'
                      }}
                      className='w-1.5 h-1.5 sm:w-2 sm:h-2 bg-blue-400 rounded-full'
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
