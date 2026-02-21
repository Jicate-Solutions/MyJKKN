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

// Placeholder data for roommate matching
const useRoommateMatches = (learnerId: string | null) => {
  return {
    data: {
      current_student: {
        id: 'l1',
        name: 'Amit Kumar',
        roll_number: 'CS2025001',
        department: 'Computer Science',
        preferences: {
          sleep_schedule: 'night_owl',
          study_habits: 'quiet_studier',
          cleanliness_level: 'very_tidy',
          noise_tolerance: 'needs_silence',
          is_smoker: false,
          food_preference: 'vegetarian',
          language_preference: 'Tamil',
        },
      },
      matches: [
        {
          id: 'l2',
          name: 'Suresh Raj',
          roll_number: 'CS2025005',
          department: 'Computer Science',
          score: 92,
          preferences: {
            sleep_schedule: 'night_owl',
            study_habits: 'quiet_studier',
            cleanliness_level: 'very_tidy',
            noise_tolerance: 'needs_silence',
            is_smoker: false,
            food_preference: 'vegetarian',
            language_preference: 'Tamil',
          },
        },
        {
          id: 'l3',
          name: 'Praveen Das',
          roll_number: 'EC2025012',
          department: 'Electronics',
          score: 85,
          preferences: {
            sleep_schedule: 'night_owl',
            study_habits: 'library_goer',
            cleanliness_level: 'very_tidy',
            noise_tolerance: 'moderate',
            is_smoker: false,
            food_preference: 'vegetarian',
            language_preference: 'Hindi',
          },
        },
        {
          id: 'l4',
          name: 'Karthik M',
          roll_number: 'IT2025008',
          department: 'IT',
          score: 78,
          preferences: {
            sleep_schedule: 'flexible',
            study_habits: 'quiet_studier',
            cleanliness_level: 'moderate',
            noise_tolerance: 'needs_silence',
            is_smoker: false,
            food_preference: 'non_vegetarian',
            language_preference: 'Tamil',
          },
        },
        {
          id: 'l5',
          name: 'Ravi Shankar',
          roll_number: 'ME2025003',
          department: 'Mechanical',
          score: 65,
          preferences: {
            sleep_schedule: 'early_bird',
            study_habits: 'group_studier',
            cleanliness_level: 'moderate',
            noise_tolerance: 'moderate',
            is_smoker: false,
            food_preference: 'vegetarian',
            language_preference: 'Tamil',
          },
        },
      ],
    },
    isLoading: false,
    error: null,
  };
};

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
  const { data, isLoading } = useRoommateMatches(null);

  if (isLoading || !data) {
    return (
      <ContentLayout title="Roommate Matching">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  const { current_student, matches } = data;

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
              <h1 className="text-2xl font-bold py-1">Roommate Matching</h1>
              <p className="text-sm text-muted-foreground">
                Find compatible roommates based on lifestyle preferences
              </p>
            </div>
          </div>
        </div>

        {/* Student Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search student to find matches..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Current Student Preferences */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {current_student.name}&apos;s Preferences
            </CardTitle>
            <CardDescription>
              {current_student.roll_number} &middot; {current_student.department}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {Object.entries(current_student.preferences).filter(([k]) => k !== 'is_smoker').map(([key, value]) => (
                <div key={key} className="flex items-center gap-2 px-3 py-2 bg-primary/5 rounded-lg border">
                  {prefIcons[key]}
                  <div>
                    <p className="text-xs text-muted-foreground">{prefLabels[key] ?? key}</p>
                    <p className="text-sm font-medium capitalize">{String(value).replace('_', ' ')}</p>
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 rounded-lg border">
                <span className="text-sm">Non-Smoker</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Matches */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Compatible Matches ({matches.length})</h2>
          <div className="space-y-4">
            {matches.map((match) => {
              const scoreColor =
                match.score >= 90 ? 'text-green-600 bg-green-50 border-green-200' :
                match.score >= 75 ? 'text-blue-600 bg-blue-50 border-blue-200' :
                match.score >= 60 ? 'text-amber-600 bg-amber-50 border-amber-200' :
                'text-red-600 bg-red-50 border-red-200';

              return (
                <Card key={match.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className={`h-14 w-14 rounded-full border-2 flex items-center justify-center ${scoreColor}`}>
                          <span className="text-lg font-bold">{match.score}%</span>
                        </div>
                        <div>
                          <p className="font-semibold text-lg">{match.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {match.roll_number} &middot; {match.department}
                          </p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">
                        <Users className="mr-2 h-4 w-4" />
                        Pair Up
                      </Button>
                    </div>

                    <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                      {Object.entries(match.preferences).filter(([k]) => k !== 'is_smoker').map(([key, value]) => {
                        const isMatch = String(current_student.preferences[key as keyof typeof current_student.preferences]) === String(value);
                        return (
                          <div
                            key={key}
                            className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-xs ${
                              isMatch ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {prefIcons[key]}
                            <span className="capitalize">{String(value).replace('_', ' ')}</span>
                            {isMatch && <Heart className="h-3 w-3 text-green-500 fill-green-500" />}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </ContentLayout>
  );
}
