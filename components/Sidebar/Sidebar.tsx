import { cn } from '@/lib/utils';
import { useStore } from '@/hooks/use-store';
import { Button } from '@/components/ui/button';
import { SidebarToggle } from './sidebar-toggle';
import { Menu } from '../Navbar/menu';
import { useSidebarToggle } from '@/hooks/use-sidebar-toggle';
import Link from 'next/link';
import Image from 'next/image';

const Sidebar = () => {
  const sidebars = useStore(useSidebarToggle, (state) => state);

  return (
    <aside
      className={cn(
        'fixed top-0 left-0 z-20 h-screen -translate-x-full lg:translate-x-0 transition-[width] ease-in-out duration-300 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700',
        sidebars?.isOpen === false ? 'w-[90px]' : 'w-72'
      )}
    >
      <SidebarToggle
        isOpen={sidebars?.isOpen}
        setIsOpen={sidebars?.setIsOpen}
      />
      <div className='relative h-full flex flex-col px-3 py-4 overflow-y-auto shadow-md dark:shadow-zinc-800'>
        <Button
          className={cn(
            'transition-transform ease-in-out duration-300 mb-1',
            sidebars?.isOpen === false ? 'translate-x-1' : 'translate-x-0'
          )}
          variant='link'
          asChild
        >
          <Link href='/' className='flex items-center gap-2'>
            <Image
              src='/logo.png'
              alt='MYJKKN Logo'
              width={32}
              height={32}
              className='mr-1 rounded-sm'
            />
            <h1
              className={cn(
                'font-bold text-md text-green-700 whitespace-nowrap transition-[transform,opacity,display] ease-in-out duration-300',
                'text-sidebar-foreground',
                sidebars?.isOpen === false
                  ? '-translate-x-96 opacity-0 hidden'
                  : 'translate-x-0 opacity-100'
              )}
            >
              MYJKKN
            </h1>
          </Link>
        </Button>
        <Menu isOpen={sidebars?.isOpen} />
      </div>
    </aside>
  );
};

export default Sidebar;
