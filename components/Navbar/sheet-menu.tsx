import Link from 'next/link';
import { MenuIcon, PanelsTopLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Menu } from './menu';
import {
  Sheet,
  SheetHeader,
  SheetContent,
  SheetTrigger,
  SheetTitle,
  SheetDescription
} from '@/components/ui/sheet';

export function SheetMenu() {
  return (
    <Sheet>
      {/* Hidden on mobile (bottom nav used), visible on md to lg (tablet) */}
      <SheetTrigger className='hidden md:flex lg:hidden' asChild>
        <Button className='h-8' variant='outline' size='icon'>
          <MenuIcon size={20} />
        </Button>
      </SheetTrigger>
      <SheetContent className='sm:w-72 px-3 h-full flex flex-col' side='left'>
        <SheetHeader>
          {/* Radix requires an accessible name and description on every dialog
              surface (a Sheet IS a DialogContent underneath) and logs
              "Missing `Description` or `aria-describedby={undefined}` for
              {DialogContent}" without them. This sheet is mounted on EVERY
              authenticated page, so the warning fired on every page load. Both
              are sr-only: the visible branding below already names the panel
              for sighted users, so announcing it twice would be worse, not
              better. */}
          <SheetTitle className='sr-only'>Navigation menu</SheetTitle>
          <SheetDescription className='sr-only'>
            Browse the MyJKKN sections you have access to.
          </SheetDescription>
          <Button
            className='flex justify-center items-center pb-2 pt-1'
            variant='link'
            asChild
          >
            <Link href='/' className='flex items-center gap-2'>
              <PanelsTopLeft className='w-6 h-6 mr-1' />
              <h1 className='font-bold text-lg'>MyJKKN</h1>
            </Link>
          </Button>
        </SheetHeader>
        <Menu isOpen />
      </SheetContent>
    </Sheet>
  );
}
