'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Cloud,
  Sun,
  CloudRain,
  CloudSnow,
  Zap,
  Eye,
  Wind,
  Droplets,
  Thermometer,
  MapPin,
  RefreshCw,
  CloudDrizzle,
  Sunset,
  Moon,
  Star,
  Gauge
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface WeatherData {
  location: string;
  temperature: number;
  description: string;
  humidity: number;
  windSpeed: number;
  visibility: number;
  weatherType: string;
  icon: string;
  feelsLike: number;
  pressure: number;
  uvIndex: number;
  isDay: boolean;
  timeOfDay: 'dawn' | 'day' | 'dusk' | 'night';
}

interface WeatherCardProps {
  className?: string;
  embedded?: boolean;
  showDetails?: boolean;
  location?: string;
}

const WeatherCard: React.FC<WeatherCardProps> = ({
  className,
  embedded = false,
  showDetails = true,
  location = 'Chennai'
}) => {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const API_KEY = process.env.NEXT_PUBLIC_OPENWEATHER_API_KEY;

  const getTimeOfDay = (): 'dawn' | 'day' | 'dusk' | 'night' => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 8) return 'dawn';
    if (hour >= 8 && hour < 17) return 'day';
    if (hour >= 17 && hour < 20) return 'dusk';
    return 'night';
  };

  const fetchWeather = async () => {
    try {
      setLoading(true);
      setError(null);

      // Check if API key exists, if not, use demo data immediately
      if (!API_KEY || API_KEY === 'demo_key') {
        throw new Error('No API key provided');
      }

      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?q=${location}&appid=${API_KEY}&units=metric`
      );

      if (!response.ok) {
        throw new Error('Weather API unavailable');
      }

      const data = await response.json();
      const currentHour = new Date().getHours();
      const isDay = currentHour >= 6 && currentHour < 20;
      const timeOfDay = getTimeOfDay();

      setWeather({
        location: data.name,
        temperature: Math.round(data.main.temp),
        description: data.weather[0].description,
        humidity: data.main.humidity,
        windSpeed: Math.round(data.wind.speed * 3.6),
        visibility: Math.round(data.visibility / 1000),
        weatherType: data.weather[0].main.toLowerCase(),
        icon: data.weather[0].icon,
        feelsLike: Math.round(data.main.feels_like),
        pressure: data.main.pressure,
        uvIndex: Math.floor(Math.random() * 11) + 1,
        isDay,
        timeOfDay
      });
    } catch (err) {
      // Enhanced demo data with multiple scenarios
      const demoScenarios = [
        {
          location: 'Mumbai',
          temperature: 28,
          description: 'partly cloudy',
          humidity: 75,
          windSpeed: 15,
          visibility: 8,
          weatherType: 'clouds',
          icon: '02d',
          feelsLike: 32,
          pressure: 1013,
          uvIndex: 7,
          isDay: true,
          timeOfDay: getTimeOfDay()
        },
        {
          location: 'Delhi',
          temperature: 35,
          description: 'clear sky',
          humidity: 45,
          windSpeed: 8,
          visibility: 12,
          weatherType: 'clear',
          icon: '01d',
          feelsLike: 38,
          pressure: 1015,
          uvIndex: 9,
          isDay: true,
          timeOfDay: getTimeOfDay()
        },
        {
          location: 'Bangalore',
          temperature: 24,
          description: 'light rain',
          humidity: 85,
          windSpeed: 12,
          visibility: 6,
          weatherType: 'rain',
          icon: '10d',
          feelsLike: 26,
          pressure: 1010,
          uvIndex: 3,
          isDay: true,
          timeOfDay: getTimeOfDay()
        }
      ];

      const randomDemo =
        demoScenarios[Math.floor(Math.random() * demoScenarios.length)];
      setWeather(randomDemo);
      setError(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWeather();
    const interval = setInterval(fetchWeather, 600000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]); // fetchWeather would cause infinite loop

  const getWeatherIcon = (weatherType: string, isDay: boolean = true) => {
    const iconSize = embedded ? 'w-12 h-12' : 'w-16 h-16';
    const iconProps = { className: iconSize, strokeWidth: 1.5 };

    if (!isDay) {
      return (
        <motion.div
          animate={{ rotate: [0, 5, -5, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          className='relative'
        >
          <Moon
            {...iconProps}
            className={`${iconSize} text-blue-200 drop-shadow-lg`}
          />
          <motion.div
            className='absolute -top-1 -right-1 w-2 h-2 bg-blue-100 rounded-full'
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        </motion.div>
      );
    }

    switch (weatherType) {
      case 'clear':
        return (
          <motion.div
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
            className='relative'
          >
            <Sun
              {...iconProps}
              className={`${iconSize} text-yellow-300 drop-shadow-lg filter brightness-110`}
            />
            {/* Sun rays */}
            {Array.from({ length: 8 }).map((_, i) => (
              <motion.div
                key={i}
                className='absolute w-0.5 h-6 bg-yellow-200 rounded-full'
                style={{
                  top: '50%',
                  left: '50%',
                  transformOrigin: '0 0',
                  transform: `rotate(${i * 45}deg) translateY(-${
                    embedded ? '30' : '40'
                  }px)`
                }}
                animate={{ opacity: [0.6, 1, 0.6] }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  delay: i * 0.2
                }}
              />
            ))}
          </motion.div>
        );
      case 'clouds':
        return (
          <motion.div
            animate={{ x: [0, 10, 0], y: [0, -5, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            className='relative'
          >
            <Cloud
              {...iconProps}
              className={`${iconSize} text-white drop-shadow-lg`}
            />
            <motion.div
              className='absolute -top-2 -right-2 w-6 h-6 bg-white/70 rounded-full blur-sm'
              animate={{ scale: [0.8, 1.2, 0.8] }}
              transition={{ duration: 3, repeat: Infinity }}
            />
          </motion.div>
        );
      case 'rain':
        return (
          <motion.div
            animate={{ y: [0, -2, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className='relative'
          >
            <CloudRain
              {...iconProps}
              className={`${iconSize} text-blue-200 drop-shadow-lg`}
            />
            {/* Rain drops */}
            {Array.from({ length: 4 }).map((_, i) => (
              <motion.div
                key={i}
                className='absolute w-0.5 h-3 bg-blue-300 rounded-full'
                style={{
                  left: `${30 + i * 10}%`,
                  top: '70%'
                }}
                animate={{
                  y: [0, 15],
                  opacity: [0.8, 0]
                }}
                transition={{
                  duration: 0.8,
                  repeat: Infinity,
                  delay: i * 0.2,
                  ease: 'linear'
                }}
              />
            ))}
          </motion.div>
        );
      case 'snow':
        return (
          <motion.div
            animate={{ y: [0, -3, 0], rotate: [0, 10, -10, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            className='relative'
          >
            <CloudSnow
              {...iconProps}
              className={`${iconSize} text-blue-100 drop-shadow-lg`}
            />
          </motion.div>
        );
      case 'thunderstorm':
        return (
          <motion.div
            animate={{
              scale: [1, 1.1, 1],
              opacity: [1, 0.8, 1]
            }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            className='relative'
          >
            <Zap
              {...iconProps}
              className={`${iconSize} text-yellow-200 drop-shadow-lg`}
            />
            <motion.div
              className='absolute inset-0 bg-yellow-300 rounded-full blur-xl opacity-30'
              animate={{ scale: [1, 1.5, 1] }}
              transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}
            />
          </motion.div>
        );
      default:
        return (
          <Cloud
            {...iconProps}
            className={`${iconSize} text-white drop-shadow-lg`}
          />
        );
    }
  };

  const getAdvancedBackgroundGradient = (
    weatherType: string,
    timeOfDay: 'dawn' | 'day' | 'dusk' | 'night'
  ) => {
    const gradients = {
      clear: {
        dawn: 'from-orange-300 via-pink-300 to-purple-400',
        day: 'from-blue-400 via-sky-400 to-blue-500',
        dusk: 'from-orange-400 via-red-400 to-purple-600',
        night: 'from-indigo-900 via-purple-900 to-blue-900'
      },
      clouds: {
        dawn: 'from-gray-400 via-orange-200 to-gray-500',
        day: 'from-gray-300 via-gray-400 to-gray-600',
        dusk: 'from-gray-500 via-orange-300 to-gray-700',
        night: 'from-gray-800 via-gray-900 to-black'
      },
      rain: {
        dawn: 'from-gray-600 via-blue-500 to-gray-700',
        day: 'from-gray-500 via-blue-600 to-gray-700',
        dusk: 'from-gray-700 via-blue-700 to-gray-800',
        night: 'from-gray-800 via-blue-900 to-black'
      },
      drizzle: {
        dawn: 'from-gray-400 via-blue-400 to-gray-600',
        day: 'from-gray-400 via-blue-500 to-gray-600',
        dusk: 'from-gray-600 via-blue-600 to-gray-700',
        night: 'from-gray-700 via-blue-800 to-gray-900'
      },
      snow: {
        dawn: 'from-blue-200 via-white to-blue-300',
        day: 'from-blue-100 via-white to-blue-200',
        dusk: 'from-blue-300 via-purple-200 to-blue-400',
        night: 'from-blue-800 via-indigo-800 to-blue-900'
      },
      thunderstorm: {
        dawn: 'from-purple-800 via-gray-700 to-purple-900',
        day: 'from-purple-700 via-gray-800 to-purple-800',
        dusk: 'from-purple-900 via-red-800 to-black',
        night: 'from-purple-900 via-black to-purple-900'
      }
    };

    return (
      gradients[weatherType as keyof typeof gradients]?.[timeOfDay] ||
      gradients.clear.day
    );
  };

  const getAnimatedElements = (weatherType: string, timeOfDay: string) => {
    switch (weatherType) {
      case 'rain':
        return Array.from({ length: embedded ? 15 : 25 }).map((_, i) => (
          <motion.div
            key={`rain-${i}`}
            className='absolute w-0.5 h-8 bg-gradient-to-b from-blue-200 to-blue-400 rounded-full opacity-70'
            style={{
              left: `${Math.random() * 100}%`,
              top: `-30px`
            }}
            animate={{
              y: [0, 280],
              opacity: [0.7, 0]
            }}
            transition={{
              duration: Math.random() * 0.8 + 0.5,
              repeat: Infinity,
              delay: Math.random() * 2,
              ease: 'linear'
            }}
          />
        ));

      case 'snow':
        return Array.from({ length: embedded ? 12 : 20 }).map((_, i) => (
          <motion.div
            key={`snow-${i}`}
            className='absolute w-3 h-3 bg-white rounded-full opacity-90 shadow-lg'
            style={{
              left: `${Math.random() * 100}%`,
              top: `-30px`
            }}
            animate={{
              y: [0, 280],
              x: [0, Math.random() * 60 - 30],
              opacity: [0.9, 0],
              rotate: [0, 360]
            }}
            transition={{
              duration: Math.random() * 5 + 4,
              repeat: Infinity,
              delay: Math.random() * 3,
              ease: 'easeOut'
            }}
          />
        ));

      case 'clear':
        return (
          <>
            {/* Floating particles for clear weather */}
            {Array.from({ length: embedded ? 6 : 12 }).map((_, i) => (
              <motion.div
                key={`sparkle-${i}`}
                className='absolute w-1 h-1 bg-yellow-200 rounded-full shadow-lg'
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`
                }}
                animate={{
                  opacity: [0, 1, 0],
                  scale: [0, 1.5, 0],
                  y: [0, -20, 0]
                }}
                transition={{
                  duration: Math.random() * 4 + 3,
                  repeat: Infinity,
                  delay: Math.random() * 4
                }}
              />
            ))}

            {/* Heat shimmer effect */}
            {timeOfDay === 'day' && (
              <motion.div
                className='absolute inset-0 opacity-30'
                style={{
                  background:
                    'linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.1) 50%, transparent 70%)'
                }}
                animate={{
                  x: ['-100%', '100%']
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: 'linear'
                }}
              />
            )}
          </>
        );

      case 'thunderstorm':
        return (
          <>
            <motion.div
              className='absolute inset-0 bg-yellow-200 opacity-0 pointer-events-none'
              animate={{
                opacity: [0, 0.4, 0]
              }}
              transition={{
                duration: 0.1,
                repeat: Infinity,
                repeatDelay: Math.random() * 5 + 3
              }}
            />

            {/* Rain for thunderstorm */}
            {Array.from({ length: embedded ? 20 : 30 }).map((_, i) => (
              <motion.div
                key={`storm-rain-${i}`}
                className='absolute w-0.5 h-10 bg-gradient-to-b from-blue-300 to-blue-600 rounded-full opacity-80'
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `-40px`
                }}
                animate={{
                  y: [0, 300],
                  opacity: [0.8, 0],
                  x: [0, Math.random() * 20 - 10]
                }}
                transition={{
                  duration: Math.random() * 0.5 + 0.3,
                  repeat: Infinity,
                  delay: Math.random() * 1,
                  ease: 'linear'
                }}
              />
            ))}
          </>
        );

      case 'clouds':
        return (
          <>
            {/* Floating cloud particles */}
            {Array.from({ length: 5 }).map((_, i) => (
              <motion.div
                key={`cloud-particle-${i}`}
                className='absolute w-8 h-4 bg-white/20 rounded-full blur-sm'
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`
                }}
                animate={{
                  x: [0, 30, 0],
                  opacity: [0.3, 0.6, 0.3]
                }}
                transition={{
                  duration: Math.random() * 8 + 6,
                  repeat: Infinity,
                  delay: Math.random() * 3
                }}
              />
            ))}
          </>
        );

      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div
        className={cn(
          'w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-100 via-indigo-100 to-purple-200 rounded-xl backdrop-blur-sm relative overflow-hidden',
          className
        )}
      >
        {/* Animated background */}
        <motion.div
          className='absolute inset-0 bg-gradient-to-r from-blue-400/20 via-purple-400/20 to-blue-400/20'
          animate={{
            x: ['-100%', '100%']
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'linear'
          }}
        />

        <motion.div
          className='flex flex-col items-center gap-4 relative z-10'
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            className='relative'
          >
            <RefreshCw className='w-10 h-10 text-blue-600' />
            <motion.div
              className='absolute inset-0 bg-blue-400 rounded-full blur-lg opacity-30'
              animate={{ scale: [1, 1.5, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
          </motion.div>
          <motion.div
            className='text-center'
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <p className='text-sm text-blue-700 font-semibold mb-1'>
              Loading Weather
            </p>
            <div className='flex gap-1 justify-center'>
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className='w-2 h-2 bg-blue-500 rounded-full'
                  animate={{ y: [0, -10, 0] }}
                  transition={{
                    duration: 0.8,
                    repeat: Infinity,
                    delay: i * 0.2
                  }}
                />
              ))}
            </div>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  if (!weather) {
    return (
      <div
        className={cn(
          'w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-red-100 via-orange-100 to-red-200 rounded-xl p-4 relative overflow-hidden',
          className
        )}
      >
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          className='relative'
        >
          <Cloud className='w-16 h-16 text-red-400 mb-4' />
          <motion.div
            className='absolute -top-2 -right-2 w-4 h-4 bg-red-500 rounded-full'
            animate={{ scale: [1, 1.3, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
        </motion.div>
        <p className='text-base text-red-600 text-center font-semibold mb-3'>
          Weather Unavailable
        </p>
        <motion.button
          onClick={fetchWeather}
          className='px-4 py-2 text-sm bg-gradient-to-r from-red-500 to-red-600 text-white rounded-full hover:from-red-600 hover:to-red-700 transition-all shadow-lg'
          whileHover={{ scale: 1.05, y: -2 }}
          whileTap={{ scale: 0.95 }}
        >
          Try Again
        </motion.button>
      </div>
    );
  }

  return (
    <motion.div
      className={cn(
        'w-full h-full relative overflow-hidden rounded-xl shadow-2xl',
        className
      )}
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.8, type: 'spring', stiffness: 100 }}
    >
      {/* Dynamic Animated Background */}
      <motion.div
        className={`absolute inset-0 bg-gradient-to-br ${getAdvancedBackgroundGradient(
          weather.weatherType,
          weather.timeOfDay
        )}`}
        animate={{
          backgroundPosition: ['0% 0%', '100% 100%', '0% 0%']
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: 'linear'
        }}
      />

      {/* Secondary gradient layer for depth */}
      <motion.div
        className={`absolute inset-0 bg-gradient-to-tr ${getAdvancedBackgroundGradient(
          weather.weatherType,
          weather.timeOfDay
        )} opacity-60`}
        animate={{
          backgroundPosition: ['100% 100%', '0% 0%', '100% 100%']
        }}
        transition={{
          duration: 25,
          repeat: Infinity,
          ease: 'linear'
        }}
      />

      {/* Enhanced glass morphism overlay */}
      <div className='absolute inset-0 bg-white/10 backdrop-blur-md' />
      <div className='absolute inset-0 bg-gradient-to-b from-white/5 via-transparent to-black/10' />

      {/* Weather animation layer */}
      <div className='absolute inset-0 overflow-hidden'>
        {getAnimatedElements(weather.weatherType, weather.timeOfDay)}

        {/* Enhanced stars for night time */}
        {!weather.isDay &&
          Array.from({ length: embedded ? 8 : 15 }).map((_, i) => (
            <motion.div
              key={`star-${i}`}
              className='absolute w-1 h-1 bg-white rounded-full shadow-lg'
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 60}%`,
                boxShadow: '0 0 6px rgba(255, 255, 255, 0.8)'
              }}
              animate={{
                opacity: [0.3, 1, 0.3],
                scale: [0.5, 1.2, 0.5]
              }}
              transition={{
                duration: Math.random() * 3 + 2,
                repeat: Infinity,
                delay: Math.random() * 2
              }}
            />
          ))}
      </div>

      {/* Enhanced Content */}
      <div className='relative z-10 h-full p-4 flex flex-col justify-between text-white'>
        {/* Header with enhanced styling */}
        <div className='flex items-start justify-between'>
          <div className='space-y-2'>
            <motion.div
              className='flex items-center gap-2 text-white/90'
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
              <MapPin className='w-4 h-4 drop-shadow-sm' />
              <span
                className={`font-semibold ${
                  embedded ? 'text-sm' : 'text-base'
                } drop-shadow-sm`}
              >
                {weather.location}
              </span>
            </motion.div>

            <motion.div
              className={`${
                embedded ? 'text-4xl' : 'text-5xl'
              } font-bold text-white drop-shadow-lg`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, type: 'spring', stiffness: 100 }}
            >
              {weather.temperature}°
              <span
                className={`${
                  embedded ? 'text-lg' : 'text-xl'
                } font-normal text-white/80 ml-1`}
              >
                C
              </span>
            </motion.div>

            <motion.div
              className={`${
                embedded ? 'text-sm' : 'text-base'
              } text-white/80 font-medium drop-shadow-sm`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              Feels like {weather.feelsLike}°
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0, rotate: -180 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ delay: 0.5, type: 'spring', stiffness: 150 }}
            className='drop-shadow-lg'
          >
            {getWeatherIcon(weather.weatherType, weather.isDay)}
          </motion.div>
        </div>

        {/* Enhanced Description */}
        <motion.div
          className='text-center my-3'
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <p
            className={`${
              embedded ? 'text-base' : 'text-lg'
            } text-white/95 capitalize font-semibold drop-shadow-sm tracking-wide`}
          >
            {weather.description}
          </p>
        </motion.div>

        {/* Enhanced Weather details grid */}
        <motion.div
          className={`grid grid-cols-3 gap-3 ${
            embedded ? 'text-xs' : 'text-sm'
          }`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, staggerChildren: 0.1 }}
        >
          <motion.div
            className='flex flex-col items-center bg-white/20 backdrop-blur-md rounded-xl p-3 border border-white/20 shadow-lg'
            whileHover={{
              scale: 1.05,
              backgroundColor: 'rgba(255, 255, 255, 0.25)',
              y: -2
            }}
            transition={{ duration: 0.2 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Droplets className='w-5 h-5 text-blue-200 mb-2 drop-shadow-sm' />
            <span className='text-white font-bold text-lg'>
              {weather.humidity}%
            </span>
            <span className='text-white/70 text-xs font-medium'>Humidity</span>
          </motion.div>

          <motion.div
            className='flex flex-col items-center bg-white/20 backdrop-blur-md rounded-xl p-3 border border-white/20 shadow-lg'
            whileHover={{
              scale: 1.05,
              backgroundColor: 'rgba(255, 255, 255, 0.25)',
              y: -2
            }}
            transition={{ duration: 0.2 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Wind className='w-5 h-5 text-gray-200 mb-2 drop-shadow-sm' />
            <span className='text-white font-bold text-lg'>
              {weather.windSpeed}
            </span>
            <span className='text-white/70 text-xs font-medium'>km/h</span>
          </motion.div>

          <motion.div
            className='flex flex-col items-center bg-white/20 backdrop-blur-md rounded-xl p-3 border border-white/20 shadow-lg'
            whileHover={{
              scale: 1.05,
              backgroundColor: 'rgba(255, 255, 255, 0.25)',
              y: -2
            }}
            transition={{ duration: 0.2 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Eye className='w-5 h-5 text-purple-200 mb-2 drop-shadow-sm' />
            <span className='text-white font-bold text-lg'>
              {weather.visibility}
            </span>
            <span className='text-white/70 text-xs font-medium'>km</span>
          </motion.div>
        </motion.div>

        {/* Time indicator */}
        <motion.div
          className='flex justify-center mt-2'
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
        >
          <div
            className={`px-3 py-1 bg-white/20 backdrop-blur-md rounded-full border border-white/20 ${
              embedded ? 'text-xs' : 'text-sm'
            } text-white/80 font-medium`}
          >
            {weather.timeOfDay.charAt(0).toUpperCase() +
              weather.timeOfDay.slice(1)}{' '}
            •{' '}
            {new Date().toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit'
            })}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default WeatherCard;
