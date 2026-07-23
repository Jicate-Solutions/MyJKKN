'use client';

import { GetPages } from '@/lib/sidebarMenuLink';
import { usePathname } from 'next/navigation';
import { useAdaptiveLabels } from '@/hooks/use-adaptive-labels';

export function PageTitle() {
  const pathname = usePathname();
  const pages = GetPages(pathname);
  const adapt = useAdaptiveLabels();

  const pageTitle = pages.map(({ menus }) => {
    const activeMenu = menus.find((menu) => menu.active);
    const label = activeMenu?.submenus && activeMenu.submenus.length > 0
      ? activeMenu.submenus.find((submenu) => submenu.active)?.label
      : activeMenu?.label ?? '';
    return adapt(label);
  });

  return <h1 className='font-bold'>{pageTitle}</h1>;
}
