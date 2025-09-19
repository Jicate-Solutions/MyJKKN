'use client';

import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, Play, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';

interface SlideItem {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  category: string;
  date: string;
}

// Static images from public/banner folder - will be dynamic in the future
const staticSlides: SlideItem[] = [
  {
    id: '1',
    title: 'Welcome to New Academic Year 2024-25',
    description:
      'Exciting opportunities await as we begin another year of learning and growth together.',
    imageUrl: '/banner/1.webp',
    category: 'Announcement',
    date: 'Today'
  },
  {
    id: '2',
    title: 'Campus Cultural Fest 2024',
    description:
      'Join us for three days of cultural celebrations, competitions, and performances.',
    imageUrl: '/banner/2.jpg',
    category: 'Event',
    date: '2 days ago'
  },
  {
    id: '3',
    title: 'Innovation Lab Opening',
    description:
      'State-of-the-art technology lab now open for all students to explore and create.',
    imageUrl: '/banner/3.jpg',
    category: 'Facility',
    date: '1 week ago'
  },
  {
    id: '4',
    title: 'Sports Championship Winners',
    description:
      'Congratulations to our students for winning the inter-college sports championship.',
    imageUrl: '/banner/4.jpg',
    category: 'Achievement',
    date: '2 weeks ago'
  },
  {
    id: '5',
    title: 'Research Excellence Award',
    description:
      'Our faculty receives prestigious award for groundbreaking research in technology.',
    imageUrl: '/banner/2.jpg',
    category: 'Research',
    date: '3 weeks ago'
  },
  {
    id: '6',
    title: 'Library Digital Transformation',
    description:
      'Enhanced digital resources and study spaces now available in the main library.',
    imageUrl: '/banner/3.jpg',
    category: 'Facility',
    date: '1 month ago'
  }
];

export function LearnerImageSlider() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout>();

  // Handle screen size changes
  useEffect(() => {
    const checkScreenSize = () => {
      const mobile = window.innerWidth < 1024;
      if (mobile !== isMobile) {
        setIsMobile(mobile);
        setCurrentIndex(0); // Reset to first slide when screen size changes
      }
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);

    return () => window.removeEventListener('resize', checkScreenSize);
  }, [isMobile]);

  // Auto-scroll functionality - responsive slides
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setCurrentIndex(
        (prevIndex) => (prevIndex + 1) % getTotalSlides()
      );
    }, 5000); // Change slide every 5 seconds

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isMobile]);

  const nextSlide = () => {
    const total = getTotalSlides();
    setCurrentIndex((prevIndex) => (prevIndex + 1) % total);
  };

  const prevSlide = () => {
    const total = getTotalSlides();
    setCurrentIndex((prevIndex) => (prevIndex - 1 + total) % total);
  };

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
  };

  const getCurrentSlides = () => {
    const slidesPerPage = isMobile ? 1 : 3;
    const startIndex = currentIndex * slidesPerPage;
    return staticSlides.slice(startIndex, startIndex + slidesPerPage);
  };

  const getTotalSlides = () => {
    return Math.ceil(staticSlides.length / (isMobile ? 1 : 3));
  };

  const totalSlides = getTotalSlides();

  const getCategoryColor = (category: string) => {
    const colors = {
      Announcement: 'bg-blue-100 text-blue-700',
      Event: 'bg-green-100 text-green-700',
      Facility: 'bg-purple-100 text-purple-700',
      Achievement: 'bg-orange-100 text-orange-700',
      Research: 'bg-red-100 text-red-700'
    };
    return (
      colors[category as keyof typeof colors] || 'bg-gray-100 text-gray-700'
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className='space-y-4'
    >
      {/* Header */}
      <div className='flex items-center justify-between'>
        <div>
          <h2 className='text-xl font-bold text-gray-900'>Campus Highlights</h2>
          <p className='text-sm text-gray-600'>
            Stay updated with latest news and events
          </p>
        </div>
        <div className='flex items-center gap-2'>
          {/* Navigation Buttons */}
          <Button
            variant='ghost'
            size='sm'
            onClick={prevSlide}
            className='h-8 w-8 p-0'
          >
            <ChevronLeft className='h-4 w-4' />
          </Button>
          <Button
            variant='ghost'
            size='sm'
            onClick={nextSlide}
            className='h-8 w-8 p-0'
          >
            <ChevronRight className='h-4 w-4' />
          </Button>
        </div>
      </div>

      {/* Slider Container */}
      <div className='relative overflow-hidden'>
        <motion.div
          key={currentIndex}
          initial={{ x: 50 }}
          animate={{ x: 0 }}
          exit={{ x: -50 }}
          transition={{ duration: 0.5 }}
          className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6'
        >
          {getCurrentSlides().map((slide, index) => (
            <div
              key={slide.id}
            >
              <Card className='group overflow-hidden border-0 shadow-sm hover:shadow-lg transition-all duration-300 cursor-pointer'>
                <div className='relative h-48 sm:h-56 overflow-hidden'>
                  <Image
                    src={slide.imageUrl}
                    alt={slide.title}
                    fill
                    className='object-cover group-hover:scale-105 transition-transform duration-300'
                    sizes='(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw'
                  />

                  {/* Overlay */}
                  <div className='absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent' />

                  {/* Category Badge */}
                  <div className='absolute top-3 left-3'>
                    <span
                      className={`text-xs px-2 py-1 rounded-full font-medium ${getCategoryColor(
                        slide.category
                      )}`}
                    >
                      {slide.category}
                    </span>
                  </div>

                  {/* Date */}
                  <div className='absolute top-3 right-3'>
                    <span className='text-xs px-2 py-1 rounded-full bg-white/20 text-white backdrop-blur-sm'>
                      {slide.date}
                    </span>
                  </div>
                </div>

                <CardContent className='p-4'>
                  <h3 className='font-semibold text-gray-900 mb-2 line-clamp-1 group-hover:text-blue-600 transition-colors'>
                    {slide.title}
                  </h3>
                  <p className='text-sm text-gray-600 line-clamp-2 leading-relaxed'>
                    {slide.description}
                  </p>
                </CardContent>
              </Card>
            </div>
          ))}
        </motion.div>
      </div>

      {/* Slide Indicators */}
      <div className='flex items-center justify-center space-x-2'>
        {Array.from({ length: totalSlides }).map((_, index) => (
          <button
            key={index}
            onClick={() => goToSlide(index)}
            className={`w-2 h-2 rounded-full transition-all duration-200 ${
              index === currentIndex
                ? 'bg-blue-600 w-6'
                : 'bg-gray-300 hover:bg-gray-400'
            }`}
          />
        ))}
      </div>

    </motion.div>
  );
}
