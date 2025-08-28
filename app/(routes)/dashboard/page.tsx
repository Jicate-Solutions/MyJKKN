'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ContentLayout } from '@/components/layout/content-layout';
import { DashboardLayout } from '@/components/dashboard/dashboard-layout';
import { useDashboard } from '@/hooks/use-dashboard';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Plus,
  Settings,
  AlertCircle,
  RefreshCw,
  BarChart3,
  TrendingUp,
  Table,
  Activity,
  Sparkles
} from 'lucide-react';
import { DashboardWidgetType } from '@/types/dashboard';
import { toast } from 'react-hot-toast';
import { BentoGrid, BentoGridItem } from '@/components/ui/bento-grid';
import AnalogClock3D from '@/components/ui/analog-digital-3d-clock';
import AIChip from '@/components/ui/ai-chip';
import WeatherCard from '@/components/ui/weather-card';
import { createClientSupabaseClient } from '@/lib/supabase/client';

// Helper function to get greeting based on time of day
const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
};

// BentoGrid Demo Component
function BentoGridSecondDemo({
  currentUser,
  currentDate,
  greeting
}: {
  currentUser: string | null;
  currentDate: Date;
  greeting: string;
}) {
  return (
    <BentoGrid className='max-w-7xl mx-auto px-2 sm:px-4'>
      {items.map((item, i) => (
        <BentoGridItem
          key={i}
          title={item.title}
          description={item.description}
          header={
            typeof item.header === 'function'
              ? item.header({ currentUser, currentDate, greeting })
              : item.header
          }
          className={item.className}
        />
      ))}
    </BentoGrid>
  );
}

