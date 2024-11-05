'use client';

import { GetPages } from '@/lib/sidebarMenuLink';
import { usePathname } from 'next/navigation';

export function PageTitle() {
  const pathname = usePathname();
  const pages = GetPages(pathname);

  const pageTitle = pages.map(({ menus }) => {
    const activeMenu = menus.find((menu) => menu.active);
    return activeMenu?.submenus && activeMenu.submenus.length > 0
      ? activeMenu.submenus.find((submenu) => submenu.active)?.label
      : activeMenu?.label ?? '';
  });

  return <h1 className='font-bold'>{pageTitle}</h1>;
}
