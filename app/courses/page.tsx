'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useVACCourses } from '@/hooks/vac/use-vac';
import {
  BookOpen,
  Clock,
  GraduationCap,
  IndianRupee,
  ArrowRight,
  Sparkles,
  Cpu,
  BarChart3,
  Brain,
  Code2,
  Rocket,
  Users,
  Award,
  CheckCircle2,
  ChevronRight,
  Filter,
  Search
} from 'lucide-react';
import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// JKKN Brand Colors
const JKKN_COLORS = {
  green: '#0b6d41',
  yellow: '#ffde59',
  cream: '#fbfbee',
};

export default function JKKNVACCoursesPage() {
  const [trackFilter, setTrackFilter] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const { data, isLoading, isError, error } = useVACCourses({ track: trackFilter });

  const courses = data?.courses || [];

  // Filter courses by search query
  const filteredCourses = useMemo(() => {
    if (!searchQuery.trim()) return courses;
    const query = searchQuery.toLowerCase();
    return courses.filter(
      (course) =>
        course.name.toLowerCase().includes(query) ||
        course.description.toLowerCase().includes(query) ||
        course.institution.toLowerCase().includes(query)
    );
  }, [courses, searchQuery]);

  // Stats for the hero section
  const stats = [
    { label: 'Active Courses', value: courses.length || '10+', icon: BookOpen },
    { label: 'Students Enrolled', value: '500+', icon: Users },
    { label: 'Expert Faculty', value: '25+', icon: Award },
    { label: 'Success Rate', value: '95%', icon: CheckCircle2 },
  ];

  return (
    <div className="min-h-screen bg-[#fbfbee] dark:bg-gray-950">
      {/* Navigation Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/80 dark:bg-gray-900/80 border-b border-[#0b6d41]/10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0b6d41] to-[#0b6d41]/80 flex items-center justify-center shadow-lg">
                <GraduationCap className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-[#0b6d41]">JKKN VAC</h1>
                <p className="text-xs text-gray-500 dark:text-gray-400">Value-Added Courses</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/">
                <Button variant="ghost" className="text-gray-600 hover:text-[#0b6d41]">
                  Home
                </Button>
              </Link>
              <Link href="/auth/login">
                <Button
                  className="bg-[#0b6d41] hover:bg-[#0b6d41]/90 text-white shadow-lg shadow-[#0b6d41]/25"
                >
                  Sign In
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Background Gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0b6d41] via-[#0b6d41]/95 to-[#0b6d41]/80" />

        {/* Animated Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 bg-[#ffde59] rounded-full blur-3xl animate-blob" />
          <div className="absolute top-40 right-20 w-96 h-96 bg-white rounded-full blur-3xl animate-blob animation-delay-2000" />
          <div className="absolute bottom-20 left-1/3 w-80 h-80 bg-[#ffde59] rounded-full blur-3xl animate-blob animation-delay-4000" />
        </div>

        {/* Grid Pattern Overlay */}
        <div
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />

        <div className="relative container mx-auto px-4 py-20 lg:py-28">
          <div className="max-w-4xl mx-auto text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 mb-6">
              <Sparkles className="h-4 w-4 text-[#ffde59]" />
              <span className="text-sm font-medium text-white">Industry-Ready Skills Program</span>
            </div>

            {/* Main Heading */}
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
              Elevate Your Career with{' '}
              <span className="relative">
                <span className="relative z-10 text-[#ffde59]">Value-Added Courses</span>
                <span className="absolute bottom-2 left-0 right-0 h-3 bg-[#ffde59]/30 -skew-x-3" />
              </span>
            </h1>

            {/* Description */}
            <p className="text-lg md:text-xl text-white/80 mb-10 max-w-2xl mx-auto">
              Master cutting-edge technologies with JKKN Institutions.
              From AI-powered solutions to MATLAB engineering applications,
              gain skills that top employers demand.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
              <Button
                size="lg"
                className="bg-[#ffde59] hover:bg-[#ffde59]/90 text-[#0b6d41] font-semibold shadow-xl shadow-black/20 px-8"
                onClick={() => document.getElementById('courses')?.scrollIntoView({ behavior: 'smooth' })}
              >
                Explore Courses
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-2 border-white/30 text-white hover:bg-white/10 bg-transparent px-8"
              >
                Download Brochure
              </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 md:p-6 border border-white/20"
                >
                  <stat.icon className="h-8 w-8 text-[#ffde59] mx-auto mb-3" />
                  <div className="text-2xl md:text-3xl font-bold text-white mb-1">
                    {stat.value}
                  </div>
                  <div className="text-sm text-white/70">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Wave Divider */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
            <path
              d="M0 120L60 110C120 100 240 80 360 70C480 60 600 60 720 65C840 70 960 80 1080 85C1200 90 1320 90 1380 90L1440 90V120H1380C1320 120 1200 120 1080 120C960 120 840 120 720 120C600 120 480 120 360 120C240 120 120 120 60 120H0Z"
              fill="#fbfbee"
              className="dark:fill-gray-950"
            />
          </svg>
        </div>
      </section>

      {/* Track Selection Cards */}
      <section className="py-16 bg-[#fbfbee] dark:bg-gray-950">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Choose Your Learning Path
            </h2>
            <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Two specialized tracks designed for your career goals
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
            {/* AI Track Card */}
            <Card
              className={cn(
                "group cursor-pointer transition-all duration-500 border-2 overflow-hidden",
                "hover:shadow-2xl hover:-translate-y-1",
                trackFilter === 'ai'
                  ? "border-[#0b6d41] shadow-xl shadow-[#0b6d41]/20 bg-gradient-to-br from-[#0b6d41]/5 to-transparent"
                  : "border-transparent hover:border-[#0b6d41]/30 bg-white dark:bg-gray-900"
              )}
              onClick={() => setTrackFilter(trackFilter === 'ai' ? undefined : 'ai')}
            >
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
                    <Brain className="h-8 w-8 text-white" />
                  </div>
                  {trackFilter === 'ai' && (
                    <Badge className="bg-[#0b6d41] text-white">Selected</Badge>
                  )}
                </div>
                <CardTitle className="text-2xl mt-4 text-gray-900 dark:text-white">
                  AI Track
                </CardTitle>
                <CardDescription className="text-base">
                  Harness the power of Gemini Pro and cutting-edge AI technologies
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                    <CheckCircle2 className="h-5 w-5 text-[#0b6d41]" />
                    <span>Gemini Pro API Integration</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                    <CheckCircle2 className="h-5 w-5 text-[#0b6d41]" />
                    <span>Domain-Specific AI Applications</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                    <CheckCircle2 className="h-5 w-5 text-[#0b6d41]" />
                    <span>Prompt Engineering & RAG</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                    <CheckCircle2 className="h-5 w-5 text-[#0b6d41]" />
                    <span>Real-World AI Projects</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="pt-4">
                <Button
                  variant="ghost"
                  className="w-full justify-between group-hover:text-[#0b6d41] group-hover:bg-[#0b6d41]/5"
                >
                  <span>View AI Courses</span>
                  <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </CardFooter>
            </Card>

            {/* MATLAB Track Card */}
            <Card
              className={cn(
                "group cursor-pointer transition-all duration-500 border-2 overflow-hidden",
                "hover:shadow-2xl hover:-translate-y-1",
                trackFilter === 'matlab'
                  ? "border-[#0b6d41] shadow-xl shadow-[#0b6d41]/20 bg-gradient-to-br from-[#0b6d41]/5 to-transparent"
                  : "border-transparent hover:border-[#0b6d41]/30 bg-white dark:bg-gray-900"
              )}
              onClick={() => setTrackFilter(trackFilter === 'matlab' ? undefined : 'matlab')}
            >
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/30">
                    <BarChart3 className="h-8 w-8 text-white" />
                  </div>
                  {trackFilter === 'matlab' && (
                    <Badge className="bg-[#0b6d41] text-white">Selected</Badge>
                  )}
                </div>
                <CardTitle className="text-2xl mt-4 text-gray-900 dark:text-white">
                  MATLAB Track
                </CardTitle>
                <CardDescription className="text-base">
                  Master engineering computations with industry-standard tools
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                    <CheckCircle2 className="h-5 w-5 text-[#0b6d41]" />
                    <span>MATLAB Programming Fundamentals</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                    <CheckCircle2 className="h-5 w-5 text-[#0b6d41]" />
                    <span>Simulink & Model Design</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                    <CheckCircle2 className="h-5 w-5 text-[#0b6d41]" />
                    <span>Domain-Specific Toolboxes</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                    <CheckCircle2 className="h-5 w-5 text-[#0b6d41]" />
                    <span>Industry Project Experience</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="pt-4">
                <Button
                  variant="ghost"
                  className="w-full justify-between group-hover:text-[#0b6d41] group-hover:bg-[#0b6d41]/5"
                >
                  <span>View MATLAB Courses</span>
                  <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </CardFooter>
            </Card>
          </div>

          {/* View All Button */}
          {trackFilter && (
            <div className="text-center mt-8">
              <Button
                variant="outline"
                onClick={() => setTrackFilter(undefined)}
                className="border-[#0b6d41]/30 text-[#0b6d41] hover:bg-[#0b6d41]/5"
              >
                Clear Filter - View All Courses
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* Course Listing Section */}
      <section id="courses" className="py-16 bg-white dark:bg-gray-900">
        <div className="container mx-auto px-4">
          {/* Section Header with Search */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-2">
                {trackFilter
                  ? `${trackFilter.toUpperCase()} Track Courses`
                  : 'All Available Courses'
                }
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                {filteredCourses.length} course{filteredCourses.length !== 1 ? 's' : ''} available
              </p>
            </div>
            <div className="relative max-w-sm w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search courses..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:border-[#0b6d41] focus:ring-[#0b6d41]/20"
              />
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex gap-2 flex-wrap mb-8">
            <Button
              variant={trackFilter === undefined ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTrackFilter(undefined)}
              className={cn(
                "rounded-full",
                trackFilter === undefined
                  ? "bg-[#0b6d41] hover:bg-[#0b6d41]/90"
                  : "border-gray-200 hover:border-[#0b6d41] hover:text-[#0b6d41]"
              )}
            >
              <Filter className="h-4 w-4 mr-2" />
              All Tracks
            </Button>
            <Button
              variant={trackFilter === 'ai' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTrackFilter('ai')}
              className={cn(
                "rounded-full",
                trackFilter === 'ai'
                  ? "bg-[#0b6d41] hover:bg-[#0b6d41]/90"
                  : "border-gray-200 hover:border-[#0b6d41] hover:text-[#0b6d41]"
              )}
            >
              <Brain className="h-4 w-4 mr-2" />
              AI Track
            </Button>
            <Button
              variant={trackFilter === 'matlab' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTrackFilter('matlab')}
              className={cn(
                "rounded-full",
                trackFilter === 'matlab'
                  ? "bg-[#0b6d41] hover:bg-[#0b6d41]/90"
                  : "border-gray-200 hover:border-[#0b6d41] hover:text-[#0b6d41]"
              )}
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              MATLAB Track
            </Button>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Card key={i} className="overflow-hidden">
                  <div className="h-3 bg-gradient-to-r from-gray-200 to-gray-100" />
                  <CardHeader>
                    <Skeleton className="h-6 w-20 mb-2" />
                    <Skeleton className="h-7 w-3/4" />
                    <Skeleton className="h-4 w-full mt-2" />
                    <Skeleton className="h-4 w-2/3" />
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Skeleton className="h-10 w-full" />
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}

          {/* Error State */}
          {isError && (
            <div className="text-center py-16 bg-red-50 dark:bg-red-950/20 rounded-2xl">
              <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
                <Code2 className="h-8 w-8 text-red-500" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Unable to Load Courses
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                {error instanceof Error ? error.message : 'Something went wrong. Please try again.'}
              </p>
              <Button
                onClick={() => window.location.reload()}
                className="bg-[#0b6d41] hover:bg-[#0b6d41]/90"
              >
                Retry
              </Button>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !isError && filteredCourses.length === 0 && (
            <div className="text-center py-16 bg-gray-50 dark:bg-gray-800/50 rounded-2xl">
              <div className="w-20 h-20 rounded-full bg-[#0b6d41]/10 flex items-center justify-center mx-auto mb-6">
                <BookOpen className="h-10 w-10 text-[#0b6d41]" />
              </div>
              <h3 className="text-2xl font-semibold text-gray-900 dark:text-white mb-3">
                {searchQuery ? 'No Matching Courses' : 'No Courses Available Yet'}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
                {searchQuery
                  ? `We couldn't find any courses matching "${searchQuery}". Try a different search term.`
                  : 'New courses are being prepared. Check back soon for exciting new offerings!'}
              </p>
              {searchQuery && (
                <Button
                  variant="outline"
                  onClick={() => setSearchQuery('')}
                  className="border-[#0b6d41]/30 text-[#0b6d41] hover:bg-[#0b6d41]/5"
                >
                  Clear Search
                </Button>
              )}
            </div>
          )}

          {/* Course Grid */}
          {!isLoading && !isError && filteredCourses.length > 0 && (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filteredCourses.map((course) => (
                <Link key={course.id} href={`/courses/${course.id}`} className="group">
                  <Card className="h-full overflow-hidden border-0 shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 bg-white dark:bg-gray-800">
                    {/* Track Color Bar */}
                    <div
                      className={cn(
                        "h-2 w-full",
                        course.track === 'ai'
                          ? "bg-gradient-to-r from-purple-500 to-indigo-600"
                          : course.track === 'matlab'
                          ? "bg-gradient-to-r from-orange-500 to-red-600"
                          : "bg-gradient-to-r from-[#0b6d41] to-[#0b6d41]/70"
                      )}
                    />
                    <CardHeader className="pb-4">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <Badge
                          variant="secondary"
                          className="bg-[#0b6d41]/10 text-[#0b6d41] hover:bg-[#0b6d41]/20"
                        >
                          {course.institution}
                        </Badge>
                        {course.track && (
                          <Badge
                            variant="outline"
                            className={cn(
                              "capitalize",
                              course.track === 'ai'
                                ? "border-purple-300 text-purple-600 dark:text-purple-400"
                                : "border-orange-300 text-orange-600 dark:text-orange-400"
                            )}
                          >
                            {course.track === 'ai' ? (
                              <Brain className="h-3 w-3 mr-1" />
                            ) : (
                              <BarChart3 className="h-3 w-3 mr-1" />
                            )}
                            {course.track}
                          </Badge>
                        )}
                      </div>
                      <CardTitle className="text-xl text-gray-900 dark:text-white group-hover:text-[#0b6d41] transition-colors line-clamp-2">
                        {course.name}
                      </CardTitle>
                      <CardDescription className="line-clamp-2 text-gray-600 dark:text-gray-400">
                        {course.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                          <Clock className="h-4 w-4 text-[#0b6d41]" />
                          <span>{course.duration_hours} hours</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                          <GraduationCap className="h-4 w-4 text-[#0b6d41]" />
                          <span>{course.weeks} weeks</span>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="pt-4 border-t dark:border-gray-700">
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-1">
                          <IndianRupee className="h-5 w-5 text-[#0b6d41]" />
                          <span className="text-2xl font-bold text-[#0b6d41]">
                            {course.fee.toLocaleString('en-IN')}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          className="bg-[#ffde59] hover:bg-[#ffde59]/90 text-[#0b6d41] font-semibold shadow-md group-hover:shadow-lg transition-all"
                        >
                          View Details
                          <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </Button>
                      </div>
                    </CardFooter>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Why Choose JKKN VAC Section */}
      <section className="py-20 bg-gradient-to-b from-[#fbfbee] to-white dark:from-gray-950 dark:to-gray-900">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <Badge className="bg-[#ffde59] text-[#0b6d41] mb-4">Why JKKN VAC?</Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Transform Your Future with Us
            </h2>
            <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Our value-added courses are designed by industry experts and aligned with current market demands
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: Rocket,
                title: 'Industry-Aligned',
                description: 'Curriculum designed with input from leading tech companies',
                color: 'from-blue-500 to-cyan-500',
              },
              {
                icon: Users,
                title: 'Expert Faculty',
                description: 'Learn from professors with real industry experience',
                color: 'from-purple-500 to-pink-500',
              },
              {
                icon: Cpu,
                title: 'Hands-On Learning',
                description: 'Practical projects and real-world applications',
                color: 'from-orange-500 to-red-500',
              },
              {
                icon: Award,
                title: 'Certified Skills',
                description: 'Industry-recognized certificates upon completion',
                color: 'from-green-500 to-emerald-500',
              },
            ].map((feature) => (
              <Card
                key={feature.title}
                className="group text-center border-0 shadow-lg hover:shadow-xl transition-all duration-300 bg-white dark:bg-gray-800"
              >
                <CardContent className="pt-8 pb-6">
                  <div
                    className={cn(
                      "w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center",
                      "bg-gradient-to-br shadow-lg",
                      feature.color
                    )}
                  >
                    <feature.icon className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-[#0b6d41]">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Ready to Get Started?
            </h2>
            <p className="text-lg text-white/80 mb-8">
              Join thousands of students who have transformed their careers with JKKN Value-Added Courses.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/auth/login">
                <Button
                  size="lg"
                  className="bg-[#ffde59] hover:bg-[#ffde59]/90 text-[#0b6d41] font-semibold shadow-xl px-8 w-full sm:w-auto"
                >
                  Enroll Now
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Button
                size="lg"
                variant="outline"
                className="border-2 border-white/30 text-white hover:bg-white/10 bg-transparent px-8"
              >
                Contact Us
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 bg-gray-900 text-white">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            {/* Brand */}
            <div className="md:col-span-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0b6d41] to-[#0b6d41]/80 flex items-center justify-center">
                  <GraduationCap className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">JKKN VAC</h3>
                  <p className="text-xs text-gray-400">Value-Added Courses</p>
                </div>
              </div>
              <p className="text-gray-400 text-sm max-w-md">
                Empowering students with industry-relevant skills through cutting-edge technology courses
                and hands-on learning experiences.
              </p>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="font-semibold mb-4">Quick Links</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link href="/" className="hover:text-[#ffde59] transition-colors">Home</Link></li>
                <li><Link href="/courses" className="hover:text-[#ffde59] transition-colors">All Courses</Link></li>
                <li><Link href="/auth/login" className="hover:text-[#ffde59] transition-colors">Student Login</Link></li>
                <li><a href="#" className="hover:text-[#ffde59] transition-colors">Contact</a></li>
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="font-semibold mb-4">Contact</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li>JKKN College of Engineering</li>
                <li>Komarapalayam, Tamil Nadu</li>
                <li>info@jkkn.ac.in</li>
                <li>+91 4288 234 567</li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-800 pt-8 text-center text-sm text-gray-400">
            <p>&copy; 2026 JKKN Institutions. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
