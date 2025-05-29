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
  Star
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
}

interface WeatherCardProps {
  className?: string;
  embedded?: boolean;
}

const WeatherCard: React.FC<WeatherCardProps> = ({
  className,
  embedded = false
}) => {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const API_KEY = process.env.NEXT_PUBLIC_OPENWEATHER_API_KEY;
  const CITY = 'London';

  const fetchWeather = async () => {
    try {
      setLoading(true);
      setError(null);

      // Check if API key exists, if not, use demo data immediately
      if (!API_KEY || API_KEY === 'demo_key') {
        throw new Error('No API key provided');
      }

      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?q=${CITY}&appid=${API_KEY}&units=metric`
      );

      if (!response.ok) {
        throw new Error('Weather API unavailable');
      }

      const data = await response.json();
      const currentHour = new Date().getHours();
      const isDay = currentHour >= 6 && currentHour < 20;

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
        uvIndex: Math.floor(Math.random() * 11) + 1, // Mock UV index
        isDay
      });
    } catch (err) {
      console.log('Using demo weather data:', err);
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
          isDay: true
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
          isDay: true
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
          isDay: true
        }
      ];

      const randomDemo =
        demoScenarios[Math.floor(Math.random() * demoScenarios.length)];
      setWeather(randomDemo);
      setError(null); // Clear error for demo mode
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWeather();
    const interval = setInterval(fetchWeather, 600000);
    return () => clearInterval(interval);
  }, []);

  const getWeatherIcon = (weatherType: string, isDay: boolean = true) => {
    const iconSize = embedded ? 'w-10 h-10' : 'w-16 h-16';
    const iconProps = { className: iconSize, strokeWidth: 1.5 };

    if (!isDay) {
      return (
        <motion.div
          animate={{ rotate: [0, 5, -5, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Moon {...iconProps} className={`${iconSize} text-indigo-300`} />
        </motion.div>
      );
    }

    switch (weatherType) {
      case 'clear':
        return (
          <motion.div
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          >
            <Sun {...iconProps} className={`${iconSize} text-yellow-400`} />
          </motion.div>
        );
      case 'clouds':
        return (
          <motion.div
            animate={{ x: [0, 10, 0], y: [0, -5, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Cloud {...iconProps} className={`${iconSize} text-gray-400`} />
          </motion.div>
        );
      case 'rain':
        return (
          <motion.div
            animate={{ y: [0, -2, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <CloudRain {...iconProps} className={`${iconSize} text-blue-400`} />
          </motion.div>
        );
      case 'drizzle':
        return (
          <motion.div
            animate={{ y: [0, -1, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          >
            <CloudDrizzle
              {...iconProps}
              className={`${iconSize} text-blue-300`}
            />
          </motion.div>
        );
      case 'snow':
        return (
          <motion.div
            animate={{ y: [0, -3, 0], rotate: [0, 10, -10, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          >
            <CloudSnow {...iconProps} className={`${iconSize} text-blue-200`} />
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
          >
            <Zap {...iconProps} className={`${iconSize} text-yellow-500`} />
          </motion.div>
        );
      default:
        return <Cloud {...iconProps} className={`${iconSize} text-gray-400`} />;
    }
  };

  const getBackgroundGradient = (
    weatherType: string,
    isDay: boolean = true
  ) => {
    if (!isDay) {
      return 'from-indigo-900 via-purple-900 to-blue-900';
    }

    switch (weatherType) {
      case 'clear':
        return 'from-blue-400 via-blue-500 to-blue-600';
      case 'clouds':
        return 'from-gray-300 via-gray-400 to-gray-500';
      case 'rain':
      case 'drizzle':
        return 'from-gray-500 via-gray-600 to-gray-700';
      case 'snow':
        return 'from-blue-200 via-blue-300 to-blue-400';
      case 'thunderstorm':
        return 'from-purple-600 via-purple-700 to-purple-800';
      default:
        return 'from-blue-400 via-blue-500 to-blue-600';
    }
  };

  const getAnimatedElements = (weatherType: string) => {
    switch (weatherType) {
      case 'rain':
        return Array.from({ length: 20 }).map((_, i) => (
          <motion.div
            key={`rain-${i}`}
            className='absolute w-0.5 h-6 bg-blue-300 rounded-full opacity-70'
            style={{
              left: `${Math.random() * 100}%`,
              top: `-20px`
            }}
            animate={{
              y: [0, 250],
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
        return Array.from({ length: 15 }).map((_, i) => (
          <motion.div
            key={`snow-${i}`}
            className='absolute w-2 h-2 bg-white rounded-full opacity-90'
            style={{
              left: `${Math.random() * 100}%`,
              top: `-20px`
            }}
            animate={{
              y: [0, 250],
              x: [0, Math.random() * 60 - 30],
              opacity: [0.9, 0],
              rotate: [0, 360]
            }}
            transition={{
              duration: Math.random() * 4 + 3,
              repeat: Infinity,
              delay: Math.random() * 3,
              ease: 'easeOut'
            }}
          />
        ));

      case 'clear':
        return (
          <>
            {Array.from({ length: 8 }).map((_, i) => (
              <motion.div
                key={`sparkle-${i}`}
                className='absolute w-1 h-1 bg-yellow-300 rounded-full'
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`
                }}
                animate={{
                  opacity: [0, 1, 0],
                  scale: [0, 1, 0]
                }}
                transition={{
                  duration: Math.random() * 3 + 2,
                  repeat: Infinity,
                  delay: Math.random() * 4
                }}
              />
            ))}
          </>
        );

      case 'thunderstorm':
        return (
          <motion.div
            className='absolute inset-0 bg-yellow-200 opacity-0'
            animate={{
              opacity: [0, 0.3, 0]
            }}
            transition={{
              duration: 0.2,
              repeat: Infinity,
              repeatDelay: Math.random() * 5 + 3
            }}
          />
        );

      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div
        className={cn(
          'w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-100 to-indigo-200 rounded-xl backdrop-blur-sm',
          className
        )}
      >
        <motion.div
          className='flex flex-col items-center gap-3'
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          >
            <RefreshCw className='w-8 h-8 text-blue-600' />
          </motion.div>
          <motion.p
            className='text-sm text-blue-700 font-medium'
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            Loading weather...
          </motion.p>
        </motion.div>
      </div>
    );
  }

  if (!weather) {
    return (
      <div
        className={cn(
          'w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-red-100 to-orange-200 rounded-xl p-4',
          className
        )}
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200 }}
        >
          <Cloud className='w-12 h-12 text-red-400 mb-3' />
        </motion.div>
        <p className='text-sm text-red-600 text-center font-medium'>
          Weather unavailable
        </p>
        <motion.button
          onClick={fetchWeather}
          className='mt-2 px-3 py-1 text-xs bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors'
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          Retry
        </motion.button>
      </div>
    );
  }

  return (
    <motion.div
      className={cn(
        'w-full h-full relative overflow-hidden rounded-xl',
        className
      )}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6 }}
    >
      {/* Animated Background */}
      <div
        className={`absolute inset-0 bg-gradient-to-br ${getBackgroundGradient(
          weather.weatherType,
          weather.isDay
        )}`}
      />

      {/* Glass morphism overlay */}
      <div className='absolute inset-0 bg-white/10 backdrop-blur-sm' />

      {/* Weather animation layer */}
      <div className='absolute inset-0 overflow-hidden'>
        {getAnimatedElements(weather.weatherType)}

        {/* Stars for night time */}
        {!weather.isDay &&
          Array.from({ length: 12 }).map((_, i) => (
            <motion.div
              key={`star-${i}`}
              className='absolute w-1 h-1 bg-white rounded-full'
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 60}%`
              }}
              animate={{
                opacity: [0.3, 1, 0.3],
                scale: [0.5, 1, 0.5]
              }}
              transition={{
                duration: Math.random() * 3 + 2,
                repeat: Infinity,
                delay: Math.random() * 2
              }}
            />
          ))}
      </div>

      {/* Content */}
      <div className='relative z-10 h-full p-4 flex flex-col justify-between text-white'>
        {/* Header */}
        <div className='flex items-start justify-between'>
          <div>
            <motion.div
              className='flex items-center gap-1 text-white/80'
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
              <MapPin className='w-3 h-3' />
              <span
                className={`font-medium ${embedded ? 'text-xs' : 'text-sm'}`}
              >
                {weather.location}
              </span>
            </motion.div>

            <motion.div
              className={`${embedded ? 'text-3xl' : 'text-4xl'} font-bold mt-1`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, type: 'spring', stiffness: 100 }}
            >
              {weather.temperature}°
            </motion.div>

            <motion.div
              className={`${embedded ? 'text-xs' : 'text-sm'} text-white/70`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              Feels like {weather.feelsLike}°
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5, type: 'spring', stiffness: 150 }}
          >
            {getWeatherIcon(weather.weatherType, weather.isDay)}
          </motion.div>
        </div>

        {/* Description */}
        <motion.div
          className='text-center my-2'
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <p
            className={`${
              embedded ? 'text-sm' : 'text-base'
            } text-white/90 capitalize font-medium`}
          >
            {weather.description}
          </p>
        </motion.div>

        {/* Weather details */}
        <motion.div
          className={`grid grid-cols-3 gap-2 ${
            embedded ? 'text-xs' : 'text-sm'
          }`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          <motion.div
            className='flex flex-col items-center bg-white/20 backdrop-blur-sm rounded-lg p-2'
            whileHover={{
              scale: 1.05,
              backgroundColor: 'rgba(255, 255, 255, 0.3)'
            }}
            transition={{ duration: 0.2 }}
          >
            <Droplets className='w-4 h-4 text-blue-200 mb-1' />
            <span className='text-white font-medium'>{weather.humidity}%</span>
            <span className='text-white/60 text-xs'>Humidity</span>
          </motion.div>

          <motion.div
            className='flex flex-col items-center bg-white/20 backdrop-blur-sm rounded-lg p-2'
            whileHover={{
              scale: 1.05,
              backgroundColor: 'rgba(255, 255, 255, 0.3)'
            }}
            transition={{ duration: 0.2 }}
          >
            <Wind className='w-4 h-4 text-gray-200 mb-1' />
            <span className='text-white font-medium'>{weather.windSpeed}</span>
            <span className='text-white/60 text-xs'>km/h</span>
          </motion.div>

          <motion.div
            className='flex flex-col items-center bg-white/20 backdrop-blur-sm rounded-lg p-2'
            whileHover={{
              scale: 1.05,
              backgroundColor: 'rgba(255, 255, 255, 0.3)'
            }}
            transition={{ duration: 0.2 }}
          >
            <Eye className='w-4 h-4 text-purple-200 mb-1' />
            <span className='text-white font-medium'>{weather.visibility}</span>
            <span className='text-white/60 text-xs'>km</span>
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default WeatherCard;
