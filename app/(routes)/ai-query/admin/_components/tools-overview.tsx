'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Wrench,
  Layers,
  Shield,
  AlertTriangle,
} from 'lucide-react';
import {
  TOOL_CATEGORIES,
  AI_QUERY_TOOLS_REGISTRY,
  getToolsCount,
  getTierLabel,
  getTierColor,
  ActionTier,
} from '@/lib/config/ai-query-tools-config';

export function ToolsOverview() {
  const { total, byCategory } = getToolsCount();

  // Count tools by tier
  const byTier = AI_QUERY_TOOLS_REGISTRY.reduce((acc, tool) => {
    acc[tool.tier] = (acc[tool.tier] || 0) + 1;
    return acc;
  }, {} as Record<ActionTier, number>);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Tools</CardTitle>
          <Wrench className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{total}</div>
          <p className="text-xs text-muted-foreground">
            Available AI query tools
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Categories</CardTitle>
          <Layers className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{TOOL_CATEGORIES.length}</div>
          <p className="text-xs text-muted-foreground">
            Module categories
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Read-Only Tools</CardTitle>
          <Shield className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{byTier[1] || 0}</div>
          <p className="text-xs text-muted-foreground">
            Tier 1 - Auto-execute
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Action Tools</CardTitle>
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{(byTier[2] || 0) + (byTier[3] || 0)}</div>
          <p className="text-xs text-muted-foreground">
            Tier 2-3 - Require confirmation
          </p>
        </CardContent>
      </Card>

      {/* Tier Distribution */}
      <Card className="md:col-span-2 lg:col-span-4">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Tools by Action Tier</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {([1, 2, 3, 4] as ActionTier[]).map((tier) => (
              <div
                key={tier}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border"
              >
                <Badge className={getTierColor(tier)}>Tier {tier}</Badge>
                <span className="text-sm font-medium">{byTier[tier] || 0}</span>
                <span className="text-xs text-muted-foreground">
                  {getTierLabel(tier)}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
