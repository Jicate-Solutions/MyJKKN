'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area
} from 'recharts';
import {
  MoreHorizontal,
  TrendingUp,
  TrendingDown,
  Minus,
  Settings,
  X,
  RefreshCw,
  ArrowUpRight,
  Users,
  Building,
  GraduationCap,
  Activity,
  DollarSign,
  FileText,
  BarChart3,
  Zap,
  Sparkles
} from 'lucide-react';
import {
  DashboardWidget as DashboardWidgetType,
  WidgetData
} from '@/types/dashboard';
import { DashboardService } from '@/lib/services/dashboard/dashboard-service';
import { cn } from '@/lib/utils';
import AnalogClock3D from '@/components/ui/analog-digital-3d-clock';
import AIChip from '@/components/ui/ai-chip';
import WeatherCard from '@/components/ui/weather-card';

interface DashboardWidgetProps {
  widget: DashboardWidgetType;
  onRemove?: (widgetId: string) => void;
  onConfigure?: (widget: DashboardWidgetType) => void;
  isEditing?: boolean;
  className?: string;
}

export function DashboardWidget({
  widget,
  onRemove,
  onConfigure,
  isEditing = false,
  className
}: DashboardWidgetProps) {
  const [data, setData] = useState<WidgetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch widget data
  const fetchData = async () => {
    if (!widget.widget_type) return;

    try {
      setLoading(true);
      setError(null);
      const widgetData = await DashboardService.getWidgetData(
        widget.widget_type,
        widget.widget_config
      );
      setData(widgetData);
    } catch (err) {
      console.error('Error fetching widget data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.widget_type?.id, widget.widget_config]); // fetchData would cause infinite loop

  const handleRefresh = () => {
    fetchData();
  };

  // Get category-specific styling and icon
  const getCategoryConfig = (category: string) => {
    const configs = {
      users: {
        gradient: 'from-blue-500 to-cyan-500',
        bgGradient: 'from-blue-50 to-cyan-50',
        icon: Users,
        iconColor: 'text-blue-600',
        ringColor: 'ring-blue-200'
      },
      organizations: {
        gradient: 'from-purple-500 to-pink-500',
        bgGradient: 'from-purple-50 to-pink-50',
        icon: Building,
        iconColor: 'text-purple-600',
        ringColor: 'ring-purple-200'
      },
      students: {
        gradient: 'from-green-500 to-emerald-500',
        bgGradient: 'from-green-50 to-emerald-50',
        icon: GraduationCap,
        iconColor: 'text-green-600',
        ringColor: 'ring-green-200'
      },
      billing: {
        gradient: 'from-yellow-500 to-orange-500',
        bgGradient: 'from-yellow-50 to-orange-50',
        icon: DollarSign,
        iconColor: 'text-yellow-600',
        ringColor: 'ring-yellow-200'
      },
      activity: {
        gradient: 'from-indigo-500 to-blue-500',
        bgGradient: 'from-indigo-50 to-blue-50',
        icon: Activity,
        iconColor: 'text-indigo-600',
        ringColor: 'ring-indigo-200'
      },
      applications: {
        gradient: 'from-teal-500 to-cyan-500',
        bgGradient: 'from-teal-50 to-cyan-50',
        icon: FileText,
        iconColor: 'text-teal-600',
        ringColor: 'ring-teal-200'
      },
      system: {
        gradient: 'from-slate-500 to-gray-500',
        bgGradient: 'from-slate-50 to-gray-50',
        icon: Zap,
        iconColor: 'text-slate-600',
        ringColor: 'ring-slate-200'
      },
      default: {
        gradient: 'from-gray-500 to-slate-500',
        bgGradient:
          'from-gray-50 to-slate-50 dark:from-gray-900 dark:to-slate-900',
        icon: BarChart3,
        iconColor: 'text-muted-foreground',
        ringColor: 'ring-gray-200 dark:ring-gray-700'
      }
    };
    return configs[category as keyof typeof configs] || configs.default;
  };

  const categoryConfig = getCategoryConfig(
    widget.widget_type?.category || 'default'
  );
  const IconComponent = categoryConfig.icon;

  const renderWidget = () => {
    if (loading) {
      return (
        <div className='space-y-4 animate-pulse'>
          <div className='flex items-center gap-3'>
            <div className='h-8 bg-muted rounded-lg w-20'></div>
            <div className='h-4 bg-muted rounded w-32'></div>
          </div>
          <div className='h-6 bg-muted rounded-full w-16'></div>
          <div className='space-y-2'>
            <div className='h-16 bg-muted rounded-lg'></div>
          </div>
        </div>
      );
    }

    if (error || !data || !widget.widget_type) {
      return (
        <div className='flex flex-col items-center justify-center h-40 text-center p-4'>
          <h4 className='font-medium text-foreground mb-1'>
            {widget.widget_type?.widget_name || 'Error loading data'}
          </h4>
          <p className='text-sm text-muted-foreground mb-4'>
            {widget.widget_type?.description ||
              'Please try refreshing the widget'}
          </p>
          <Button
            size='sm'
            variant='outline'
            onClick={handleRefresh}
            className='bg-background border-border hover:bg-muted'
          >
            <RefreshCw className='h-3 w-3 mr-1' />
            Retry
          </Button>
        </div>
      );
    }

    return (
      <div className='space-y-4'>
        <div className='flex items-start justify-between'>
          <div className='flex-1'>
            <div className='flex items-center gap-3 mb-3'>
              <div
                className={`p-2 rounded-lg bg-gradient-to-r ${categoryConfig.gradient} text-white shadow-lg`}
              >
                <IconComponent className='h-5 w-5' />
              </div>
              <div>
                <div className='text-2xl font-bold text-foreground'>
                  {typeof data.value === 'number'
                    ? data.value.toLocaleString()
                    : data.value}
                </div>
                {data.label && (
                  <p className='text-sm text-muted-foreground font-medium'>
                    {data.label}
                  </p>
                )}
              </div>
            </div>
          </div>

          {data.trend && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
            >
              <Badge
                variant='outline'
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 font-medium border-0 shadow-sm',
                  data.trend.direction === 'up' &&
                    'bg-emerald-100 text-emerald-700',
                  data.trend.direction === 'down' && 'bg-red-100 text-red-700',
                  data.trend.direction === 'stable' &&
                    'bg-gray-100 text-gray-700'
                )}
              >
                {data.trend.direction === 'up' && (
                  <TrendingUp className='h-3.5 w-3.5' />
                )}
                {data.trend.direction === 'down' && (
                  <TrendingDown className='h-3.5 w-3.5' />
                )}
                {data.trend.direction === 'stable' && (
                  <Minus className='h-3.5 w-3.5' />
                )}
                <span className='text-xs font-semibold'>
                  {data.trend.percentage}%
                </span>
              </Badge>
            </motion.div>
          )}
        </div>

        {data.additionalInfo && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className='grid grid-cols-2 gap-3 pt-3 border-t border-gray-100'
          >
            {Object.entries(data.additionalInfo).map(([key, value], index) => (
              <motion.div
                key={key}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 + index * 0.1 }}
                className='text-center p-3 rounded-lg bg-muted/50 border border-border'
              >
                <p className='text-lg font-bold text-foreground'>{value}</p>
                <p className='text-xs text-muted-foreground font-medium mt-1'>
                  {key.replace(/_/g, ' ').toUpperCase()}
                </p>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Custom widget rendering */}
        {data.customData?.type === 'welcome' && (
          <WelcomeWidget data={data} config={widget.widget_config} />
        )}

        {data.customData?.type === 'clock' && (
          <div className='flex items-center justify-center h-full'>
            <AnalogClock3D
              embedded={true}
              size='md'
              className='w-full h-full'
            />
          </div>
        )}

        {data.customData?.type === 'ai_chip' && (
          <div className='flex items-center justify-center h-full'>
            <AIChip
              embedded={true}
              showDescription={data.customData.showDescription}
              animated={data.customData.animated}
              className='w-full h-full'
            />
          </div>
        )}

        {data.customData?.type === 'weather' && (
          <div className='flex items-center justify-center h-full'>
            <WeatherCard
              embedded={true}
              showDetails={data.customData.showDetails}
              location={data.customData.location}
              className='w-full h-full'
            />
          </div>
        )}

        {data.chartData && data.chartData.length > 0 && !data.customData && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className='pt-2'
          >
            <div className='h-16 flex items-end justify-between gap-1'>
              {data.chartData?.slice(0, 8).map((item, index) => {
                const chartData = data.chartData || [];
                const maxValue = Math.max(
                  ...chartData.map((d) => d.value || d.count || 0)
                );
                const height =
                  ((item.value || item.count || 0) / maxValue) * 100;
                return (
                  <motion.div
                    key={index}
                    initial={{ height: 0 }}
                    animate={{ height: `${height}%` }}
                    transition={{ delay: 0.6 + index * 0.1, duration: 0.5 }}
                    className={`flex-1 min-h-[4px] rounded-t-sm bg-gradient-to-t ${categoryConfig.gradient} opacity-70 hover:opacity-100 transition-opacity`}
                    title={`${item.name}: ${item.value || item.count}`}
                  />
                );
              }) || []}
            </div>
          </motion.div>
        )}
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{
        duration: 0.4,
        ease: [0.25, 0.46, 0.45, 0.94]
      }}
      whileHover={{
        y: -4,
        transition: { duration: 0.2 }
      }}
      className={cn('group', className)}
    >
      <Card
        className={cn(
          'h-full relative overflow-hidden',
          'bg-card backdrop-blur-sm border-border',
          'shadow-lg dark:shadow-none',
          'hover:shadow-xl dark:hover:shadow-none',
          'transition-all duration-300 ease-out',
          'ring-1 ring-border',
          isEditing && 'ring-2 ring-primary/50 shadow-primary/25'
        )}
      >
        <div className='absolute inset-0 bg-gradient-to-br from-background/40 via-transparent to-transparent pointer-events-none' />

        {/* Edit Mode Indicator */}
        {isEditing && (
          <div className='absolute top-2 left-2 z-20'>
            <Badge
              variant='secondary'
              className='text-xs px-2 py-1 bg-primary/10 text-primary border-primary/20 shadow-sm'
            >
              Edit Mode
            </Badge>
          </div>
        )}

        <CardHeader className='pb-3 relative z-10'>
          <div className='flex items-start justify-between'>
            <div className='flex-1'>
              <CardTitle
                className={cn(
                  'text-lg font-semibold leading-tight text-foreground'
                )}
              >
                {widget.widget_type?.widget_name || 'Unknown Widget'}
              </CardTitle>
              {widget.widget_type?.description && (
                <CardDescription className='text-sm text-muted-foreground mt-1 font-medium'>
                  {widget.widget_type.description}
                </CardDescription>
              )}
            </div>

            {isEditing && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant='ghost'
                    size='sm'
                    className='opacity-80 hover:opacity-100 transition-opacity h-8 w-8 p-0 hover:bg-muted border border-border'
                  >
                    <MoreHorizontal className='h-4 w-4' />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end' className='w-40'>
                  <DropdownMenuItem onClick={() => onConfigure?.(widget)}>
                    <Settings className='h-4 w-4 mr-2' />
                    Configure
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleRefresh}>
                    <RefreshCw className='h-4 w-4 mr-2' />
                    Refresh
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onRemove?.(widget.id)}
                    className='text-red-600 focus:text-red-600'
                  >
                    <X className='h-4 w-4 mr-2' />
                    Remove
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </CardHeader>

        <CardContent className='pt-0 pb-6 relative z-10'>
          {renderWidget()}
        </CardContent>

        {/* Decorative elements */}
        <div
          className={cn(
            'absolute top-0 right-0 w-20 h-20',
            'bg-gradient-to-bl opacity-5',
            categoryConfig.gradient,
            'rounded-bl-full'
          )}
        />

        <div
          className={cn(
            'absolute bottom-0 left-0 w-16 h-16',
            'bg-gradient-to-tr opacity-5',
            categoryConfig.gradient,
            'rounded-tr-full'
          )}
        />
      </Card>
    </motion.div>
  );
}

