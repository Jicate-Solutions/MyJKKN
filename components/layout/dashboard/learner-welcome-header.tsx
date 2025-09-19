'use client';

import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/use-auth';
import { Star, Sparkles, User } from 'lucide-react';
import { useState, useEffect } from 'react';
import { AuroraText } from '@/components/ui/aurora-text';
import { FlipText } from '@/components/ui/flip-text';
import { SparklesText } from '@/components/ui/sparkles-text';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import AIChip from '@/components/ui/ai-chip';

export function LearnerWelcomeHeader() {
  const { profile } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [studentPhotoUrl, setStudentPhotoUrl] = useState<string | null>(null);

  // Fetch student photo from students table
  useEffect(() => {
    const fetchStudentPhoto = async () => {
      if (!profile?.email) return;

      try {
        const supabase = createClientSupabaseClient();

        // Find the student record using email matching
        const { data: studentRecord, error: studentRecordError } =
          await supabase
            .from('students')
            .select('student_photo_url')
            .or(
              `student_email.eq.${profile.email},college_email.eq.${profile.email}`
            )
            .eq('status', 'active')
            .single();

        if (studentRecordError || !studentRecord) {
          console.log('No student record found:', studentRecordError);
          return;
        }

        console.log('Student record found:', studentRecord);
        setStudentPhotoUrl(studentRecord.student_photo_url);
      } catch (error) {
        console.error('Error fetching student photo:', error);
      }
    };

    fetchStudentPhoto();
  }, [profile?.email]);

  useEffect(() => {
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

  const getAvatarUrl = () => {
    // Debug logging
    console.log('Student photo URL from students table:', studentPhotoUrl);

    if (!studentPhotoUrl) return '';

    // If it's already a full URL, return it
    if (studentPhotoUrl.startsWith('http')) {
      return studentPhotoUrl;
    }

    // If it's a Supabase storage path, construct the full URL
    // Use student-photos bucket as seen in the services
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const fullUrl = `${supabaseUrl}/storage/v1/object/public/student-photos/${studentPhotoUrl}`;

    console.log('Constructed student photo URL:', fullUrl);
    return fullUrl;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className='relative mb-4 sm:mb-6 lg:mb-8 overflow-hidden bg-white rounded-xl sm:rounded-2xl shadow-sm border border-gray-100 mx-2 sm:mx-4 xl:mx-0'
    >
      {/* Subtle Background Pattern */}
      <div className='absolute inset-0 opacity-[0.02]'>
        <div className='h-full w-full bg-[linear-gradient(rgba(0,0,0,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.03)_1px,transparent_1px)] bg-[size:20px_20px]' />
      </div>

      {/* Content */}
      <div className='relative z-10 p-3 sm:p-4 lg:p-6 xl:p-8 bg-[#FEF3E2]'>
        <div className='max-w-6xl mx-auto'>
          <div className='grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-0 xl:gap-0 items-center'>
            {/* Left Side - Welcome Message */}
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className='order-1 xl:order-1 py-2 lg:py-4'
            >
              <div className='flex items-center gap-4 mb-5 sm:mb-4'>
                {/* Profile Avatar with Animated Background */}
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.5 }}
                  className='relative'
                >
                  {/* Animated SVG Background */}
                  <div className='absolute -inset-2 lg:-inset-3 rounded-full'>
                    <svg
                      width='64'
                      height='64'
                      viewBox='0 0 64 64'
                      className='animate-spin lg:w-20 lg:h-20'
                      style={{ animationDuration: '20s' }}
                    >
                      <defs>
                        <linearGradient
                          id='grad1'
                          x1='0%'
                          y1='0%'
                          x2='100%'
                          y2='100%'
                        >
                          <stop
                            offset='0%'
                            stopColor='#8B5CF6'
                            stopOpacity='0.3'
                          />
                          <stop
                            offset='50%'
                            stopColor='#3B82F6'
                            stopOpacity='0.2'
                          />
                          <stop
                            offset='100%'
                            stopColor='#10B981'
                            stopOpacity='0.3'
                          />
                        </linearGradient>
                        <linearGradient
                          id='grad2'
                          x1='0%'
                          y1='0%'
                          x2='100%'
                          y2='100%'
                        >
                          <stop
                            offset='0%'
                            stopColor='#F59E0B'
                            stopOpacity='0.2'
                          />
                          <stop
                            offset='50%'
                            stopColor='#EF4444'
                            stopOpacity='0.1'
                          />
                          <stop
                            offset='100%'
                            stopColor='#8B5CF6'
                            stopOpacity='0.2'
                          />
                        </linearGradient>
                      </defs>

                      {/* Outer rotating ring */}
                      <circle
                        cx='32'
                        cy='32'
                        r='28'
                        fill='none'
                        stroke='url(#grad1)'
                        strokeWidth='2'
                        strokeDasharray='6 3'
                        opacity='0.6'
                      />

                      {/* Inner rotating dots */}
                      <g>
                        <circle
                          cx='32'
                          cy='6'
                          r='1.5'
                          fill='#8B5CF6'
                          opacity='0.7'
                        >
                          <animate
                            attributeName='opacity'
                            values='0.7;1;0.7'
                            dur='2s'
                            repeatCount='indefinite'
                          />
                        </circle>
                        <circle
                          cx='52'
                          cy='20'
                          r='1'
                          fill='#3B82F6'
                          opacity='0.5'
                        >
                          <animate
                            attributeName='opacity'
                            values='0.5;0.9;0.5'
                            dur='2.5s'
                            repeatCount='indefinite'
                          />
                        </circle>
                        <circle
                          cx='58'
                          cy='32'
                          r='1'
                          fill='#10B981'
                          opacity='0.6'
                        >
                          <animate
                            attributeName='opacity'
                            values='0.6;1;0.6'
                            dur='3s'
                            repeatCount='indefinite'
                          />
                        </circle>
                        <circle
                          cx='52'
                          cy='44'
                          r='1'
                          fill='#F59E0B'
                          opacity='0.4'
                        >
                          <animate
                            attributeName='opacity'
                            values='0.4;0.8;0.4'
                            dur='2.2s'
                            repeatCount='indefinite'
                          />
                        </circle>
                        <circle
                          cx='32'
                          cy='58'
                          r='1.5'
                          fill='#EF4444'
                          opacity='0.6'
                        >
                          <animate
                            attributeName='opacity'
                            values='0.6;1;0.6'
                            dur='1.8s'
                            repeatCount='indefinite'
                          />
                        </circle>
                        <circle
                          cx='12'
                          cy='44'
                          r='1'
                          fill='#8B5CF6'
                          opacity='0.5'
                        >
                          <animate
                            attributeName='opacity'
                            values='0.5;0.9;0.5'
                            dur='2.7s'
                            repeatCount='indefinite'
                          />
                        </circle>
                        <circle
                          cx='6'
                          cy='32'
                          r='1'
                          fill='#3B82F6'
                          opacity='0.7'
                        >
                          <animate
                            attributeName='opacity'
                            values='0.7;1;0.7'
                            dur='2.3s'
                            repeatCount='indefinite'
                          />
                        </circle>
                        <circle
                          cx='12'
                          cy='20'
                          r='1'
                          fill='#10B981'
                          opacity='0.4'
                        >
                          <animate
                            attributeName='opacity'
                            values='0.4;0.8;0.4'
                            dur='2.9s'
                            repeatCount='indefinite'
                          />
                        </circle>
                      </g>
                    </svg>
                  </div>

                  {/* Counter-rotating inner ring */}
                  <div className='absolute -inset-1 lg:-inset-2 rounded-full'>
                    <svg
                      width='56'
                      height='56'
                      viewBox='0 0 56 56'
                      className='animate-spin lg:w-16 lg:h-16'
                      style={{
                        animationDuration: '15s',
                        animationDirection: 'reverse'
                      }}
                    >
                      <circle
                        cx='28'
                        cy='28'
                        r='24'
                        fill='none'
                        stroke='url(#grad2)'
                        strokeWidth='1'
                        strokeDasharray='3 1.5'
                        opacity='0.4'
                      />
                    </svg>
                  </div>

                  {/* Floating particles */}
                  <div className='absolute -inset-3 lg:-inset-4'>
                    <motion.div
                      animate={{
                        y: [-10, 10, -10],
                        x: [-5, 5, -5],
                        rotate: [0, 180, 360]
                      }}
                      transition={{
                        duration: 4,
                        repeat: Infinity,
                        ease: 'easeInOut'
                      }}
                      className='absolute top-0 left-1/2 w-1 h-1 bg-blue-400 rounded-full opacity-60'
                    />
                    <motion.div
                      animate={{
                        y: [10, -10, 10],
                        x: [5, -5, 5],
                        rotate: [360, 180, 0]
                      }}
                      transition={{
                        duration: 3.5,
                        repeat: Infinity,
                        ease: 'easeInOut'
                      }}
                      className='absolute bottom-0 right-1/4 w-1.5 h-1.5 bg-purple-400 rounded-full opacity-50'
                    />
                    <motion.div
                      animate={{
                        y: [-8, 8, -8],
                        x: [8, -8, 8],
                        scale: [0.5, 1, 0.5]
                      }}
                      transition={{
                        duration: 5,
                        repeat: Infinity,
                        ease: 'easeInOut'
                      }}
                      className='absolute top-1/4 right-0 w-1 h-1 bg-green-400 rounded-full opacity-70'
                    />
                  </div>

                  {/* Main Avatar */}
                  <Avatar className='relative z-10 w-12 h-12 sm:w-14 sm:h-14 ring-2 ring-white/50 ring-offset-2 ring-offset-transparent shadow-lg'>
                    <AvatarImage
                      src={getAvatarUrl()}
                      alt={profile?.full_name || 'Student'}
                      className='object-cover'
                    />
                    <AvatarFallback className='bg-gradient-to-br from-purple-100 to-blue-100 text-purple-700 font-semibold text-lg'>
                      {profile?.full_name ? (
                        profile.full_name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .toUpperCase()
                          .slice(0, 2)
                      ) : (
                        <User className='h-6 w-6' />
                      )}
                    </AvatarFallback>
                  </Avatar>

                  {/* Enhanced Online Indicator */}
                  <motion.div
                    animate={{
                      scale: [1, 1.2, 1],
                      boxShadow: [
                        '0 0 0 0 rgba(34, 197, 94, 0.4)',
                        '0 0 0 4px rgba(34, 197, 94, 0.1)',
                        '0 0 0 0 rgba(34, 197, 94, 0.4)'
                      ]
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className='absolute -bottom-1 -right-1 z-20 w-5 h-5 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full border-2 border-white flex items-center justify-center'
                  >
                    <motion.div
                      animate={{ scale: [0.8, 1, 0.8] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className='w-2 h-2 bg-white rounded-full shadow-sm'
                    />
                  </motion.div>
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

              <h1 className='text-[1.9rem] lg:text-4xl xl:text-[2.8rem] font-bold mb-3 sm:mb-4 leading-relaxed text-gray-900 pt-4'>
                Ready to{' '}
                <AuroraText colors={['#ffde59', '#ff9900', '#ff5733']}>
                  Learn
                </AuroraText>{' '}
                & <br />
                <AuroraText
                  colors={['#195dba', '#0b8793']}
                  className='lg:leading-snug'
                >
                  Achieve Great Things
                </AuroraText>
                ?
              </h1>

              <div className='flex sm:flex-row sm:items-center gap-2 sm:gap-4 text-gray-900'>
                <div className='flex items-center gap-2'>
                  <div className='w-6 h-6 sm:w-8 sm:h-8 bg-yellow-100 rounded-full flex items-center justify-center'>
                    <Star className='h-3 w-3 sm:h-4 sm:w-4 text-green-600' />
                  </div>
                  <span className='text-base'>{formatDate()}</span>
                </div>
                <div className='hidden sm:block w-1 h-1 bg-gray-400 rounded-full' />
                <div className='text-base font-medium'>{formatTime()}</div>
              </div>
            </motion.div>

            {/* Right Side - AI Chip */}
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className='order-2 xl:order-2 mt-4'
            >
              <div className='max-w-sm xl:max-w-none mx-auto'>
                <AIChip />
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
