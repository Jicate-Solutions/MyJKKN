'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BentoGrid, BentoGridItem } from '@/components/ui/bento-grid';
import AIChip from '@/components/ui/ai-chip';

interface DashboardBentoGridProps {
  currentUser: string;
}

// Deterministic pseudo-random using seed — same output on server & client
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

// Get greeting based on time of day
function getGreeting(hour: number): string {
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
}

// Pre-compute bubble styles so they're stable across renders
const BUBBLE_COLORS = [
  'rgba(16, 185, 129, 0.3)',
  'rgba(5, 150, 105, 0.3)',
  'rgba(4, 120, 87, 0.3)',
  'rgba(6, 95, 70, 0.3)',
  'rgba(110, 231, 183, 0.3)'
];

const BUBBLES = Array.from({ length: 12 }).map((_, i) => ({
  width: seededRandom(i * 4) * 20 + 10,
  height: seededRandom(i * 4 + 1) * 20 + 10,
  top: seededRandom(i * 4 + 2) * 100,
  left: seededRandom(i * 4 + 3) * 100,
  color: BUBBLE_COLORS[Math.floor(seededRandom(i * 4 + 4) * 5)],
  animY: seededRandom(i * 4 + 5) * -100 - 50,
  animX: (seededRandom(i * 4 + 6) - 0.5) * 100,
  duration: seededRandom(i * 4 + 7) * 10 + 10,
  repeatDelay: seededRandom(i * 4 + 8) * 5
}));

export function DashboardBentoGrid({ currentUser }: DashboardBentoGridProps) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const greeting = getGreeting(now?.getHours() ?? 12);

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
          {BUBBLES.map((b, i) => (
            <motion.div
              key={i}
              className='absolute rounded-full backdrop-blur-sm'
              style={{
                width: `${b.width}px`,
                height: `${b.height}px`,
                top: `${b.top}%`,
                left: `${b.left}%`,
                background: `radial-gradient(circle, ${b.color}, transparent)`,
                boxShadow: '0 0 20px rgba(16, 185, 129, 0.2)'
              }}
              animate={{
                y: [0, b.animY],
                x: [0, b.animX],
                opacity: [0.6, 0],
                scale: [0, 1.5, 0.5]
              }}
              transition={{
                duration: b.duration,
                repeat: Infinity,
                ease: 'easeInOut',
                repeatDelay: b.repeatDelay
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
                {now
                  ? now.toLocaleTimeString('en-US', {
                      hour12: true,
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit'
                    })
                  : '\u00A0'}
              </div>
              <div className='text-xs sm:text-sm font-medium text-green-600 dark:text-green-400'>
                {now
                  ? now.toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })
                  : '\u00A0'}
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
