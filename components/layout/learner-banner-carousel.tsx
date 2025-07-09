import * as React from 'react';
import Autoplay from 'embla-carousel-autoplay';

import { Card, CardContent } from '@/components/ui/card';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious
} from '@/components/ui/carousel';

export function LearnerBannerCarousel() {
  const plugin = React.useRef(
    Autoplay({ delay: 2000, stopOnInteraction: true })
  );

  // Sample banner data - replace with your actual banner images/content
  const banners = [
    {
      id: 1,
      title: 'Welcome to JKKN',
      subtitle: 'Your learning journey begins here',
      image: '/banner/1.webp',
      bgColor: 'from-blue-500 to-purple-600'
    },
    {
      id: 2,
      title: 'Excellence in Education',
      subtitle: 'Shaping future leaders',
      image: '/banner/2.jpg',
      bgColor: 'from-green-500 to-teal-600'
    },
    {
      id: 3,
      title: 'Innovation & Technology',
      subtitle: 'Stay ahead with modern learning',
      image: '/banner/3.jpg',
      bgColor: 'from-orange-500 to-red-600'
    },
    {
      id: 4,
      title: 'Campus Life',
      subtitle: 'Experience vibrant student life',
      image: '/banner/4.jpg',
      bgColor: 'from-purple-500 to-pink-600'
    },
    {
      id: 5,
      title: 'Research & Development',
      subtitle: 'Advancing knowledge and innovation',
      image: '/banner/5.jpg',
      bgColor: 'from-indigo-500 to-blue-600'
    }
  ];

  return (
    <div className='w-full max-w-7xl mx-auto px-4'>
      <Carousel
        plugins={[plugin.current as any]}
        className='w-full'
        onMouseEnter={plugin.current.stop}
        onMouseLeave={plugin.current.reset}
        opts={{
          align: 'start',
          loop: true,
          slidesToScroll: 1,
          breakpoints: {
            '(min-width: 768px)': {
              slidesToScroll: 2
            },
            '(min-width: 1024px)': {
              slidesToScroll: 3
            }
          }
        }}
      >
        <CarouselContent className='-ml-2 md:-ml-4'>
          {banners.map((banner, index) => (
            <CarouselItem
              key={banner.id}
              className='pl-2 md:pl-4 basis-full md:basis-1/2 lg:basis-1/3'
            >
              <div className='p-1'>
                <Card className='overflow-hidden group hover:shadow-lg transition-all duration-300 hover:scale-[1.02]'>
                  <CardContent className='p-0 relative'>
                    <div
                      className={`relative h-48 bg-gradient-to-br ${banner.bgColor} flex items-center justify-center overflow-hidden`}
                    >
                      {/* Background image with overlay */}
                      <div
                        className='absolute inset-0 bg-cover bg-center opacity-20'
                        style={{ backgroundImage: `url(${banner.image})` }}
                      />

                      {/* Content overlay */}
                      <div className='relative z-10 text-center text-white p-6'>
                        <h3 className='text-xl md:text-2xl font-bold mb-2 group-hover:scale-105 transition-transform duration-300'>
                          {banner.title}
                        </h3>
                        <p className='text-sm md:text-base opacity-90 group-hover:opacity-100 transition-opacity duration-300'>
                          {banner.subtitle}
                        </p>
                      </div>

                      {/* Decorative elements */}
                      <div className='absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-sm'>
                        {index + 1}
                      </div>

                      {/* Gradient overlay for better text readability */}
                      <div className='absolute inset-0 bg-gradient-to-t from-black/30 to-transparent' />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className='hidden md:flex -left-6 lg:-left-8' />
        <CarouselNext className='hidden md:flex -right-6 lg:-right-8' />
      </Carousel>
    </div>
  );
}
