'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import {
  Users,
  Plus,
  Search,
  ExternalLink,
  AlertCircle,
  Loader2,
  Star,
  Mail,
  Phone,
} from 'lucide-react';
import { useIndustryMentors } from '@/hooks/cdc/use-cdc-industry-mentors';
import type { IndustryMentor } from '@/types/cdc/industry-mentors';

function MentorCard({ mentor }: { mentor: IndustryMentor }) {
  const initials = mentor.mentor_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Avatar className="h-12 w-12 shrink-0">
            {mentor.profile_photo_url && (
              <AvatarImage src={mentor.profile_photo_url} alt={mentor.mentor_name} />
            )}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link
                  href={`/cdc/industry-mentors/${mentor.id}`}
                  className="font-medium text-sm hover:underline"
                >
                  {mentor.mentor_name}
                </Link>
                {mentor.designation && (
                  <p className="text-xs text-muted-foreground truncate">
                    {mentor.designation}
                    {mentor.company_name && ` · ${mentor.company_name}`}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!mentor.is_active && (
                  <Badge variant="secondary" className="text-xs">Inactive</Badge>
                )}
                {mentor.is_verified && (
                  <Badge className="text-xs bg-green-100 text-green-800 hover:bg-green-100">
                    Verified
                  </Badge>
                )}
              </div>
            </div>

            {mentor.expertise_areas && mentor.expertise_areas.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {mentor.expertise_areas.slice(0, 3).map((area) => (
                  <Badge key={area} variant="outline" className="text-xs">
                    {area}
                  </Badge>
                ))}
                {mentor.expertise_areas.length > 3 && (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    +{mentor.expertise_areas.length - 3}
                  </Badge>
                )}
              </div>
            )}

            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              {mentor.industry_experience_years && (
                <span>{mentor.industry_experience_years}y exp</span>
              )}
              {mentor.average_rating && (
                <span className="flex items-center gap-1">
                  <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                  {mentor.average_rating.toFixed(1)}
                </span>
              )}
              {mentor.current_mentees != null && mentor.max_mentees != null && (
                <span>{mentor.current_mentees}/{mentor.max_mentees} mentees</span>
              )}
            </div>

            <div className="flex items-center gap-3 mt-2">
              <a
                href={`mailto:${mentor.email}`}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Mail className="h-3 w-3" />
                {mentor.email}
              </a>
              {mentor.linkedin_url && (
                <a
                  href={mentor.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="h-3 w-3" />
                  LinkedIn
                </a>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function IndustryMentorsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active');
  const [sector, setSector] = useState('');
  const [page, setPage] = useState(1);

  const { data, loading, error } = useIndustryMentors({
    search: search || undefined,
    status,
    sector: sector || undefined,
    page,
    limit: 20,
  });

  const total = data?.total ?? 0;
  const mentors = data?.mentors ?? [];
  const totalPages = Math.ceil(total / 20);

  return (
    <PermissionGuard module="cdc.industry_mentors" action="view">
    <ContentLayout title="CDC — Industry Mentors">
      <div className="space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/cdc">CDC</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Industry Mentors</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Users className="h-6 w-6" />
              Industry Mentors
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {total} mentor{total !== 1 ? 's' : ''} in the directory
            </p>
          </div>
          <PermissionGuard module="cdc.industry_mentors" action="create" fallback={null}>
            <Button asChild>
              <Link href="/cdc/industry-mentors/new">
                <Plus className="h-4 w-4 mr-2" />
                Add Mentor
              </Link>
            </Button>
          </PermissionGuard>
        </div>

        <Separator />

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, company, or role…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>
          <Select value={status} onValueChange={(v) => { setStatus(v as typeof status); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Filter by sector…"
            value={sector}
            onChange={(e) => { setSector(e.target.value); setPage(1); }}
            className="w-full sm:w-48"
          />
        </div>

        {/* Content */}
        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!loading && !error && mentors.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No mentors found.</p>
            <PermissionGuard module="cdc.industry_mentors" action="create" fallback={null}>
              <Button asChild variant="outline" className="mt-4">
                <Link href="/cdc/industry-mentors/new">Add the first mentor</Link>
              </Button>
            </PermissionGuard>
          </div>
        )}

        {!loading && mentors.length > 0 && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {mentors.map((m) => (
                <MentorCard key={m.id} mentor={m} />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4">
                <p className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </ContentLayout>
    </PermissionGuard>
  );
}
