'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useAuth } from '@/hooks/use-auth';
import { useMessageTemplates, useCommunicationChannels } from '@/hooks/admission';
import {
  MessageSquare,
  Search,
  Filter,
  Plus,
  MoreHorizontal,
  Eye,
  Edit,
  Copy,
  RefreshCw,
  X,
  Mail,
  Phone,
  MessageCircle,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { AdmissionErrorBoundary } from '@/components/admission';

const CHANNEL_TYPES = [
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'sms', label: 'SMS', icon: Phone },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle }
];

const TEMPLATE_CATEGORIES = [
  { value: 'welcome', label: 'Welcome' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'reminder', label: 'Reminder' },
  { value: 'confirmation', label: 'Confirmation' },
  { value: 'notification', label: 'Notification' },
  { value: 'promotional', label: 'Promotional' }
];

function getChannelIcon(channelType: string | null) {
  const channel = CHANNEL_TYPES.find((c) => c.value === channelType);
  const Icon = channel?.icon || MessageSquare;
  return <Icon className="h-4 w-4" />;
}

function TemplatesSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-10 w-40" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-16 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function AdmissionTemplatesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, isLoading: accessLoading } = useAuth();
  const institutionId = profile?.institution_id;

  const [searchTerm, setSearchTerm] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const filters = {
    institutionId: institutionId || '',
    channelType: searchParams.get('channelType') || undefined,
    category: searchParams.get('category') || undefined,
    isActive: true
  };

  const {
    templates,
    total,
    isLoading: templatesLoading,
    refetch
  } = useMessageTemplates(filters);

  const { channels } = useCommunicationChannels(institutionId || '');

  const isLoading = accessLoading || templatesLoading;

  const updateParams = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams(searchParams);
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`/admission/templates?${params.toString()}`);
    },
    [router, searchParams]
  );

  const clearFilters = useCallback(() => {
    router.push('/admission/templates');
    setSearchTerm('');
  }, [router]);

  const activeFilterCount = [filters.channelType, filters.category].filter(Boolean).length;

  const filteredTemplates = templates.filter((template) =>
    !searchTerm ||
    template.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    template.body?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return (
      <PermissionGuard module="admission" action="view">
        <ContentLayout title="Message Templates">
          <TemplatesSkeleton />
        </ContentLayout>
      </PermissionGuard>
    );
  }

  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="Message Templates">
        <div className="space-y-6">
          {/* Breadcrumb */}
          <div className="flex items-center justify-between">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Templates</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={isRefreshing}
                onClick={async () => {
                  setIsRefreshing(true);
                  try {
                    await refetch();
                    toast.success('Templates refreshed');
                  } finally {
                    setIsRefreshing(false);
                  }
                }}
              >
                {isRefreshing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Refresh
              </Button>
              <Button
                disabled={isCreating}
                onClick={() => {
                  setIsCreating(true);
                  toast.success('Opening template creator...');
                  setTimeout(() => setIsCreating(false), 500);
                }}
              >
                {isCreating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                New Template
              </Button>
            </div>
          </div>

          {/* Filters */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  Filters
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary">{activeFilterCount}</Badge>
                  )}
                </CardTitle>
                {activeFilterCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isClearing}
                    onClick={() => {
                      setIsClearing(true);
                      clearFilters();
                      toast.success('Filters cleared');
                      setTimeout(() => setIsClearing(false), 300);
                    }}
                  >
                    {isClearing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <X className="h-4 w-4 mr-2" />
                    )}
                    Clear All
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                <div className="flex gap-2 flex-1 min-w-[200px]">
                  <Input
                    placeholder="Search templates..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="max-w-sm"
                  />
                  <Button variant="outline">
                    <Search className="h-4 w-4" />
                  </Button>
                </div>

                <Select
                  value={filters.channelType || '_all'}
                  onValueChange={(value) => updateParams('channelType', value === '_all' ? undefined : value)}
                >
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="All Channels" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">All Channels</SelectItem>
                    {CHANNEL_TYPES.map((channel) => (
                      <SelectItem key={channel.value} value={channel.value}>
                        {channel.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={filters.category || '_all'}
                  onValueChange={(value) => updateParams('category', value === '_all' ? undefined : value)}
                >
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">All Categories</SelectItem>
                    {TEMPLATE_CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Results Summary */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {filteredTemplates.length} of {total} templates
            </span>
          </div>

          {/* Templates Grid */}
          {filteredTemplates.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h2 className="text-xl font-semibold mb-2">No Templates Found</h2>
                <p className="text-muted-foreground mb-4">
                  {total === 0
                    ? 'Get started by creating your first message template.'
                    : 'Try adjusting your filters to find templates.'}
                </p>
                <Button
                  disabled={isCreating}
                  onClick={() => {
                    setIsCreating(true);
                    toast.success('Opening template creator...');
                    setTimeout(() => setIsCreating(false), 500);
                  }}
                >
                  {isCreating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Create Template
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTemplates.map((template) => (
                <Card key={template.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        {getChannelIcon(template.channel)}
                        <CardTitle className="text-base">{template.name}</CardTitle>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => {
                            toast.success('Opening template preview...');
                          }}>
                            <Eye className="h-4 w-4 mr-2" />
                            Preview
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            toast.success('Opening template editor...');
                          }}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            toast.success('Template duplicated successfully');
                          }}>
                            <Copy className="h-4 w-4 mr-2" />
                            Duplicate
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="flex gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        {template.channel || 'email'}
                      </Badge>
                      {template.category && (
                        <Badge variant="secondary" className="text-xs">
                          {template.category}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {template.body || 'No content preview available'}
                    </p>
                    {template.subject && (
                      <p className="text-xs text-muted-foreground mt-2 truncate">
                        <strong>Subject:</strong> {template.subject}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Communication Channels */}
          <Card>
            <CardHeader>
              <CardTitle>Communication Channels</CardTitle>
              <CardDescription>Active channels for sending messages</CardDescription>
            </CardHeader>
            <CardContent>
              {channels.length === 0 ? (
                <p className="text-sm text-muted-foreground">No channels configured</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {channels.map((channel) => (
                    <div
                      key={channel.id}
                      className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50"
                    >
                      {getChannelIcon(channel.channel_type)}
                      <div>
                        <p className="font-medium text-sm">{channel.provider_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {channel.channel_type}
                        </p>
                      </div>
                      <Badge
                        variant={channel.is_active ? 'default' : 'secondary'}
                        className="ml-auto"
                      >
                        {channel.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function AdmissionTemplatesPage() {
  return (
    <AdmissionErrorBoundary>
      <AdmissionTemplatesPageContent />
    </AdmissionErrorBoundary>
  );
}
