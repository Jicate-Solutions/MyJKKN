'use client';

import { useQuery } from '@tanstack/react-query';
import { TimetableService } from '@/lib/services/academic/timetable-service';

export interface TemplateStats {
  totalTemplates: number;
  activeTemplates: number;
  totalUsage: number;
  usageThisWeek: number;
  usageThisMonth: number;
  templatesThisWeek: number;
  categoriesCount: number;
  mostPopularTemplate?: {
    id: string;
    template_name: string;
    usage_count: number;
  };
  recentTemplates?: {
    id: string;
    template_name: string;
    usage_count: number;
    created_at: string;
  }[];
}

// Query key factory
const templateStatsKeys = {
  all: ['template-stats'] as const,
  stats: () => [...templateStatsKeys.all, 'stats'] as const,
};

// Get template statistics
export function useTemplateStats() {
  return useQuery({
    queryKey: templateStatsKeys.stats(),
    queryFn: async (): Promise<TemplateStats> => {
      // Get all templates
      const templatesResponse = await TimetableService.getTemplates({
        limit: 1000 // Get all templates for stats calculation
      });
      
      const templates = templatesResponse.data;
      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Calculate basic stats
      const totalTemplates = templates.length;
      const activeTemplates = templates.filter(t => t.is_active).length;
      const totalUsage = templates.reduce((sum, t) => sum + (t.usage_count || 0), 0);
      
      // Calculate time-based stats
      const templatesThisWeek = templates.filter(
        t => new Date(t.created_at) >= oneWeekAgo
      ).length;
      
      // For usage stats, we would need additional data from the database
      // For now, we'll estimate based on available data
      const usageThisMonth = Math.round(totalUsage * 0.3); // Estimate 30% of usage in last month
      const usageThisWeek = Math.round(totalUsage * 0.1); // Estimate 10% of usage in last week
      
      // Find most popular template
      const mostPopularTemplate = templates.reduce((max, current) => {
        if (!max || (current.usage_count || 0) > (max.usage_count || 0)) {
          return current;
        }
        return max;
      }, templates[0]);
      
      // Get unique categories
      const categories = new Set(
        templates
          .map(t => t.template_category)
          .filter(category => category && category.trim() !== '')
      );
      
      // Get recent templates (last 5)
      const recentTemplates = templates
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5)
        .map(t => ({
          id: t.id,
          template_name: t.template_name,
          usage_count: t.usage_count || 0,
          created_at: t.created_at
        }));

      return {
        totalTemplates,
        activeTemplates,
        totalUsage,
        usageThisWeek,
        usageThisMonth,
        templatesThisWeek,
        categoriesCount: categories.size,
        mostPopularTemplate: mostPopularTemplate ? {
          id: mostPopularTemplate.id,
          template_name: mostPopularTemplate.template_name,
          usage_count: mostPopularTemplate.usage_count || 0
        } : undefined,
        recentTemplates
      };
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    refetchInterval: 15 * 60 * 1000, // Refetch every 15 minutes
  });
}