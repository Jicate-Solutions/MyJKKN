'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { useHostelBlocks } from '@/hooks/campus-living/use-hostel-blocks';
import {
  Building2,
  Plus,
  Search,
  Users,
  BedDouble,
  Phone,
  MapPin,
  Loader2,
  ShieldCheck,
  Clock
} from 'lucide-react';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' }> = {
  active: { label: 'Active', variant: 'success' },
  under_maintenance: { label: 'Under Maintenance', variant: 'destructive' },
  closed: { label: 'Closed', variant: 'secondary' },
};

const typeConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  boys: { label: 'Boys', variant: 'default' },
  girls: { label: 'Girls', variant: 'secondary' },
  mixed: { label: 'Mixed', variant: 'outline' },
};

export default function HostelBlocksPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';
  const { data, isLoading } = useHostelBlocks(institutionId);
  const blocks = (data as any)?.data || [] as any[];
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const filteredBlocks = blocks.filter((block: any) => {
    const matchesSearch =
      block.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      block.code?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === 'all' || block.hostel_type === typeFilter;
    return matchesSearch && matchesType;
  });

  if (isLoading) {
    return (
      <ContentLayout title="Hostel Blocks">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Hostel Blocks">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Blocks' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold py-1">Hostel Blocks</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Manage hostel buildings, floors, and wardens
            </p>
          </div>
          <Button asChild>
            <Link href="/campus-living/blocks/new">
              <Plus className="mr-2 h-4 w-4" />
              New Block
            </Link>
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search blocks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            {['all', 'boys', 'girls', 'mixed'].map((type) => (
              <Button
                key={type}
                variant={typeFilter === type ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTypeFilter(type)}
              >
                {type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1)}
              </Button>
            ))}
          </div>
        </div>

        {/* Blocks Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredBlocks.map((block) => {
            const occupancyPercent = block.total_capacity > 0
              ? Math.round((block.current_occupancy / block.total_capacity) * 100)
              : 0;
            const statusCfg = statusConfig[block.status] ?? { label: block.status, variant: 'outline' as const };
            const typeCfg = typeConfig[block.hostel_type] ?? { label: block.hostel_type, variant: 'outline' as const };

            return (
              <Link key={block.id} href={`/campus-living/blocks/${block.id}`}>
                <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{block.name}</CardTitle>
                        <CardDescription className="flex items-center gap-1 mt-1">
                          <MapPin className="h-3 w-3" />
                          {block.address}
                        </CardDescription>
                      </div>
                      <div className="flex gap-1.5">
                        <Badge variant={typeCfg.variant}>{typeCfg.label}</Badge>
                        <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Occupancy Bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Occupancy</span>
                        <span className="font-medium">{block.current_occupancy}/{block.total_capacity} ({occupancyPercent}%)</span>
                      </div>
                      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            occupancyPercent >= 95 ? 'bg-red-500' :
                            occupancyPercent >= 80 ? 'bg-green-500' :
                            occupancyPercent >= 50 ? 'bg-blue-500' :
                            'bg-amber-500'
                          }`}
                          style={{ width: `${occupancyPercent}%` }}
                        />
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-lg font-semibold">{block.total_floors}</p>
                        <p className="text-xs text-muted-foreground">Floors</p>
                      </div>
                      <div>
                        <p className="text-lg font-semibold">{block.total_rooms}</p>
                        <p className="text-xs text-muted-foreground">Rooms</p>
                      </div>
                      <div>
                        <p className="text-lg font-semibold">{block.total_capacity - block.current_occupancy}</p>
                        <p className="text-xs text-muted-foreground">Available</p>
                      </div>
                    </div>

                    {/* Warden & Curfew */}
                    <div className="flex items-center justify-between text-sm border-t pt-3">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        <span>{block.warden_name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        <span>Curfew {block.curfew_time_weekday}</span>
                      </div>
                    </div>

                    {/* Amenities */}
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(block.amenities)
                        .filter(([, available]) => available)
                        .map(([amenity]) => (
                          <Badge key={amenity} variant="outline" className="text-xs capitalize">
                            {amenity.replace('_', ' ')}
                          </Badge>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>

        {filteredBlocks.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No blocks found</p>
              <p className="text-sm text-muted-foreground">
                {searchQuery ? 'Try a different search term' : 'Create your first hostel block to get started'}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
