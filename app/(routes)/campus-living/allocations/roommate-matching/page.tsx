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
import { useRoommatePreferences } from '@/hooks/campus-living/use-roommate-matching';
import {
  ArrowLeft,
  Users,
  Heart,
  Search,
  Loader2,
  Moon,
  Sun,
  BookOpen,
  Sparkles,
  Volume2,
  Utensils,
  Languages
} from 'lucide-react';

const prefIcons: Record<string, React.ReactNode> = {
  sleep_schedule: <Moon className="h-3.5 w-3.5" />,
  study_habits: <BookOpen className="h-3.5 w-3.5" />,
  cleanliness_level: <Sparkles className="h-3.5 w-3.5" />,
  noise_tolerance: <Volume2 className="h-3.5 w-3.5" />,
  food_preference: <Utensils className="h-3.5 w-3.5" />,
  language_preference: <Languages className="h-3.5 w-3.5" />,
};

const prefLabels: Record<string, string> = {
  sleep_schedule: 'Sleep',
  study_habits: 'Study',
  cleanliness_level: 'Cleanliness',
  noise_tolerance: 'Noise',
  food_preference: 'Food',
  language_preference: 'Language',
};

export default function RoommateMatchingPage() {
  const { profile } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const { data: preferencesResult, isLoading } = useRoommatePreferences(profile?.institution_id ?? '');
  const preferences = preferencesResult?.data ?? [];

  const filteredPreferences = preferences.filter((p) =>
    searchQuery.length === 0 ||
    p.learner_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.language_preference ?? '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <ContentLayout title="Roommate Matching">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Roommate Matching">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Allocations', href: '/campus-living/allocations' },
          { label: 'Roommate Matching' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/campus-living/allocations">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold py-1">Roommate Preferences</h1>
              <p className="text-sm text-muted-foreground">
                View learner lifestyle preferences for roommate matching
              </p>
            </div>
          </div>
        </div>

        {/* Student Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by learner ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Preferences List */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Preference Records ({filteredPreferences.length})</h2>
          <div className="space-y-4">
            {filteredPreferences.map((pref) => (
              <Card key={pref.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                        <Users className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-semibold">{pref.learner_id}</p>
                        <p className="text-xs text-muted-foreground">
                          Submitted {new Date(pref.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <Badge variant={pref.is_smoker ? 'destructive' : 'success'}>
                      {pref.is_smoker ? 'Smoker' : 'Non-Smoker'}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                    {pref.sleep_schedule && (
                      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs bg-primary/5 border">
                        {prefIcons.sleep_schedule}
                        <span className="capitalize">{pref.sleep_schedule.replace('_', ' ')}</span>
                      </div>
                    )}
                    {pref.study_habits && (
                      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs bg-primary/5 border">
                        {prefIcons.study_habits}
                        <span className="capitalize">{pref.study_habits.replace('_', ' ')}</span>
                      </div>
                    )}
                    {pref.cleanliness_level && (
                      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs bg-primary/5 border">
                        {prefIcons.cleanliness_level}
                        <span className="capitalize">{pref.cleanliness_level.replace('_', ' ')}</span>
                      </div>
                    )}
                    {pref.noise_tolerance && (
                      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs bg-primary/5 border">
                        {prefIcons.noise_tolerance}
                        <span className="capitalize">{pref.noise_tolerance.replace('_', ' ')}</span>
                      </div>
                    )}
                    {pref.language_preference && (
                      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs bg-primary/5 border">
                        {prefIcons.language_preference}
                        <span>{pref.language_preference}</span>
                      </div>
                    )}
                  </div>

                  {pref.special_requirements && (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Special: {pref.special_requirements}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
            {filteredPreferences.length === 0 && (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  No roommate preferences found
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </ContentLayout>
  );
}
