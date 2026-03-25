'use client';

import { useState, useMemo } from 'react';
import { ApiModuleConfig } from '@/lib/types/api-documentation';
import { EndpointCard } from '../shared/endpoint-card';
import { ErrorResponsesTable } from '../shared/error-responses-table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Search, BookOpen, AlertCircle, Layers } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ApiModuleLayoutProps {
  config: ApiModuleConfig;
  children?: React.ReactNode;
}

export function ApiModuleLayout({ config, children }: ApiModuleLayoutProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Extract unique categories from endpoints
  const categories = useMemo(() => {
    const cats = new Set<string>();
    config.endpoints.forEach((endpoint) => {
      if (endpoint.category) {
        cats.add(endpoint.category);
      }
    });
    return Array.from(cats).sort();
  }, [config.endpoints]);

  // Filter endpoints based on search and category
  const filteredEndpoints = useMemo(() => {
    return config.endpoints.filter((endpoint) => {
      // Search filter
      const matchesSearch = !searchTerm ||
        endpoint.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        endpoint.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        endpoint.path.toLowerCase().includes(searchTerm.toLowerCase()) ||
        endpoint.tags?.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));

      // Category filter
      const matchesCategory = !selectedCategory || endpoint.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [config.endpoints, searchTerm, selectedCategory]);

  return (
    <div className="space-y-8">
      {/* Module Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Layers className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">{config.moduleName} API</h1>
            <p className="text-muted-foreground mt-1">{config.moduleDescription}</p>
          </div>
        </div>

        {/* Base URL */}
        <Card className="bg-muted/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">Base URL:</span>
              <code className="flex-1 bg-background px-3 py-1.5 rounded border font-mono">
                {config.baseUrl}
              </code>
            </div>
          </CardContent>
        </Card>

        {/* Authentication Overview */}
        {config.authenticationOverview && (
          <Card className="border-blue-500/20 bg-blue-500/5">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-blue-500" />
                Authentication
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {config.authenticationOverview}
              </p>
            </CardContent>
          </Card>
        )}

        {/* General Notes */}
        {config.generalNotes && config.generalNotes.length > 0 && (
          <Card className="border-yellow-500/20 bg-yellow-500/5">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-yellow-500" />
                Important Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {config.generalNotes.map((note, index) => (
                  <li key={index} className="text-sm text-muted-foreground flex gap-2">
                    <span>•</span>
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      <Separator />

      {/* Search and Filters */}
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search endpoints by title, description, path, or tags..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Category filters */}
        {categories.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">Filter by category:</span>
            <Badge
              variant={selectedCategory === null ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setSelectedCategory(null)}
            >
              All ({config.endpoints.length})
            </Badge>
            {categories.map((category) => {
              const count = config.endpoints.filter(e => e.category === category).length;
              return (
                <Badge
                  key={category}
                  variant={selectedCategory === category ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => setSelectedCategory(category)}
                >
                  {category} ({count})
                </Badge>
              );
            })}
          </div>
        )}

        {/* Results count */}
        <div className="text-sm text-muted-foreground">
          Showing {filteredEndpoints.length} of {config.endpoints.length} endpoint
          {config.endpoints.length !== 1 ? 's' : ''}
        </div>
      </div>

      <Separator />

      {/* Common Errors (if applicable) */}
      {config.commonErrors && config.commonErrors.length > 0 && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Common Error Responses</CardTitle>
              <CardDescription>
                These error responses apply to all endpoints in this module
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ErrorResponsesTable errors={config.commonErrors} />
            </CardContent>
          </Card>
          <Separator />
        </>
      )}

      {/* Table of Contents */}
      {filteredEndpoints.length > 0 && (
        <>
          <Card className="bg-muted/30">
            <CardHeader>
              <CardTitle className="text-base">Table of Contents</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px] pr-4">
                <div className="space-y-2">
                  {filteredEndpoints.map((endpoint) => (
                    <a
                      key={endpoint.id}
                      href={`#${endpoint.id}`}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors group"
                    >
                      <Badge variant="outline" className="font-mono text-xs">
                        {endpoint.method}
                      </Badge>
                      <div className="flex-1">
                        <div className="text-sm font-medium group-hover:text-primary transition-colors">
                          {endpoint.title}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {endpoint.path}
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
          <Separator />
        </>
      )}

      {/* Endpoints */}
      <div className="space-y-6">
        {filteredEndpoints.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">
                <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No endpoints found</p>
                <p className="text-sm mt-1">
                  Try adjusting your search or filters
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          filteredEndpoints.map((endpoint) => (
            <EndpointCard key={endpoint.id} endpoint={endpoint} />
          ))
        )}
      </div>

      {/* Custom children content */}
      {children && (
        <>
          <Separator />
          {children}
        </>
      )}
    </div>
  );
}