const items = [
  {
    header: ({
      currentUser,
      currentDate,
      greeting
    }: {
      currentUser: string | null;
      currentDate: Date;
      greeting: string;
    }) => (
      <motion.div
        className='w-full h-full flex flex-col justify-center p-3 sm:p-6 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 rounded-xl relative overflow-hidden'
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        {/* Enhanced background animations - confetti effect */}
        {Array.from({ length: 8 }).map((_, i) => (
          <motion.div
            key={i}
            className={`absolute rounded-full opacity-${
              Math.random() > 0.5 ? '30' : '20'
            } blur-sm`}
            style={{
              width: `${Math.random() * 15 + 8}px`,
              height: `${Math.random() * 15 + 8}px`,
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              backgroundColor: [
                '#10b981',
                '#059669',
                '#047857',
                '#065f46',
                '#6ee7b7'
              ][Math.floor(Math.random() * 5)]
            }}
            animate={{
              y: [0, Math.random() * -80 - 40],
              x: [0, (Math.random() - 0.5) * 80],
              opacity: [0.7, 0],
              scale: [0, 1, 0.5]
            }}
            transition={{
              duration: Math.random() * 8 + 8,
              repeat: Infinity,
              ease: 'easeInOut',
              repeatDelay: Math.random() * 4
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
            {greeting}, {currentUser || 'User'}!
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

        {/* Digital Clock replacing the button */}
        <motion.div
          className='mt-2 sm:mt-3 lg:mt-4'
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.1, duration: 0.5 }}
        >
          <div className=' rounded-lg px-3 sm:px-4 py-2 sm:py-3 flex justify-between items-center'>
            <div className='text-lg sm:text-xl lg:text-2xl font-mono font-bold text-green-700 dark:text-green-300 tabular-nums'>
              {currentDate.toLocaleTimeString('en-US', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              })}
            </div>
            <div className='text-xs sm:text-sm font-medium text-green-600 dark:text-green-400 mt-1'>
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

// Widget category icons
const getCategoryIcon = (category: string) => {
  switch (category) {
    case 'kpi':
      return <TrendingUp className='h-4 w-4' />;
    case 'chart':
      return <BarChart3 className='h-4 w-4' />;
    case 'table':
      return <Table className='h-4 w-4' />;
    case 'feed':
      return <Activity className='h-4 w-4' />;
    default:
      return <Plus className='h-4 w-4' />;
  }
};

// Widget selection dialog
function WidgetSelectionDialog({
  open,
  onOpenChange,
  widgetTypes,
  onSelectWidget
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  widgetTypes: Record<string, DashboardWidgetType[]>;
  onSelectWidget: (widgetTypeId: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-4xl max-h-[80vh] overflow-y-auto mx-4'>
        <DialogHeader>
          <DialogTitle className='text-lg sm:text-xl'>
            Add Widget to Dashboard
          </DialogTitle>
          <DialogDescription className='text-sm'>
            Choose from available widgets to add to your dashboard
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4 sm:space-y-6'>
          {Object.entries(widgetTypes).map(([category, widgets]) => (
            <div key={category}>
              <h3 className='text-base sm:text-lg font-semibold mb-2 sm:mb-3 flex items-center gap-2'>
                {getCategoryIcon(category)}
                {category.charAt(0).toUpperCase() + category.slice(1)} Widgets
              </h3>

              <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3'>
                {widgets.map((widget) => (
                  <Card
                    key={widget.id}
                    className='cursor-pointer hover:shadow-md transition-shadow'
                    onClick={() => {
                      onSelectWidget(widget.id);
                      onOpenChange(false);
                    }}
                  >
                    <CardHeader className='pb-2 p-3 sm:p-4'>
                      <CardTitle className='text-xs sm:text-sm flex items-center gap-2'>
                        {getCategoryIcon(widget.category)}
                        {widget.widget_name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className='p-3 sm:p-4 pt-0'>
                      <p className='text-xs text-muted-foreground mb-2 leading-relaxed'>
                        {widget.description}
                      </p>
                      <div className='flex flex-wrap gap-1'>
                        <Badge
                          variant='outline'
                          className='text-xs px-1.5 py-0.5'
                        >
                          {widget.data_source}
                        </Badge>
                        <Badge
                          variant='secondary'
                          className='text-xs px-1.5 py-0.5'
                        >
                          {widget.category}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function DashboardPage() {
  const {
    configurations,
    currentConfiguration,
    loading,
    error,
    switchConfiguration,
    addWidget,
    removeWidget,
    updateWidget,
    getWidgetTypesByCategory,
    refreshDashboard
  } = useDashboard();

  const [isEditing, setIsEditing] = useState(false);
  const [showWidgetDialog, setShowWidgetDialog] = useState(false);

  // User and time-related state
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [greeting, setGreeting] = useState<string>(getGreeting());

  // Fetch current user
  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const supabase = createClientSupabaseClient();
        const {
          data: { user },
          error
        } = await supabase.auth.getUser();

        if (user) {
          // Get user profile to get full name
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', user.id)
            .single();

          setCurrentUser(
            profile?.full_name || user.email?.split('@')[0] || 'User'
          );
        }
      } catch (error) {
        console.error('Error fetching user:', error);
        setCurrentUser('User');
      }
    };

    fetchCurrentUser();
  }, []);

  // Update time every second for the clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentDate(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Update greeting periodically
  useEffect(() => {
    const greetingTimer = setInterval(() => {
      setGreeting(getGreeting());
    }, 60000); // Update every minute

    return () => clearInterval(greetingTimer);
  }, []);

  // Handle widget addition
  const handleAddWidget = async (widgetTypeId: string) => {
    try {
      await addWidget(widgetTypeId);
    } catch (error) {
      console.error('Error adding widget:', error);
    }
  };

  // Handle dashboard editing
  const handleEditDashboard = () => {
    setIsEditing(true);
  };

  const handleSaveDashboard = () => {
    setIsEditing(false);
    toast.success('Dashboard changes saved');
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    refreshDashboard();
  };

  if (loading) {
    return (
      <ContentLayout title='Dashboard'>
        <DashboardSkeleton />
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title='Dashboard'>
        <div className='flex flex-col items-center justify-center min-h-[300px] sm:min-h-[400px] max-w-[600px] mx-auto p-4 sm:p-6 bg-red-50 rounded-lg border border-red-200'>
          <div className='text-red-500 mb-4'>
            <AlertCircle size={32} className='sm:w-10 sm:h-10' />
          </div>
          <h2 className='text-lg sm:text-xl font-semibold mb-2 text-center'>
            Error Loading Dashboard
          </h2>
          <p className='text-destructive text-center mb-4 sm:mb-6 text-sm sm:text-base px-2'>
            {error}
          </p>
          <Button
            onClick={refreshDashboard}
            className='flex items-center gap-2 w-full sm:w-auto'
          >
            <RefreshCw className='h-4 w-4' />
            Retry
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const widgetTypesByCategory = getWidgetTypesByCategory();

  return (
    <ContentLayout title='Dashboard'>
      <div className='space-y-3 sm:space-y-4 lg:space-y-6 px-1 sm:px-2 lg:px-4'>
        {/* Default BentoGrid Layout - Always visible */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className='w-full'
        >
          <BentoGridSecondDemo
            currentUser={currentUser}
            currentDate={currentDate}
            greeting={greeting}
          />
        </motion.div>

        {/* Dashboard Controls */}
        <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 px-2 sm:px-4'>
          <div className='flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4'>
            <h1 className='text-lg sm:text-xl lg:text-2xl font-bold'>
              Analytics & Insights
            </h1>

            {configurations.length > 1 && (
              <Select
                value={currentConfiguration?.id}
                onValueChange={switchConfiguration}
              >
                <SelectTrigger className='w-full sm:w-[200px] h-9'>
                  <SelectValue placeholder='Select dashboard' />
                </SelectTrigger>
                <SelectContent>
                  {configurations.map((config) => (
                    <SelectItem key={config.id} value={config.id}>
                      {config.configuration_name}
                      {config.is_default && (
                        <Badge variant='secondary' className='ml-2 text-xs'>
                          Default
                        </Badge>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <Button
            variant='outline'
            onClick={refreshDashboard}
            className='flex items-center gap-2 w-full sm:w-auto h-9'
          >
            <RefreshCw className='h-4 w-4' />
            <span className='hidden xs:inline'>Refresh</span>
            <span className='xs:hidden'>Refresh</span>
          </Button>
        </div>

        {/* Configurable Dashboard Widgets */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className='px-1 sm:px-2 lg:px-4'
        >
          <DashboardLayout
            configuration={currentConfiguration}
            isEditing={isEditing}
            onEdit={handleEditDashboard}
            onSave={handleSaveDashboard}
            onCancel={handleCancelEdit}
            onAddWidget={() => setShowWidgetDialog(true)}
            onRemoveWidget={removeWidget}
            onUpdateWidget={updateWidget}
          />
        </motion.div>

        {/* Widget Selection Dialog */}
        <WidgetSelectionDialog
          open={showWidgetDialog}
          onOpenChange={setShowWidgetDialog}
          widgetTypes={widgetTypesByCategory}
          onSelectWidget={handleAddWidget}
        />
      </div>
    </ContentLayout>
  );
}

// Loading skeleton for dashboard
function DashboardSkeleton() {
  return (
    <div className='space-y-3 sm:space-y-4 lg:space-y-6 px-1 sm:px-2 lg:px-4'>
      {/* BentoGrid Skeleton */}
      <div className='max-w-7xl mx-auto px-2 sm:px-4'>
        <div className='grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          <div className='sm:col-span-2 lg:col-span-2 min-h-[200px] sm:min-h-[250px] rounded-xl border bg-muted animate-pulse' />
          <div className='sm:col-span-2 lg:col-span-1 min-h-[200px] sm:min-h-[250px] rounded-xl border bg-muted animate-pulse' />
        </div>
      </div>

      {/* Controls Skeleton */}
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 px-2 sm:px-4'>
        <div className='flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4'>
          <Skeleton className='h-6 sm:h-7 lg:h-8 w-32 sm:w-48' />
          <Skeleton className='h-8 sm:h-9 w-full sm:w-[200px]' />
        </div>
        <Skeleton className='h-8 sm:h-9 w-full sm:w-24' />
      </div>

      {/* Widgets Grid Skeleton */}
      <div className='px-1 sm:px-2 lg:px-4'>
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-6'>
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className='h-[200px] sm:h-[250px] lg:h-[300px]'>
              <CardHeader className='p-3 sm:p-4 lg:p-6'>
                <Skeleton className='h-3 sm:h-4 lg:h-6 w-20 sm:w-24 lg:w-32' />
                <Skeleton className='h-2 sm:h-3 lg:h-4 w-28 sm:w-32 lg:w-48' />
              </CardHeader>
              <CardContent className='p-3 sm:p-4 lg:p-6 pt-0'>
                <Skeleton className='h-12 sm:h-16 lg:h-24 w-full mb-2 sm:mb-3 lg:mb-4' />
                <Skeleton className='h-2 sm:h-3 lg:h-4 w-12 sm:w-16 lg:w-24' />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
