'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  GraduationCap,
  CreditCard,
  Users,
  UserCog,
  Building2,
  LayoutDashboard,
  Bell,
  Zap,
  LucideIcon,
} from 'lucide-react';
import { ToolCard } from './tool-card';
import {
  AIQueryToolConfig,
  ToolCategoryInfo,
} from '@/lib/config/ai-query-tools-config';

const iconMap: Record<string, LucideIcon> = {
  GraduationCap,
  CreditCard,
  Users,
  UserCog,
  Building2,
  LayoutDashboard,
  Bell,
  Zap,
};

interface CategorySectionProps {
  category: ToolCategoryInfo;
  tools: AIQueryToolConfig[];
}

export function CategorySection({ category, tools }: CategorySectionProps) {
  const Icon = iconMap[category.icon] || Users;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${category.color} text-white`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">{category.label}</h2>
            <Badge variant="secondary">{tools.length} tools</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{category.description}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {tools.map((tool) => (
          <ToolCard key={tool.name} tool={tool} />
        ))}
      </div>
    </div>
  );
}
