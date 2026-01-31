'use client';

import { WidgetContainer } from './widget-container';
import { PartyPopper, Cake, Award, Building2, Briefcase, GraduationCap, Users, CalendarDays, MapPin } from 'lucide-react';
import { motion } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useCelebrationsToday } from '@/hooks/dashboard/use-celebrations';
import { Celebration } from '@/lib/services/dashboard/celebration-service';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';

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
  const [activeTab, setActiveTab] = useState<string>('birthdays');

  const birthdays = data?.birthdays || [];
  const workAnniversaries = data?.workAnniversaries || [];
  const totalCelebrations = birthdays.length + workAnniversaries.length;

  useEffect(() => {
    if (!isLoading && birthdays.length === 0 && workAnniversaries.length > 0) {
      setActiveTab('anniversaries');
    }
  }, [isLoading, birthdays.length, workAnniversaries.length]);

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
        staggerChildren: 0.05,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: { opacity: 1, x: 0 },
  };

  const TimelineItem = ({ person, type }: { person: Celebration; type: 'birthday' | 'anniversary' }) => {
    const isBirthday = type === 'birthday';
    const isLearner = person.role === 'Learner';

    return (
      <motion.div
        variants={itemVariants}
        className="relative pl-8 pb-8 last:pb-0 group"
      >
        {/* Timeline Connector */}
        <div className="absolute left-[11px] top-10 bottom-0 w-px bg-border group-last:hidden" />
        
        {/* Timeline Dot */}
        <div className={cn(
          "absolute left-0 top-3 h-6 w-6 rounded-full border-2 flex items-center justify-center z-10 bg-background transition-colors",
          isBirthday 
            ? "border-pink-300 dark:border-pink-700 group-hover:border-pink-500 dark:group-hover:border-pink-500" 
            : "border-amber-300 dark:border-amber-700 group-hover:border-amber-500 dark:group-hover:border-amber-500"
        )}>
          {isBirthday ? (
            <Cake className={cn("h-3 w-3", isBirthday ? "text-pink-500" : "text-amber-500")} />
          ) : (
            <Award className={cn("h-3 w-3", isBirthday ? "text-pink-500" : "text-amber-500")} />
          )}
        </div>

        {/* Content Card */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-xl border bg-card hover:shadow-md transition-all duration-200">
          {/* Avatar Section */}
          <div className="flex items-center gap-4 min-w-[200px]">
            <Avatar className={cn(
              "h-12 w-12 border-2",
              isBirthday ? "border-pink-100 dark:border-pink-900" : "border-amber-100 dark:border-amber-900"
            )}>
              <AvatarImage src={person.avatar_url} alt={person.name} />
              <AvatarFallback className={cn(
                "text-white font-semibold",
                isBirthday 
                  ? "bg-gradient-to-br from-pink-400 to-purple-500" 
                  : "bg-gradient-to-br from-amber-400 to-orange-500"
              )}>
                {getInitials(person.name)}
              </AvatarFallback>
            </Avatar>
            
            <div className="space-y-1">
              <h4 className="font-semibold text-sm text-foreground leading-none">
                {person.name}
              </h4>
              <Badge 
                variant="secondary" 
                className={cn(
                  "text-[10px] px-1.5 py-0 font-normal",
                  isLearner 
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300" 
                    : "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
                )}
              >
                {isLearner ? 'Learner' : 'Team Member'}
              </Badge>
            </div>
          </div>

          {/* Details Section */}
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              {isLearner ? <GraduationCap className="h-4 w-4 shrink-0" /> : <Briefcase className="h-4 w-4 shrink-0" />}
              <span className="truncate">
                {!isLearner && (person.designation || person.department_name) ? (
                   [person.designation, person.department_name].filter(Boolean).join(' • ')
                ) : isLearner && (person.program_name || person.section_name) ? (
                   [person.program_name, person.section_name].filter(Boolean).join(' • ')
                ) : 'N/A'}
              </span>
            </div>
            
            {person.institution_name && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Building2 className="h-4 w-4 shrink-0" />
                <span className="truncate">{person.institution_name}</span>
              </div>
            )}
            
            {!isBirthday && person.years && (
               <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-medium sm:col-span-2">
                 <Award className="h-4 w-4 shrink-0" />
                 <span>Celebrating {person.years} Year{person.years > 1 ? 's' : ''} of Service</span>
               </div>
            )}
          </div>

          {/* Action Section */}
          <div className="flex items-center justify-end sm:min-w-[140px]">
             <Button 
               size="sm" 
               variant={isBirthday ? "default" : "secondary"}
               className={cn(
                 "w-full sm:w-auto text-xs h-8 shadow-sm",
                 isBirthday 
                   ? "bg-pink-500 hover:bg-pink-600 text-white border-none" 
                   : "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300"
               )}
             >
               <PartyPopper className="h-3.5 w-3.5 mr-1.5" />
               {isBirthday ? 'Wish Happy Birthday' : 'Congratulate'}
             </Button>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <WidgetContainer
      title="Today's Celebrations"
      icon={PartyPopper}
      isLoading={isLoading}
      error={error ? error.message : null}
      className="col-span-1 sm:col-span-2 lg:col-span-3"
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <TabsList className="grid w-full sm:w-[400px] grid-cols-2">
            <TabsTrigger value="birthdays" className="gap-2">
              <Cake className="h-4 w-4" />
              Birthdays
              {birthdays.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1 bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300">
                  {birthdays.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="anniversaries" className="gap-2">
              <Award className="h-4 w-4" />
              Anniversaries
              {workAnniversaries.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                  {workAnniversaries.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          
          <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground px-3 py-1 bg-muted/50 rounded-md border border-border/50">
             <CalendarDays className="h-4 w-4" />
             <span>{new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
          </div>
        </div>

        <div className="min-h-[300px] max-h-[600px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
          <TabsContent value="birthdays" className="mt-0 space-y-4 focus-visible:outline-none">
            {birthdays.length > 0 ? (
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="pb-4"
              >
                {birthdays.map((person: Celebration) => (
                  <TimelineItem key={person.id} person={person} type="birthday" />
                ))}
              </motion.div>
            ) : (
              <EmptyState type="birthday" />
            )}
          </TabsContent>

          <TabsContent value="anniversaries" className="mt-0 space-y-4 focus-visible:outline-none">
            {workAnniversaries.length > 0 ? (
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="pb-4"
              >
                {workAnniversaries.map((person: Celebration) => (
                  <TimelineItem key={person.id} person={person} type="anniversary" />
                ))}
              </motion.div>
            ) : (
              <EmptyState type="anniversary" />
            )}
          </TabsContent>
        </div>
      </Tabs>
    </WidgetContainer>
  );
}

function EmptyState({ type }: { type: 'birthday' | 'anniversary' }) {
  const isBirthday = type === 'birthday';
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center bg-muted/20 rounded-xl border border-dashed border-muted">
      <div className={cn(
        "p-4 rounded-full mb-3",
        isBirthday ? "bg-pink-50 dark:bg-pink-950/20" : "bg-amber-50 dark:bg-amber-950/20"
      )}>
        {isBirthday ? (
          <Cake className={cn("h-8 w-8", isBirthday ? "text-pink-300 dark:text-pink-700" : "text-amber-300 dark:text-amber-700")} />
        ) : (
          <Award className={cn("h-8 w-8", isBirthday ? "text-pink-300 dark:text-pink-700" : "text-amber-300 dark:text-amber-700")} />
        )}
      </div>
      <h3 className="font-medium text-foreground">
        No {isBirthday ? 'birthdays' : 'work anniversaries'} today
      </h3>
      <p className="text-sm text-muted-foreground mt-1">
        Check back tomorrow for more {isBirthday ? 'celebrations' : 'milestones'}!
      </p>
    </div>
  );
}
