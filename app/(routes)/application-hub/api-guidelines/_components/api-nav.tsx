'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { BookOpen, FileJson } from 'lucide-react';

const navItems = [
  {
    title: 'Getting Started',
    href: '/application-hub/api-guidelines',
    icon: BookOpen
  },
  {
    title: 'Available Endpoints',
    href: '/application-hub/api-guidelines/endpoints',
    icon: FileJson
  }
];

export function ApiNav() {
  const pathname = usePathname();

  return (
    <div className='mb-8 flex items-center space-x-4 lg:space-x-6'>
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href;

        return (
          <Button
            key={item.href}
            variant={isActive ? 'default' : 'ghost'}
            asChild
          >
            <Link href={item.href}>
              <Icon className='mr-2 h-4 w-4' />
              {item.title}
            </Link>
          </Button>
        );
      })}
    </div>
  );
}
