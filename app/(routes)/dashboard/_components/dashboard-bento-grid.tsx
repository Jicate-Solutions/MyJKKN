'use client';

import { motion } from 'framer-motion';
import { BentoGrid, BentoGridItem } from '@/components/ui/bento-grid';
import AIChip from '@/components/ui/ai-chip';

interface DashboardBentoGridProps {
  currentUser: string;
}

// Get greeting based on time of day
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
}

export function DashboardBentoGrid({ currentUser }: DashboardBentoGridProps) {
  // Client-side state for current date/time and greeting
  const currentDate = new Date();
  const greeting = getGreeting();

  const items = [
    {
      header: (
        <motion.div
          className='w-full h-full flex flex-col justify-center p-3 sm:p-6 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 rounded-xl relative overflow-hidden'
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          {/* Enhanced background animations - floating bubbles with parallax */}
          {Array.from({ length: 12 }).map((_, i) => (
            <motion.div
              key={i}
              className='absolute rounded-full backdrop-blur-sm'
              style={{
                width: `${Math.random() * 20 + 10}px`,
                height: `${Math.random() * 20 + 10}px`,
                top: `${Math.random() * 100}%`,
                left: `${Math.random() * 100}%`,
                background: `radial-gradient(circle, ${
                  [
                    'rgba(16, 185, 129, 0.3)',
                    'rgba(5, 150, 105, 0.3)',
                    'rgba(4, 120, 87, 0.3)',
                    'rgba(6, 95, 70, 0.3)',
                    'rgba(110, 231, 183, 0.3)'
                  ][Math.floor(Math.random() * 5)]
                }, transparent)`,
                boxShadow: '0 0 20px rgba(16, 185, 129, 0.2)'
              }}
              animate={{
                y: [0, Math.random() * -100 - 50],
                x: [0, (Math.random() - 0.5) * 100],
                opacity: [0.6, 0],
                scale: [0, 1.5, 0.5]
              }}
              transition={{
                duration: Math.random() * 10 + 10,
                repeat: Infinity,
                ease: 'easeInOut',
                repeatDelay: Math.random() * 5
              }}
            />
          ))}

          <motion.div
            className='absolute top-0 right-0 w-12 sm:w-24 lg:w-32 h-12 sm:h-24 lg:h-32 bg-green-300 dark:bg-green-400 rounded-full opacity-20 blur-3xl'
            animate={{
              scale: [1, 1.2, 1],
              x: [0, 8, 0],
              y: [0, -8, 0]
            }}
            transition={{
              duration: 6,
              repeat: Infinity,
              repeatType: 'reverse'
            }}
          />
          <motion.div
            className='absolute bottom-1 sm:bottom-6 lg:bottom-10 left-1 sm:left-6 lg:left-10 w-8 sm:w-16 lg:w-24 h-8 sm:h-16 lg:h-24 bg-emerald-400 dark:bg-emerald-500 rounded-full opacity-20 blur-3xl'
            animate={{
              scale: [1, 1.3, 1],
              x: [0, -10, 0],
              y: [0, 10, 0]
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              repeatType: 'reverse'
            }}
          />

          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
          >
            <motion.h1
              className='text-lg sm:text-2xl lg:text-3xl xl:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-green-600 to-green-500 dark:from-green-400 dark:to-green-300 mb-1 sm:mb-2 leading-tight'
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: 0.4,
                duration: 0.8,
                type: 'spring',
                stiffness: 100
              }}
            >
              {greeting}, {currentUser}!
            </motion.h1>

            {/* Animated color underline effect */}
            <motion.div
              className='h-0.5 sm:h-1 bg-gradient-to-r from-green-500 via-green-500 to-green-500 dark:from-green-400 dark:via-green-400 dark:to-green-400 rounded-full'
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: '50%', opacity: 1 }}
              transition={{ delay: 0.8, duration: 0.6 }}
            />
          </motion.div>

          <motion.p
            className='mt-2 sm:mt-3 lg:mt-4 text-xs sm:text-sm text-muted-foreground max-w-md leading-relaxed'
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9, duration: 0.5 }}
          >
            Explore the birth of groundbreaking ideas and innovations in your
            dashboard today.
          </motion.p>

          {/* Digital Clock with Glass Effect */}
          <motion.div
            className='mt-2 sm:mt-3 lg:mt-4'
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.1, duration: 0.5 }}
          >
            <div className='backdrop-blur-sm bg-white/30 dark:bg-black/20 rounded-xl px-3 sm:px-4 py-2 sm:py-3 border border-white/30 dark:border-white/20 shadow-[var(--glass-shadow-sm)]'>
              <div className='text-lg sm:text-xl lg:text-2xl font-mono font-bold text-green-700 dark:text-green-300 tabular-nums mb-1'>
                {currentDate.toLocaleTimeString('en-US', {
                  hour12: false,
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
                })}
              </div>
              <div className='text-xs sm:text-sm font-medium text-green-600 dark:text-green-400'>
                {currentDate.toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </div>
            </div>
          </motion.div>
        </motion.div>
      ),
      className: 'sm:col-span-2 lg:col-span-2',
      title: '',
      description: ''
    },
    {
      title: 'AI Intelligence',
      description: "India's first AI Empowered college management system",
      header: (
        <div className='w-full h-full flex items-center justify-center rounded-xl overflow-hidden p-2'>
          <AIChip embedded={true} />
        </div>
      ),
      className: 'sm:col-span-2 lg:col-span-1'
    }
  ];

  return (
    <BentoGrid className='max-w-7xl mx-auto px-2 sm:px-4'>
      {items.map((item, i) => (
        <BentoGridItem
          key={i}
          title={item.title}
          description={item.description}
          header={item.header}
          className={item.className}
        />
      ))}
    </BentoGrid>
  );
}
