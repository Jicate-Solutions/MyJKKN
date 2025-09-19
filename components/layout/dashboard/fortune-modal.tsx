'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sparkles, Star, Heart, Zap, Sun, Moon, Rainbow, Gift, X } from 'lucide-react';
import { useState, useEffect } from 'react';

interface FortuneModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const fortuneWords = [
  {
    word: "COURAGE",
    meaning: "Bravery in the face of challenges",
    color: "from-red-500 to-orange-500",
    icon: Zap,
    message: "Today, embrace your inner strength and face every challenge with unwavering courage. You have the power to overcome anything!"
  },
  {
    word: "WISDOM",
    meaning: "Knowledge gained through experience",
    color: "from-purple-500 to-blue-500",
    icon: Star,
    message: "Let wisdom guide your decisions today. Every experience teaches you something valuable for your journey ahead."
  },
  {
    word: "GRATITUDE",
    meaning: "Appreciation for life's blessings",
    color: "from-green-500 to-teal-500",
    icon: Heart,
    message: "Count your blessings today! Gratitude transforms ordinary moments into extraordinary memories."
  },
  {
    word: "CONFIDENCE",
    meaning: "Belief in your abilities",
    color: "from-yellow-500 to-orange-500",
    icon: Sun,
    message: "Believe in yourself today! Your confidence is the key that unlocks doors to endless possibilities."
  },
  {
    word: "PERSEVERANCE",
    meaning: "Persistence through difficulties",
    color: "from-indigo-500 to-purple-500",
    icon: Rainbow,
    message: "Keep pushing forward! Every step you take, no matter how small, brings you closer to your dreams."
  },
  {
    word: "COMPASSION",
    meaning: "Kindness and understanding",
    color: "from-pink-500 to-rose-500",
    icon: Heart,
    message: "Spread kindness wherever you go today. Your compassion has the power to brighten someone's entire day."
  },
  {
    word: "FOCUS",
    meaning: "Concentrated attention and effort",
    color: "from-blue-500 to-cyan-500",
    icon: Zap,
    message: "Channel your energy into what matters most today. With focus, you can achieve the extraordinary."
  },
  {
    word: "JOY",
    meaning: "Pure happiness and delight",
    color: "from-yellow-400 to-pink-400",
    icon: Sun,
    message: "Let joy fill your heart today! Happiness is not a destination, but a way of traveling through life."
  }
];

export function FortuneModal({ isOpen, onClose }: FortuneModalProps) {
  const [currentFortune, setCurrentFortune] = useState(fortuneWords[0]);
  const [isRevealing, setIsRevealing] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Get daily fortune based on date
      const today = new Date();
      const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
      const fortuneIndex = dayOfYear % fortuneWords.length;
      setCurrentFortune(fortuneWords[fortuneIndex]);

      // Start revelation animation
      setTimeout(() => {
        setIsRevealing(true);
        setTimeout(() => {
          setIsRevealed(true);
        }, 1500);
      }, 500);
    } else {
      setIsRevealing(false);
      setIsRevealed(false);
    }
  }, [isOpen]);

  const FortuneIcon = currentFortune.icon;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md border-0 bg-transparent shadow-none p-0">
        <DialogTitle className="sr-only">Daily Fortune</DialogTitle>
        <DialogDescription className="sr-only">
          Your motivational word of the day with positive energy
        </DialogDescription>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ scale: 0, opacity: 0, rotate: -180 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0, opacity: 0, rotate: 180 }}
              transition={{
                type: "spring",
                damping: 15,
                stiffness: 300,
                duration: 0.8
              }}
              className="relative"
            >
              {/* Background with Gradient */}
              <div className={`absolute inset-0 bg-gradient-to-br ${currentFortune.color} rounded-2xl opacity-90`} />

              {/* Animated Background Elements */}
              <div className="absolute inset-0 overflow-hidden rounded-2xl">
                {[...Array(12)].map((_, i) => (
                  <motion.div
                    key={i}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{
                      scale: [0, 1, 0],
                      opacity: [0, 0.6, 0],
                      x: [0, Math.random() * 200 - 100, 0],
                      y: [0, Math.random() * 200 - 100, 0]
                    }}
                    transition={{
                      duration: 3,
                      repeat: Infinity,
                      delay: i * 0.2,
                      ease: "easeInOut"
                    }}
                    className="absolute w-4 h-4 bg-white/30 rounded-full"
                    style={{
                      left: `${Math.random() * 100}%`,
                      top: `${Math.random() * 100}%`
                    }}
                  />
                ))}
              </div>

              {/* Content */}
              <div className="relative z-10 p-8 text-white text-center">
                {/* Close Button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  className="absolute top-4 right-4 text-white hover:bg-white/20 z-20"
                >
                  <X className="h-4 w-4" />
                </Button>

                {/* Fortune Revelation */}
                <div className="space-y-6">
                  {/* Icon Animation */}
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={isRevealing ? {
                      scale: [0, 1.3, 1],
                      rotate: [0, 360, 0]
                    } : { scale: 0 }}
                    transition={{ duration: 1, ease: "easeInOut" }}
                    className="mx-auto w-20 h-20 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center"
                  >
                    <FortuneIcon className="h-10 w-10 text-white" />
                  </motion.div>

                  {/* Fortune Word */}
                  <motion.div
                    initial={{ opacity: 0, y: 50 }}
                    animate={isRevealing ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
                    transition={{ duration: 0.8, delay: 0.5 }}
                  >
                    <h2 className="text-4xl font-bold mb-2 tracking-wider">
                      {currentFortune.word.split('').map((letter, index) => (
                        <motion.span
                          key={index}
                          initial={{ opacity: 0, y: 20 }}
                          animate={isRevealing ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                          transition={{ duration: 0.3, delay: 0.7 + index * 0.1 }}
                          className="inline-block"
                        >
                          {letter}
                        </motion.span>
                      ))}
                    </h2>
                    <p className="text-white/80 text-sm italic mb-4">
                      {currentFortune.meaning}
                    </p>
                  </motion.div>

                  {/* Sparkles Animation */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={isRevealed ? { opacity: 1 } : { opacity: 0 }}
                    className="flex justify-center items-center gap-2 mb-6"
                  >
                    {[...Array(7)].map((_, i) => (
                      <motion.div
                        key={i}
                        animate={{
                          scale: [0, 1, 0],
                          rotate: [0, 180, 360],
                          opacity: [0, 1, 0]
                        }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          delay: i * 0.1,
                          ease: "easeInOut"
                        }}
                      >
                        <Sparkles className="h-4 w-4 text-yellow-300" />
                      </motion.div>
                    ))}
                  </motion.div>

                  {/* Fortune Message */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={isRevealed ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.6, delay: 1.5 }}
                    className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20"
                  >
                    <p className="text-white leading-relaxed text-lg">
                      {currentFortune.message}
                    </p>
                  </motion.div>

                  {/* Action Button */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={isRevealed ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                    transition={{ duration: 0.5, delay: 2 }}
                  >
                    <Button
                      onClick={onClose}
                      className="bg-white/20 hover:bg-white/30 text-white border border-white/30 backdrop-blur-sm px-8 py-2"
                    >
                      <Gift className="h-4 w-4 mr-2" />
                      Embrace the Day
                    </Button>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}