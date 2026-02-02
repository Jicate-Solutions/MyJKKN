// app/(routes)/process-excellence/layout.tsx
// Layout for Process Excellence module - TIMWOOD waste tracking & value-add analysis

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import {
  LayoutDashboard,
  FileText,
  ClipboardCheck,
  AlertTriangle,
  BarChart3
} from 'lucide-react';

const processExcellenceNavItems = [
  {
    title: 'Dashboard',
    href: '/process-excellence',
    icon: LayoutDashboard,
    description: 'Overview & metrics'
  },
  {
    title: 'Definitions',
    href: '/process-excellence/definitions',
    icon: FileText,
    description: 'Process templates'
  },
  {
    title: 'Audits',
    href: '/process-excellence/audits',
    icon: ClipboardCheck,
    description: 'Process audits'
  },
  {
    title: 'Waste',
    href: '/process-excellence/waste',
    icon: AlertTriangle,
    description: 'TIMWOOD incidents'
  },
  {
    title: 'Metrics',
    href: '/process-excellence/metrics',
    icon: BarChart3,
    description: 'Analytics & trends'
  }
];

export default function ProcessExcellenceLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // Determine breadcrumb based on current path
  const getBreadcrumbItems = () => {
    const items = [
      { label: 'Home', href: '/' },
      { label: 'Process Excellence', href: '/process-excellence' }
    ];

    if (pathname.includes('/definitions')) {
      items.push({ label: 'Definitions', href: '/process-excellence/definitions' });
    } else if (pathname.includes('/audits')) {
      items.push({ label: 'Audits', href: '/process-excellence/audits' });
    } else if (pathname.includes('/waste')) {
      items.push({ label: 'Waste', href: '/process-excellence/waste' });
    } else if (pathname.includes('/metrics')) {
      items.push({ label: 'Metrics', href: '/process-excellence/metrics' });
    } else if (pathname.includes('/instances')) {
      items.push({ label: 'Instances', href: '/process-excellence/instances' });
    }

    return items;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Breadcrumb */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container px-4 py-3">
          <PageBreadcrumb items={getBreadcrumbItems()} />
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b">
        <div className="container px-4">
          <nav className="flex gap-1 overflow-x-auto pb-px">
            {processExcellenceNavItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== '/process-excellence' &&
                  pathname.startsWith(item.href));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'group relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap',
                    'hover:text-foreground',
                    isActive
                      ? 'text-foreground'
                      : 'text-muted-foreground'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.title}</span>
                  {isActive && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="container px-4 py-6">
        {children}
      </main>
    </div>
  );
}
