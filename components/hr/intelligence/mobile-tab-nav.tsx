'use client';

/**
 * Mobile Tab Navigation — responsive dropdown for the 15 intelligence tabs.
 *
 * On viewports < 768px (md), replaces the horizontal TabsList with a
 * Select dropdown. Each option mirrors the tab id + label + icon.
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

interface TabDef {
  readonly id: string;
  readonly label: string;
  readonly icon: React.ElementType;
  readonly ready: boolean;
}

interface MobileTabNavProps {
  tabs: readonly TabDef[];
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function MobileTabNav({ tabs, activeTab, onTabChange }: MobileTabNavProps) {
  const activeTabDef = tabs.find((t) => t.id === activeTab);

  return (
    <div className="block md:hidden w-full">
      <Select value={activeTab} onValueChange={onTabChange}>
        <SelectTrigger className="w-full h-10 text-sm">
          <SelectValue>
            {activeTabDef ? (
              <span className="flex items-center gap-2">
                <activeTabDef.icon className="h-4 w-4 shrink-0" />
                {activeTabDef.label}
              </span>
            ) : (
              'Select a tab'
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <SelectItem key={tab.id} value={tab.id}>
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0" />
                  {tab.label}
                  {!tab.ready && (
                    <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0">
                      Soon
                    </Badge>
                  )}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
