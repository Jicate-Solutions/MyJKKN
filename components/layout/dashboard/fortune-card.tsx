'use client';

import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, Zap, Gift, Star, Heart, Sun } from 'lucide-react';
import { useState } from 'react';

interface FortuneCardProps {
  onOpenFortune: () => void;
}

export function FortuneCard({ onOpenFortune }: FortuneCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className='relative'
    >
      <Card
        className='relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all duration-500 cursor-pointer bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500'
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={onOpenFortune}
      >
        {/* Animated Background */}
        <div className='absolute inset-0'>
          <motion.div
            animate={{
              scale: [1, 1.2, 1],
              rotate: [0, 180, 360],
              opacity: [0.3, 0.6, 0.3]
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: 'easeInOut'
            }}
            className='absolute top-2 right-2 w-16 h-16 bg-white/20 rounded-full'
          />
          <motion.div
            animate={{
              x: [0, 50, 0],
              y: [0, -30, 0],
              rotate: [0, -180, -360]
            }}
            transition={{
              duration: 12,
              repeat: Infinity,
              ease: 'linear'
            }}
            className='absolute bottom-4 left-4 w-8 h-8 bg-white/20 rounded-full'
          />
        </div>

        <CardContent className='relative z-10 p-6'>
          <div className='text-center'>
            {/* Fortune Icon with Animation */}
            <motion.div
              animate={
                isHovered
                  ? {
                      scale: [1, 1.2, 1],
                      rotate: [0, 10, -10, 0]
                    }
                  : {
                      y: [0, -5, 0]
                    }
              }
              transition={{
                duration: isHovered ? 0.6 : 2,
                repeat: Infinity,
                ease: 'easeInOut'
              }}
              className='mx-auto mb-4 w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center'
            >
              <Gift className='h-8 w-8 text-white' />
            </motion.div>

            {/* Title */}
            <h3 className='text-xl font-bold text-white mb-2'>Daily Fortune</h3>

            {/* Description */}
            <p className='text-white/90 text-sm mb-4 leading-relaxed'>
              Discover your motivational word of the day! Click to reveal
              today&apos;s positive energy.
            </p>

            {/* Sparkles Animation */}
            <div className='flex justify-center items-center gap-2 mb-4'>
              {[...Array(5)].map((_, i) => (
                <motion.div
                  key={i}
                  animate={{
                    scale: [0, 1, 0],
                    opacity: [0, 1, 0]
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    delay: i * 0.2,
                    ease: 'easeInOut'
                  }}
                >
                  <Star className='h-3 w-3 text-yellow-300 fill-yellow-300' />
                </motion.div>
              ))}
            </div>

            {/* Action Button */}
            <Button
              variant='ghost'
              className='bg-white/20 hover:bg-white/30 text-white border border-white/30 backdrop-blur-sm transition-all duration-300'
              onClick={(e) => {
                e.stopPropagation();
                onOpenFortune();
              }}
            >
              <Sparkles className='h-4 w-4 mr-2' />
              Reveal Fortune
            </Button>
          </div>
        </CardContent>

        {/* Hover Effect Overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: isHovered ? 1 : 0 }}
          transition={{ duration: 0.3 }}
          className='absolute inset-0 bg-gradient-to-r from-yellow-400/20 via-pink-400/20 to-purple-400/20'
        />
      </Card>
    </motion.div>
  );
}
