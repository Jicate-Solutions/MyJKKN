'use client';

import { WidgetContainer } from './widget-container';
import { PartyPopper, Cake, Award } from 'lucide-react';
import { motion } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useCelebrationsToday } from '@/hooks/dashboard/use-celebrations';
import { Celebration } from '@/lib/services/dashboard/celebration-service';

interface CelebrationsTodayWidgetProps {
  userId: string;
  role: string;
  isVisible: boolean;
}

export function CelebrationsTodayWidget({
  userId,
  role,
  isVisible,
}: CelebrationsTodayWidgetProps) {
  const { data, isLoading, error } = useCelebrationsToday(userId, role);

  const birthdays = data?.birthdays || [];
  const workAnniversaries = data?.workAnniversaries || [];
  const totalCelebrations = birthdays.length + workAnniversaries.length;

  // Auto-hide when no celebrations or if widget is set to hidden
  if (!isVisible || (!isLoading && !error && totalCelebrations === 0)) {
    return null;
  }

  const getInitials = (name: string) => {
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: { opacity: 1, x: 0 },
  };

  return (
    <WidgetContainer
      title="Today's Celebrations"
      icon={PartyPopper}
      isLoading={isLoading}
      error={error ? error.message : null}
      doubleSpan={true}
    >
      <div className="space-y-4">
        {/* Birthdays Section */}
        {birthdays.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-pink-500 to-purple-500">
                <Cake className="h-3 w-3 sm:h-4 sm:w-4 text-white" />
              </div>
              <h4 className="text-xs sm:text-sm font-semibold text-foreground">
                Birthdays ({birthdays.length})
              </h4>
            </div>
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="space-y-2 max-h-[200px] overflow-y-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent"
            >
              {birthdays.map((person: Celebration, idx: number) => (
                <motion.div
                  key={person.id}
                  variants={itemVariants}
                  transition={{ delay: idx * 0.1 }}
                  className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-pink-50 to-purple-50 dark:from-pink-950/20 dark:to-purple-950/20 border border-pink-100 dark:border-pink-900"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8 sm:h-10 sm:w-10 border-2 border-pink-300 dark:border-pink-700">
                      <AvatarImage src={person.avatar_url} alt={person.name} />
                      <AvatarFallback className="bg-gradient-to-br from-pink-400 to-purple-400 text-white text-xs">
                        {getInitials(person.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-xs sm:text-sm font-medium text-foreground">
                        {person.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Happy Birthday! 🎂
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs h-7 px-2 sm:px-3 bg-white/50 dark:bg-black/20 hover:bg-white dark:hover:bg-black/40"
                  >
                    Send Wishes
                  </Button>
                </motion.div>
              ))}
            </motion.div>
          </div>
        )}

        {/* Work Anniversaries Section */}
        {workAnniversaries.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500">
                <Award className="h-3 w-3 sm:h-4 sm:w-4 text-white" />
              </div>
              <h4 className="text-xs sm:text-sm font-semibold text-foreground">
                Work Anniversaries ({workAnniversaries.length})
              </h4>
            </div>
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="space-y-2 max-h-[200px] overflow-y-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent"
            >
              {workAnniversaries.map((person: Celebration, idx: number) => (
                <motion.div
                  key={person.id}
                  variants={itemVariants}
                  transition={{ delay: idx * 0.1 }}
                  className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border border-amber-100 dark:border-amber-900"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8 sm:h-10 sm:w-10 border-2 border-amber-300 dark:border-amber-700">
                      <AvatarImage src={person.avatar_url} alt={person.name} />
                      <AvatarFallback className="bg-gradient-to-br from-amber-400 to-orange-400 text-white text-xs">
                        {getInitials(person.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-xs sm:text-sm font-medium text-foreground">
                        {person.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {person.years} {person.years === 1 ? 'year' : 'years'} of service 🎉
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs h-7 px-2 sm:px-3 bg-white/50 dark:bg-black/20 hover:bg-white dark:hover:bg-black/40"
                  >
                    Send Wishes
                  </Button>
                </motion.div>
              ))}
            </motion.div>
          </div>
        )}

        {/* Empty State (shown during loading or when data is being fetched) */}
        {!isLoading && !error && totalCelebrations === 0 && (
          <div className="text-center py-6">
            <PartyPopper className="h-12 w-12 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No celebrations today
            </p>
          </div>
        )}
      </div>
    </WidgetContainer>
  );
}
