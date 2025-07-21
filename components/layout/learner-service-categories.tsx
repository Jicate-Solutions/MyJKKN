'use client';

import { useRouter } from 'next/navigation';

import {
  User,
  Clock,
  CreditCard,
  FileText,
  Calendar,
  GraduationCap,
  BookOpen,
  Award,
  MessageSquare,
  Settings,
  LayoutDashboard,
  Megaphone
} from 'lucide-react';

interface ServiceCategory {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  href: string;
}

export function LearnerServiceCategories() {
  const router = useRouter();

  const primaryServices: ServiceCategory[] = [
    {
      id: 'profile',
      title: 'Profile',
      description: 'View your profile information',
      icon: User,
      color: 'text-blue-600',
      href: '/learner/profile'
    },
    {
      id: 'attendance',
      title: 'Attendance',
      description: 'Track your attendance',
      icon: Calendar,
      color: 'text-yellow-600',
      href: '/learner/attendance'
    },
    {
      id: 'apps',
      title: 'Apps',
      description: 'View your apps',
      icon: LayoutDashboard,
      color: 'text-green-600',
      href: '/learner/apps'
    },
    {
      id: 'time-table',
      title: 'Time Table',
      description: 'View your time table',
      icon: Clock,
      color: 'text-red-600',
      href: '/learner/time-table'
    },
    {
      id: 'notify',
      title: 'Notify',
      description: 'View your notifications',
      icon: Megaphone,
      color: 'text-purple-600',
      href: '/learner/notify'
    },
    {
      id: 'billing',
      title: 'Billing',
      description: 'View your billing',
      icon: CreditCard,
      color: 'text-orange-600',
      href: '/learner/billing'
    }
  ];

  const handleServiceClick = (href: string) => {
    router.push(href);
  };

  const ServiceCard = ({ service }: { service: ServiceCategory }) => {
    const Icon = service.icon;

    return (
      <div
        className='cursor-pointer group'
        onClick={() => handleServiceClick(service.href)}
      >
        <div className='flex flex-col items-center text-center space-y-3'>
          {/* Animated Icon Container */}
          <div className='relative'>
            {/* Animated Background Bubbles */}
            <div className='absolute inset-0 rounded-full bg-gradient-to-r from-blue-100 to-purple-100 opacity-0 group-hover:opacity-100 transition-opacity duration-300 animate-pulse' />
            <div className='absolute inset-0 rounded-full bg-gradient-to-r from-pink-100 to-yellow-100 opacity-0 group-hover:opacity-70 transition-opacity duration-500 animate-ping' />

            {/* Glassmorphism Container */}
            <div className='relative w-14 h-14 rounded-full bg-white/80 backdrop-blur-sm border border-white/20 shadow-xl flex items-center justify-center group-hover:scale-110 group-hover:shadow-2xl transition-all duration-300'>
              {/* Inner Glow Effect */}
              <div className='absolute inset-2 rounded-full bg-gradient-to-r from-white/40 to-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300' />

              {/* Icon */}
              <Icon
                className={`h-7 w-7 ${service.color} relative z-10 group-hover:scale-110 transition-transform duration-300`}
              />

              {/* Floating Particles */}
              <div className='absolute -top-1 -right-1 w-2 h-2 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full opacity-0 group-hover:opacity-100 group-hover:animate-bounce transition-all duration-300' />
              <div className='absolute -bottom-1 -left-1 w-1.5 h-1.5 bg-gradient-to-r from-pink-400 to-yellow-400 rounded-full opacity-0 group-hover:opacity-100 group-hover:animate-bounce transition-all duration-500' />
              <div className='absolute top-0 left-0 w-1 h-1 bg-gradient-to-r from-green-400 to-blue-400 rounded-full opacity-0 group-hover:opacity-100 group-hover:animate-ping transition-all duration-700' />
            </div>

            {/* Ripple Effect */}
            <div className='absolute inset-0 rounded-full border-2 border-blue-200 opacity-0 group-hover:opacity-100 group-hover:scale-150 transition-all duration-700' />
            <div className='absolute inset-0 rounded-full border border-purple-200 opacity-0 group-hover:opacity-100 group-hover:scale-125 transition-all duration-500' />
          </div>

          {/* Service Title */}
          <div className='space-y-1'>
            <h3 className='font-semibold text-sm text-gray-800 group-hover:text-gray-900 transition-colors duration-200'>
              {service.title}
            </h3>
            <div className='w-0 h-0.5 bg-gradient-to-r from-blue-500 to-purple-500 group-hover:w-full transition-all duration-300 mx-auto rounded-full' />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className='px-4 py-6'>
      {/* Background Pattern */}
      <div className='absolute inset-0 opacity-5'>
        <div className='absolute top-10 left-10 w-32 h-32 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full blur-3xl animate-pulse' />
        <div className='absolute bottom-10 right-10 w-40 h-40 bg-gradient-to-r from-pink-500 to-yellow-500 rounded-full blur-3xl animate-pulse' />
      </div>

      <div className='relative'>
        {/* Section Header */}
        <div className='mb-6'>
          <h2 className='text-lg font-semibold text-gray-800 mb-2'>Services</h2>
          <div className='w-12 h-1 bg-gradient-to-r from-green-500 to-blue-500 rounded-full' />
        </div>

        {/* Services Grid */}
        <div className='grid grid-cols-3 lg:grid-cols-4 gap-8'>
          {primaryServices.map((service) => (
            <ServiceCard key={service.id} service={service} />
          ))}
        </div>
      </div>
    </div>
  );
}
