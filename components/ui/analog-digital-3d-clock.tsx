import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion'; // Using framer-motion for animations

interface AnalogClock3DProps {
  className?: string;
  embedded?: boolean;
  // Add other props if needed, like timezone, showDate, etc.
}

const AnalogClock3D: React.FC<AnalogClock3DProps> = ({
  className,
  embedded = false
}) => {
  const [time, setTime] = useState(new Date());
  const [mounted, setMounted] = useState(false);
  const [prevSecond, setPrevSecond] = useState(-1);

  useEffect(() => {
    setMounted(true);
    const timer = setInterval(() => {
      const newTime = new Date();
      setPrevSecond(time.getSeconds());
      setTime(newTime);
    }, 1000);

    return () => clearInterval(timer);
  }, [time]);

  // Calculate angles for clock hands
  const seconds = time.getSeconds();
  const minutes = time.getMinutes();
  const hours = time.getHours() % 12;

  const secondAngle = seconds * 6; // 6 degrees per second
  const minuteAngle = minutes * 6 + seconds * 0.1; // 6 degrees per minute + smooth movement
  const hourAngle = hours * 30 + minutes * 0.5; // 30 degrees per hour + smooth movement

  // Format date
  const formatDate = (date: Date) => {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec'
    ];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return {
      month: months[date.getMonth()],
      day: date.getDate(),
      weekday: days[date.getDay()],
      year: date.getFullYear()
    };
  };

  // Get formatted date
  const dateInfo = formatDate(time);

  // Generate hour marks with correct number positioning
  const hourMarks = Array.from({ length: 12 }, (_, i) => {
    // Calculate angle (starting from 12 o'clock position and going clockwise)
    // For hour marks, 12 o'clock is 0/360 degrees, 3 o'clock is 90 degrees, etc.
    const hourNumber = i + 1;
    const angle = hourNumber * 30; // 30 degrees per hour mark
    const isMainHour = hourNumber % 3 === 0;

    // Calculate positions for hour marks
    const markLength = isMainHour ? 8 : 5;
    const innerRadius = isMainHour ? 38 : 40;

    const x1 = 50 + innerRadius * Math.cos(((angle - 90) * Math.PI) / 180);
    const y1 = 50 + innerRadius * Math.sin(((angle - 90) * Math.PI) / 180);
    const x2 =
      50 +
      (innerRadius + markLength) * Math.cos(((angle - 90) * Math.PI) / 180);
    const y2 =
      50 +
      (innerRadius + markLength) * Math.sin(((angle - 90) * Math.PI) / 180);

    // Calculate position for hour numbers
    // -90 degree offset to make 12 at the top
    const numberRadius = 30;
    const numX = 50 + numberRadius * Math.cos(((angle - 90) * Math.PI) / 180);
    const numY = 50 + numberRadius * Math.sin(((angle - 90) * Math.PI) / 180);

    return {
      x1,
      y1,
      x2,
      y2,
      number: hourNumber,
      numX,
      numY,
      isMainHour
    };
  });

  // Generate minute marks
  const minuteMarks = Array.from({ length: 60 }, (_, i) => {
    if (i % 5 === 0) return null; // Skip positions where hour marks are

    const angle = i * 6;
    const x1 = 50 + 42 * Math.cos(((angle - 90) * Math.PI) / 180);
    const y1 = 50 + 42 * Math.sin(((angle - 90) * Math.PI) / 180);
    const x2 = 50 + 45 * Math.cos(((angle - 90) * Math.PI) / 180);
    const y2 = 50 + 45 * Math.sin(((angle - 90) * Math.PI) / 180);

    return { x1, y1, x2, y2 };
  }).filter(Boolean);

  // Animation for digit changes
  const DigitTransition = ({
    digit,
    className
  }: {
    digit: string;
    className?: string;
  }) => (
    <div className='relative inline-block overflow-hidden'>
      <AnimatePresence mode='popLayout'>
        <motion.span
          key={digit}
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 20, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className={cn('block', className)}
        >
          {digit}
        </motion.span>
      </AnimatePresence>
    </div>
  );

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center',
        embedded ? 'w-full h-full' : 'min-h-screen p-4',
        className
      )}
    >
      {/* Clock Container */}
      <div
        className={cn(
          'relative',
          embedded ? 'w-[180px] h-[180px]' : 'w-[400px] h-[400px]'
        )}
      >
        {!embedded && (
          <>
            {/* Enhanced 3D Shadow Layers for non-embedded view */}
            <div className='absolute inset-0 rounded-full bg-gray-300/40 blur-2xl transform translate-y-6'></div>
            <div className='absolute inset-0 rounded-full bg-gray-400/30 blur-xl transform translate-y-3'></div>
          </>
        )}

        {/* Main Clock Face with enhanced 3D effect */}
        <div
          className={cn(
            'relative w-full h-full rounded-full bg-gradient-to-br from-gray-50 to-white',
            embedded ? 'shadow-md' : 'shadow-2xl'
          )}
          style={{
            boxShadow: embedded
              ? '0 0 0 1px rgba(0, 0, 0, 0.05), 0 3px 10px rgba(0, 0, 0, 0.1)'
              : `
                 0 0 0 1px rgba(0, 0, 0, 0.05),
                 0 10px 15px -3px rgba(0, 0, 0, 0.1),
                 0 20px 30px -6px rgba(0, 0, 0, 0.15),
                 0 30px 45px -10px rgba(0, 0, 0, 0.1),
                 inset 0 -2px 6px rgba(0, 0, 0, 0.06),
                 inset 0 2px 6px rgba(255, 255, 255, 0.9)
               `
          }}
        >
          {/* Clock face texture and rim */}
          <div
            className='absolute inset-1 rounded-full bg-gradient-to-br from-gray-50 via-white to-gray-100'
            style={{
              boxShadow: 'inset 0 2px 10px rgba(0, 0, 0, 0.08)',
              backgroundImage: embedded
                ? ''
                : 'radial-gradient(circle at center, transparent 0%, transparent 85%, rgba(0,0,0,0.03) 85%, rgba(0,0,0,0.05) 100%)'
            }}
          ></div>

          {/* Subtle texture overlay */}
          <div
            className='absolute inset-4 rounded-full opacity-10'
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23noiseFilter)'/%3E%3C/svg%3E\")"
            }}
          ></div>

          {/* Clock SVG */}
          <svg className='absolute inset-0 w-full h-full' viewBox='0 0 100 100'>
            {/* Minute marks */}
            {minuteMarks.map(
              (mark, i) =>
                mark && (
                  <line
                    key={`min-${i}`}
                    x1={mark.x1}
                    y1={mark.y1}
                    x2={mark.x2}
                    y2={mark.y2}
                    stroke='#9CA3AF'
                    strokeWidth='0.3'
                    opacity='0.6'
                  />
                )
            )}

            {/* Hour marks and numbers */}
            {hourMarks.map((mark, i) => (
              <g key={`hour-${i}`}>
                {/* Hour mark line */}
                <line
                  x1={mark.x1}
                  y1={mark.y1}
                  x2={mark.x2}
                  y2={mark.y2}
                  stroke={mark.isMainHour ? '#1F2937' : '#4B5563'}
                  strokeWidth={mark.isMainHour ? '1.2' : '0.8'}
                  strokeLinecap='round'
                />

                {/* Hour number */}
                <text
                  x={mark.numX}
                  y={mark.numY}
                  textAnchor='middle'
                  dominantBaseline='central'
                  className='font-medium'
                  style={{
                    fontSize: embedded ? '5px' : '4.5px',
                    fill: mark.isMainHour ? '#111827' : '#374151',
                    fontWeight: mark.isMainHour ? 600 : 500
                  }}
                >
                  {mark.number}
                </text>
              </g>
            ))}

            {/* Brand name or logo (subtle) */}
            {!embedded && (
              <text
                x='50'
                y='30'
                textAnchor='middle'
                className='font-serif italic'
                style={{ fontSize: '3px', fill: '#6B7280', opacity: 0.7 }}
              >
                MyJKKN
              </text>
            )}

            {/* Clock hands with animations */}
            {mounted && (
              <>
                {/* Hour Hand */}
                <motion.line
                  x1='50'
                  y1='50'
                  x2='50'
                  y2='30'
                  stroke='#1F2937'
                  strokeWidth='2.2'
                  strokeLinecap='round'
                  style={{
                    filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2))'
                  }}
                  initial={{ rotate: 0, originX: '50px', originY: '50px' }}
                  animate={{
                    rotate: hourAngle,
                    originX: '50px',
                    originY: '50px'
                  }}
                  transition={{
                    type: 'spring',
                    stiffness: 50,
                    damping: 15
                  }}
                />

                {/* Minute Hand */}
                <motion.line
                  x1='50'
                  y1='50'
                  x2='50'
                  y2='20'
                  stroke='#374151'
                  strokeWidth='1.6'
                  strokeLinecap='round'
                  style={{
                    filter: 'drop-shadow(0 1px 1px rgba(0, 0, 0, 0.15))'
                  }}
                  initial={{ rotate: 0, originX: '50px', originY: '50px' }}
                  animate={{
                    rotate: minuteAngle,
                    originX: '50px',
                    originY: '50px'
                  }}
                  transition={{
                    type: 'spring',
                    stiffness: 70,
                    damping: 15
                  }}
                />

                {/* Second Hand with smoother transition */}
                <motion.g
                  initial={{ rotate: 0, originX: '50px', originY: '50px' }}
                  animate={{
                    rotate: secondAngle,
                    originX: '50px',
                    originY: '50px'
                  }}
                  transition={{
                    type: 'tween',
                    duration: 0.4,
                    ease: [0.175, 0.885, 0.32, 1.275] // Custom ease for smooth motion without oscillation
                  }}
                >
                  <line
                    x1='50'
                    y1='50'
                    x2='50'
                    y2='15'
                    stroke='#EF4444'
                    strokeWidth='0.8'
                    strokeLinecap='round'
                  />
                  {/* Second hand counterweight */}
                  <circle cx='50' cy='55' r='1.2' fill='#EF4444' />
                </motion.g>
              </>
            )}

            {/* Center Overlay */}
            <circle
              cx='50'
              cy='50'
              r='2.5'
              fill='url(#centerGradient)'
              style={{
                filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.15))'
              }}
            />

            {/* Center dot */}
            <circle cx='50' cy='50' r='0.8' fill='#111827' />

            {/* Gradients */}
            <defs>
              <radialGradient id='centerGradient'>
                <stop offset='0%' stopColor='#D1D5DB' />
                <stop offset='90%' stopColor='#9CA3AF' />
                <stop offset='100%' stopColor='#6B7280' />
              </radialGradient>
            </defs>
          </svg>

          {/* Date Display */}
          {!embedded && (
            <div className='absolute inset-0 flex items-center justify-center'>
              <motion.div
                className='bg-white/80 backdrop-blur-sm px-4 py-1.5 rounded-md shadow-md mt-16 text-sm'
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                style={{
                  borderLeft: '3px solid #4F46E5'
                }}
              >
                <div className='text-gray-800 font-medium flex items-center gap-1'>
                  <span className='text-indigo-600 font-semibold'>
                    {dateInfo.weekday}
                  </span>
                  <span>
                    {dateInfo.month} {dateInfo.day}
                  </span>
                </div>
              </motion.div>
            </div>
          )}
        </div>
      </div>

      {/* Time Counter - Conditionally render or style differently for embedded */}
      {!embedded ? (
        <motion.div
          className='bg-gradient-to-r from-indigo-50 to-blue-50 backdrop-blur-sm rounded-2xl shadow-xl w-full p-6 mt-8 max-w-md border border-indigo-100'
          style={{
            boxShadow:
              '0 10px 30px rgba(79, 70, 229, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.9)'
          }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className='text-center'>
            <div className='text-indigo-600 text-sm font-semibold mb-2 uppercase tracking-wider'>
              Current Time
            </div>
            <div className='font-bold text-gray-800 tabular-nums text-4xl flex justify-center gap-1'>
              {time
                .toLocaleTimeString('en-US', {
                  hour12: true,
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
                })
                .split('')
                .map((char, index) => (
                  <DigitTransition
                    key={index}
                    digit={char}
                    className={
                      char === ':' ? 'text-indigo-400 animate-pulse' : ''
                    }
                  />
                ))}
            </div>

            <div className='mt-3 flex justify-center'>
              <div className='bg-white/70 px-3 py-1 rounded-full text-xs font-medium text-indigo-700 flex items-center gap-1.5'>
                <span className='w-2 h-2 rounded-full bg-indigo-500 animate-pulse'></span>
                <span>
                  {dateInfo.weekday}, {dateInfo.month} {dateInfo.day},{' '}
                  {dateInfo.year}
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      ) : (
        <motion.div
          className='text-center mt-3'
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <div className='font-bold text-gray-800 tabular-nums text-xl bg-white/80 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm border border-gray-100'>
            {time.toLocaleTimeString('en-US', {
              hour12: true,
              hour: '2-digit',
              minute: '2-digit'
            })}
          </div>
          <div className='text-xs font-medium text-gray-600 mt-1'>
            {dateInfo.month} {dateInfo.day}, {dateInfo.year}
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default AnalogClock3D;
