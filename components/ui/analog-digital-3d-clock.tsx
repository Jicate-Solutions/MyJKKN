'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface AnalogClock3DProps {
  embedded?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function AnalogClock3D({
  embedded = false,
  size = 'md',
  className = ''
}: AnalogClock3DProps) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const secondAngle = time.getSeconds() * 6 - 90; // 6 degrees per second
  const minuteAngle = time.getMinutes() * 6 + time.getSeconds() * 0.1 - 90;
  const hourAngle = (time.getHours() % 12) * 30 + time.getMinutes() * 0.5 - 90;

  const sizeClasses = {
    sm: 'w-24 h-24',
    md: 'w-32 h-32',
    lg: 'w-40 h-40'
  };

  const clockSize = embedded ? 'sm' : size;

  return (
    <div
      className={`flex flex-col items-center justify-center p-4 ${className}`}
    >
      <div className={`relative ${sizeClasses[clockSize]} mx-auto`}>
        {/* Clock Face */}
        <div className='w-full h-full rounded-full bg-gradient-to-br from-white to-gray-100 border-4 border-gray-300 shadow-lg relative'>
          {/* Hour markers */}
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className='absolute w-1 h-4 bg-gray-700 rounded'
              style={{
                top: '8px',
                left: '50%',
                transformOrigin: '50% 100%',
                transform: `translateX(-50%) rotate(${i * 30}deg)`
              }}
            />
          ))}

          {/* Hour hand */}
          <motion.div
            className='absolute w-1 bg-gray-800 rounded-full shadow-sm'
            style={{
              height:
                clockSize === 'sm'
                  ? '24px'
                  : clockSize === 'md'
                  ? '32px'
                  : '40px',
              top: '50%',
              left: '50%',
              transformOrigin: '50% 100%'
            }}
            animate={{
              transform: `translate(-50%, -100%) rotate(${hourAngle}deg)`
            }}
            transition={{ type: 'spring', stiffness: 100, damping: 20 }}
          />

          {/* Minute hand */}
          <motion.div
            className='absolute w-0.5 bg-gray-700 rounded-full shadow-sm'
            style={{
              height:
                clockSize === 'sm'
                  ? '32px'
                  : clockSize === 'md'
                  ? '40px'
                  : '48px',
              top: '50%',
              left: '50%',
              transformOrigin: '50% 100%'
            }}
            animate={{
              transform: `translate(-50%, -100%) rotate(${minuteAngle}deg)`
            }}
            transition={{ type: 'spring', stiffness: 100, damping: 20 }}
          />

          {/* Second hand */}
          <motion.div
            className='absolute w-0.5 bg-red-500 rounded-full shadow-sm'
            style={{
              height:
                clockSize === 'sm'
                  ? '36px'
                  : clockSize === 'md'
                  ? '44px'
                  : '52px',
              top: '50%',
              left: '50%',
              transformOrigin: '50% 100%'
            }}
            animate={{
              transform: `translate(-50%, -100%) rotate(${secondAngle}deg)`
            }}
            transition={{ type: 'spring', stiffness: 200, damping: 10 }}
          />

          {/* Center dot */}
          <div className='absolute w-3 h-3 bg-gray-800 rounded-full top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 shadow-sm' />
        </div>
      </div>

      {/* Digital time display */}
      {!embedded && (
        <motion.div
          className='mt-4 text-center'
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className='text-2xl font-mono font-bold text-gray-800'>
            {time.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            })}
          </div>
          <div className='text-sm text-gray-600 mt-1'>
            {time.toLocaleDateString([], {
              weekday: 'long',
              month: 'short',
              day: 'numeric'
            })}
          </div>
        </motion.div>
      )}
    </div>
  );
}
