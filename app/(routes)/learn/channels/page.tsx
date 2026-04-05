'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useChannels } from '@/hooks/pde/use-pde-phase2';
import { BeatLoader } from 'react-spinners';
import {
  MessageSquare,
  Hash,
  HelpCircle,
  Sparkles,
  Search,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PDEChannel, ChannelType } from '@/types/pde';
import { formatDistanceToNow } from 'date-fns';

// ============================================
// Constants
// ============================================

const CHANNEL_TYPE_CONFIG: Record<ChannelType, { label: string; color: string; icon: typeof Hash }> = {
  quest: {
    label: 'Quest',
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
    icon: Hash,
  },
  capability: {
    label: 'Capability',
    color: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300',
    icon: Hash,
  },
  course: {
    label: 'Course',
    color: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    icon: Hash,
  },
  showcase: {
    label: 'Showcase',
    color: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300',
    icon: Sparkles,
  },
  help: {
    label: 'Help',
    color: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
    icon: HelpCircle,
  },
};

const TAB_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'quest', label: 'Quest Channels' },
  { value: 'help', label: 'Help' },
  { value: 'showcase', label: 'Showcase' },
];

// ============================================
// Channel Card
// ============================================

function ChannelCard({ channel }: { channel: PDEChannel & { message_count?: number; last_activity?: string } }) {
  const config = CHANNEL_TYPE_CONFIG[channel.channel_type] || CHANNEL_TYPE_CONFIG.course;
  const Icon = config.icon;

  return (
    <Link href={`/learn/channels/${channel.id}`}>
      <Card className="hover:bg-muted/50 transition-colors cursor-pointer border-l-4"
        style={{ borderLeftColor: channel.channel_type === 'help' ? '#ef4444' : channel.channel_type === 'showcase' ? '#22c55e' : '#3b82f6' }}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="mt-0.5 shrink-0">
                <Icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-medium truncate">{channel.name}</h3>
                  <Badge variant="outline" className={cn('text-xs', config.color)}>
                    {config.label}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" />
                    {channel.message_count ?? 0} messages
                  </span>
                  {channel.last_activity && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(channel.last_activity), { addSuffix: true })}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ============================================
// Main Page
// ============================================

export default function ChannelsPage() {
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');

  const { data: channels, isLoading } = useChannels();

  const filtered = useMemo(() => {
    if (!channels) return [];
    let list = channels;
    if (tab !== 'all') {
      list = list.filter((c: PDEChannel) => c.channel_type === tab);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c: PDEChannel) => c.name.toLowerCase().includes(q));
    }
    return list;
  }, [channels, tab, search]);

  return (
    <ContentLayout title="Community Channels">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learn', href: '/learn/quests' },
          { label: 'Channels' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold py-1">Community Channels</h1>
          <p className="text-sm text-muted-foreground">
            Real-time collaboration: quest discussions, help requests, and showcases
          </p>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search channels..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Tabs + Content */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            {TAB_FILTERS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={tab} className="mt-4">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <BeatLoader color="#00e902" />
              </div>
            ) : filtered.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <MessageSquare className="h-12 w-12 text-muted-foreground/40 mb-4" />
                  <p className="text-muted-foreground">
                    {search ? 'No channels match your search' : 'No channels available yet'}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {filtered.map((channel: PDEChannel) => (
                  <ChannelCard key={channel.id} channel={channel} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}
