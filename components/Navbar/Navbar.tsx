'use client';

import { SheetMenu } from './sheet-menu';
import { Button } from '../ui/button';
import { UserCircle } from 'lucide-react';

interface NavbarProps {
  title: string;
}

export function Navbar({ title }: NavbarProps) {
  return (
    <header className='sticky top-0 z-10 w-full bg-background/95 shadow backdrop-blur supports-[backdrop-filter]:bg-background/60 dark:shadow-secondary'>
      <div className='mx-4 sm:mx-8 flex h-14 items-center justify-between'>
        <div className='flex items-center space-x-4 lg:space-x-0'>
          <SheetMenu />
          <h1 className='font-bold'>{title}</h1>
        </div>
        <div className='flex items-center justify-between space-x-2'>
          <Button variant='ghost'>
            <UserCircle className='mr-2 h-5 w-5' />
            Profile
          </Button>
          <Button variant='destructive'>Log out</Button>
        </div>
      </div>
    </header>
  );
}