// KPI Widget Component
function KPIWidget({
  data,
  config,
  categoryConfig
}: {
  data: WidgetData;
  config: Record<string, any>;
  categoryConfig: any;
}) {
  const formatValue = (value: number | string) => {
    if (typeof value === 'number') {
      if (config.currency) {
        return new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency: config.currency
        }).format(value);
      }
      return value.toLocaleString();
    }
    return value;
  };

  const IconComponent = categoryConfig.icon;

  return (
    <div className='space-y-6'>
      <div className='flex items-start justify-between'>
        <div className='flex items-center gap-4'>
          <div
            className={cn(
              'p-3 rounded-xl bg-gradient-to-r shadow-lg',
              categoryConfig.gradient,
              'text-white'
            )}
          >
            <IconComponent className='h-6 w-6' />
          </div>
          <div>
            <div className={cn('text-3xl font-bold text-foreground')}>
              {formatValue(data.value)}
            </div>
            {data.label && (
              <p className='text-sm text-muted-foreground font-medium mt-1'>
                {data.label}
              </p>
            )}
          </div>
        </div>

        {data.trend && config.showTrend && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <Badge
              variant='outline'
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 font-medium border-0 shadow-sm',
                data.trend.direction === 'up' &&
                  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
                data.trend.direction === 'down' &&
                  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                data.trend.direction === 'stable' &&
                  'bg-muted text-muted-foreground'
              )}
            >
              {data.trend.direction === 'up' && (
                <TrendingUp className='h-4 w-4' />
              )}
              {data.trend.direction === 'down' && (
                <TrendingDown className='h-4 w-4' />
              )}
              {data.trend.direction === 'stable' && (
                <Minus className='h-4 w-4' />
              )}
              <span className='text-sm font-semibold'>
                {data.trend.percentage}% {data.trend.period}
              </span>
            </Badge>
          </motion.div>
        )}
      </div>

      {data.additionalInfo && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className='grid grid-cols-2 gap-4 pt-4 border-t border-gray-200'
        >
          {Object.entries(data.additionalInfo).map(([key, value], index) => (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + index * 0.1 }}
              className={cn(
                'text-center p-4 rounded-xl',
                'bg-card border border-border shadow-sm',
                'hover:shadow-md dark:hover:shadow-none transition-shadow duration-200'
              )}
            >
              <p className='text-xl font-bold text-foreground'>{value}</p>
              <p className='text-xs text-muted-foreground font-medium mt-1 uppercase tracking-wide'>
                {key.replace(/_/g, ' ')}
              </p>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}

// Chart Widget Component
function ChartWidget({
  data,
  config
}: {
  data: WidgetData;
  config: Record<string, any>;
}) {
  if (!data.chartData || data.chartData.length === 0) {
    return (
      <div className='flex items-center justify-center h-full text-center'>
        <p className='text-sm text-muted-foreground'>No chart data available</p>
      </div>
    );
  }

  const chartHeight = 200;

  switch (config.chartType) {
    case 'pie':
      return (
        <div className='h-full'>
          <ResponsiveContainer width='100%' height={chartHeight}>
            <PieChart>
              <Pie
                data={data.chartData}
                cx='50%'
                cy='50%'
                outerRadius={60}
                fill='#8884d8'
                dataKey='value'
                label={
                  config.showPercentage
                    ? ({ name, percent }) =>
                        `${name}: ${(percent * 100).toFixed(0)}%`
                    : undefined
                }
              >
                {data.chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.fill || `hsl(${index * 45}, 70%, 60%)`}
                  />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      );

    case 'line':
      return (
        <div className='h-full'>
          <ResponsiveContainer width='100%' height={chartHeight}>
            <LineChart data={data.chartData}>
              <CartesianGrid strokeDasharray='3 3' />
              <XAxis dataKey='name' fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Line
                type='monotone'
                dataKey='value'
                stroke='#8884d8'
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      );

    case 'area':
      return (
        <div className='h-full'>
          <ResponsiveContainer width='100%' height={chartHeight}>
            <AreaChart data={data.chartData}>
              <CartesianGrid strokeDasharray='3 3' />
              <XAxis dataKey='name' fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Area
                type='monotone'
                dataKey='value'
                stroke='#8884d8'
                fill='#8884d8'
                fillOpacity={0.3}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      );

    case 'bar':
    default:
      return (
        <div className='h-full'>
          <ResponsiveContainer width='100%' height={chartHeight}>
            <BarChart data={data.chartData}>
              <CartesianGrid strokeDasharray='3 3' />
              <XAxis dataKey='name' fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Bar dataKey='count' fill='#8884d8' radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
  }
}

// Table Widget Component
function TableWidget({
  data,
  config,
  categoryConfig
}: {
  data: WidgetData;
  config: Record<string, any>;
  categoryConfig: any;
}) {
  if (!data.tableData || data.tableData.length === 0) {
    return (
      <div className='flex flex-col items-center justify-center h-32'>
        <FileText className='h-6 w-6 text-muted-foreground' />
        <p className='text-sm text-muted-foreground font-medium'>
          No data available
        </p>
      </div>
    );
  }

  const limitedData = data.tableData.slice(0, config.limit || 10);

  return (
    <div className='space-y-3'>
      {limitedData.map((item, index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.1 }}
          className={cn(
            'flex items-center justify-between p-4 rounded-xl',
            'bg-card border border-border shadow-sm',
            'hover:shadow-md dark:hover:shadow-none hover:border-border',
            'transition-all duration-200'
          )}
        >
          <div className='flex items-center space-x-4'>
            {config.showAvatar && (
              <div
                className={cn(
                  'h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-semibold shadow-md',
                  `bg-gradient-to-r ${categoryConfig.gradient}`
                )}
              >
                {item.full_name?.[0]?.toUpperCase() ||
                  item.name?.[0]?.toUpperCase() ||
                  '?'}
              </div>
            )}
            <div className='flex-1 min-w-0'>
              <p className='text-sm font-semibold text-foreground truncate'>
                {item.full_name || item.name || 'Unknown'}
              </p>
              {item.email && (
                <p className='text-xs text-muted-foreground truncate'>
                  {item.email}
                </p>
              )}
            </div>
          </div>
          <div className='text-right flex-shrink-0'>
            {item.role && (
              <Badge
                variant='outline'
                className={cn(
                  'text-xs font-medium border-0 shadow-sm px-2 py-1',
                  `bg-gradient-to-r ${categoryConfig.gradient} text-white`
                )}
              >
                {item.role.replace('_', ' ').toLowerCase()}
              </Badge>
            )}
            {item.status && (
              <div
                className={cn(
                  'mt-1 text-xs px-2 py-0.5 rounded-full font-medium',
                  item.status === 'active' &&
                    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                  item.status === 'inactive' &&
                    'bg-muted text-muted-foreground',
                  item.status === 'pending' &&
                    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                )}
              >
                {item.status}
              </div>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// Feed Widget Component
function FeedWidget({
  data,
  config
}: {
  data: WidgetData;
  config: Record<string, any>;
}) {
  // Placeholder implementation for activity feeds
  return (
    <div className='space-y-3'>
      {Array.from({ length: config.limit || 5 }).map((_, index) => (
        <div
          key={index}
          className='flex items-start space-x-3 p-2 rounded-lg bg-muted/30'
        >
          <div className='h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs'>
            {index + 1}
          </div>
          <div className='flex-1 min-w-0'>
            <p className='text-sm font-medium'>Activity {index + 1}</p>
            <p className='text-xs text-muted-foreground'>
              Sample activity description for item {index + 1}
            </p>
            <p className='text-xs text-muted-foreground mt-1'>
              {new Date().toLocaleDateString()}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// Widget Skeleton Loader
function WidgetSkeleton({ category }: { category: string }) {
  switch (category) {
    case 'kpi':
      return (
        <div className='space-y-4'>
          <div className='flex items-center justify-between'>
            <div>
              <Skeleton className='h-8 w-24 mb-2' />
              <Skeleton className='h-4 w-32' />
            </div>
            <Skeleton className='h-6 w-16' />
          </div>
          <div className='grid grid-cols-2 gap-4 pt-2'>
            <div className='text-center'>
              <Skeleton className='h-6 w-12 mx-auto mb-1' />
              <Skeleton className='h-3 w-16 mx-auto' />
            </div>
            <div className='text-center'>
              <Skeleton className='h-6 w-12 mx-auto mb-1' />
              <Skeleton className='h-3 w-16 mx-auto' />
            </div>
          </div>
        </div>
      );

    case 'chart':
      return (
        <div className='space-y-4'>
          <Skeleton className='h-[200px] w-full' />
        </div>
      );

    case 'table':
      return (
        <div className='space-y-2'>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className='flex items-center justify-between p-2'>
              <div className='flex items-center space-x-3'>
                <Skeleton className='h-8 w-8 rounded-full' />
                <div>
                  <Skeleton className='h-4 w-24 mb-1' />
                  <Skeleton className='h-3 w-32' />
                </div>
              </div>
              <Skeleton className='h-6 w-16' />
            </div>
          ))}
        </div>
      );

    case 'feed':
      return (
        <div className='space-y-3'>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className='flex items-start space-x-3 p-2'>
              <Skeleton className='h-8 w-8 rounded-full' />
              <div className='flex-1'>
                <Skeleton className='h-4 w-32 mb-1' />
                <Skeleton className='h-3 w-full mb-2' />
                <Skeleton className='h-3 w-20' />
              </div>
            </div>
          ))}
        </div>
      );

    default:
      return <Skeleton className='h-full w-full' />;
  }
}

// Welcome Widget Component
function WelcomeWidget({
  data,
  config
}: {
  data: WidgetData;
  config: Record<string, any>;
}) {
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [greeting, setGreeting] = useState<string>('Hello');

  useEffect(() => {
    // Get greeting based on time of day
    const getGreeting = (): string => {
      const hour = new Date().getHours();
      if (hour < 12) return 'Good Morning';
      if (hour < 18) return 'Good Afternoon';
      return 'Good Evening';
    };

    // Get current user
    const fetchCurrentUser = async () => {
      try {
        const { createClientSupabaseClient } = await import(
          '@/lib/supabase/client'
        );
        const supabase = createClientSupabaseClient();
        const {
          data: { user }
        } = await supabase.auth.getUser();

        if (user) {
          // Get user profile to get full name
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', user.id)
            .single();

          setCurrentUser(
            // @ts-ignore - TypeScript type inference issue after React 19 upgrade
            profile?.full_name || user.email?.split('@')[0] || 'User'
          );
        }
      } catch (error) {
        console.error('Error fetching user:', error);
        setCurrentUser('User');
      }
    };

    setGreeting(getGreeting());
    fetchCurrentUser();

    // Update greeting every hour
    const timer = setInterval(() => {
      setGreeting(getGreeting());
    }, 3600000);

    return () => clearInterval(timer);
  }, []);

  return (
    <motion.div
      className='w-full h-full flex flex-col justify-center p-6 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl relative overflow-hidden'
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      {/* Enhanced background animations */}
      {Array.from({ length: 8 }).map((_, i) => (
        <motion.div
          key={i}
          className='absolute rounded-full opacity-20 blur-sm'
          style={{
            width: `${Math.random() * 20 + 10}px`,
            height: `${Math.random() * 20 + 10}px`,
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
            y: [0, Math.random() * -50 - 25],
            x: [0, (Math.random() - 0.5) * 50],
            opacity: [0.4, 0],
            scale: [0, 1, 0.5]
          }}
          transition={{
            duration: Math.random() * 8 + 6,
            repeat: Infinity,
            ease: 'easeInOut',
            repeatDelay: Math.random() * 3
          }}
        />
      ))}

      <motion.div
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.3, duration: 0.8 }}
      >
        <motion.h1
          className='text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-green-600 to-emerald-500 mb-2'
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
          className='h-1 bg-gradient-to-r from-green-500 via-emerald-500 to-green-500 rounded-full'
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: '60%', opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.6 }}
        />
      </motion.div>

      <motion.p
        className='mt-4 text-sm text-muted-foreground max-w-md'
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, duration: 0.5 }}
      >
        Welcome to your personalized dashboard. Explore insights and manage your
        institution efficiently.
      </motion.p>

      {config.showExploreButton && (
        <motion.div
          className='mt-4'
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.1, duration: 0.5 }}
        >
          <Button
            size='sm'
            className='bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-700 hover:to-emerald-600 shadow-md hover:shadow-lg transition-all'
          >
            <Sparkles className='mr-2 h-4 w-4' />
            Explore Dashboard
          </Button>
        </motion.div>
      )}
    </motion.div>
  );
}
