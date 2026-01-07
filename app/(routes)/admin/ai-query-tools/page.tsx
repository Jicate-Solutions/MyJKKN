'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Search,
  Bot,
  ShieldAlert,
  Loader2,
  Filter,
} from 'lucide-react';
import { ToolsOverview } from './_components/tools-overview';
import { CategorySection } from './_components/category-section';
import { ToolCard } from './_components/tool-card';
import {
  TOOL_CATEGORIES,
  AI_QUERY_TOOLS_REGISTRY,
  getToolsByCategory,
  ToolCategory,
  ActionTier,
} from '@/lib/config/ai-query-tools-config';

function AccessDenied() {
  return (
    <ContentLayout title="Access Denied">
      <Card className="max-w-md mx-auto mt-20">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="p-4 bg-destructive/10 rounded-full">
              <ShieldAlert className="h-12 w-12 text-destructive" />
            </div>
            <h2 className="text-xl font-semibold">Access Denied</h2>
            <p className="text-muted-foreground">
              This page is only accessible to Super Administrators.
              Please contact your system administrator if you believe this is an error.
            </p>
          </div>
        </CardContent>
      </Card>
    </ContentLayout>
  );
}

function LoadingState() {
  return (
    <ContentLayout title="AI Query Tools">
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    </ContentLayout>
  );
}

function AIQueryToolsContent() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedTier, setSelectedTier] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'categories' | 'all'>('categories');

  // Filter tools based on search and filters
  const filteredTools = AI_QUERY_TOOLS_REGISTRY.filter((tool) => {
    const matchesSearch =
      searchQuery === '' ||
      tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.description.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      selectedCategory === 'all' || tool.category === selectedCategory;

    const matchesTier =
      selectedTier === 'all' || tool.tier === parseInt(selectedTier);

    return matchesSearch && matchesCategory && matchesTier;
  });

  // Group filtered tools by category
  const toolsByCategory = TOOL_CATEGORIES.map((category) => ({
    category,
    tools: filteredTools.filter((tool) => tool.category === category.key),
  })).filter((group) => group.tools.length > 0);

  return (
    <ContentLayout title="AI Query Tools Registry">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 rounded-lg">
            <Bot className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">AI Query Tools Registry</h1>
            <p className="text-muted-foreground">
              Complete documentation of all available AI query tools organized by module
            </p>
          </div>
          <Badge variant="outline" className="ml-auto">
            Super Admin Only
          </Badge>
        </div>

        {/* Recent Improvements Banner */}
        <Card className="border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Bot className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-green-900 dark:text-green-100 mb-2">
                  ✨ Enhanced AI Query Responses (Updated: Jan 7, 2026)
                </h3>
                <p className="text-sm text-green-800 dark:text-green-200 mb-3">
                  All learner and admission query tools now return <strong>complete name mappings</strong> instead of IDs, enabling more meaningful AI responses:
                </p>
                <div className="grid md:grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="font-medium text-green-900 dark:text-green-100 mb-1">Now Returns:</div>
                    <ul className="space-y-1 text-green-700 dark:text-green-300">
                      <li>✓ Institution name, Department name</li>
                      <li>✓ Program name, Semester name, Section name</li>
                      <li>✓ Degree name, Academic year, Batch name</li>
                      <li>✓ Regulation details (year + code)</li>
                    </ul>
                  </div>
                  <div>
                    <div className="font-medium text-green-900 dark:text-green-100 mb-1">Benefits:</div>
                    <ul className="space-y-1 text-green-700 dark:text-green-300">
                      <li>✓ Statistics show actual names, not "Department 1"</li>
                      <li>✓ AI provides clear, human-readable answers</li>
                      <li>✓ Complete academic context for every query</li>
                      <li>✓ Better insights from admission analytics</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Overview Stats */}
        <ToolsOverview />

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search tools by name or description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {TOOL_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.key} value={cat.key}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedTier} onValueChange={setSelectedTier}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Tier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tiers</SelectItem>
                  <SelectItem value="1">Tier 1 - Read-Only</SelectItem>
                  <SelectItem value="2">Tier 2 - Confirmation</SelectItem>
                  <SelectItem value="3">Tier 3 - Bulk</SelectItem>
                  <SelectItem value="4">Tier 4 - Blocked</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Active Filters */}
            {(searchQuery || selectedCategory !== 'all' || selectedTier !== 'all') && (
              <div className="flex items-center gap-2 mt-4">
                <span className="text-sm text-muted-foreground">
                  Showing {filteredTools.length} of {AI_QUERY_TOOLS_REGISTRY.length} tools
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('all');
                    setSelectedTier('all');
                  }}
                >
                  Clear filters
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* View Mode Tabs */}
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'categories' | 'all')}>
          <TabsList>
            <TabsTrigger value="categories">By Category</TabsTrigger>
            <TabsTrigger value="all">All Tools</TabsTrigger>
          </TabsList>

          <TabsContent value="categories" className="space-y-8 mt-6">
            {toolsByCategory.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">
                  No tools match your search criteria.
                </CardContent>
              </Card>
            ) : (
              toolsByCategory.map(({ category, tools }) => (
                <CategorySection
                  key={category.key}
                  category={category}
                  tools={tools}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="all" className="mt-6">
            {filteredTools.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">
                  No tools match your search criteria.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredTools.map((tool) => (
                  <ToolCard key={tool.name} tool={tool} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}

export default function AIQueryToolsPage() {
  return (
    <SuperAdminOnly
      fallback={<AccessDenied />}
      loading={<LoadingState />}
    >
      <AIQueryToolsContent />
    </SuperAdminOnly>
  );
}
