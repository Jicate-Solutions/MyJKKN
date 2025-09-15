'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  TrendingUp,
  RefreshCw,
  Loader2,
  Heart,
  Star
} from 'lucide-react';
import LearnerLayout from '@/components/layout/learner-layout';
import { LearnerPageHeader } from '@/components/layout/learner-page-header';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLearnerApps } from '@/hooks/use-learner-apps';
import { usePermissions } from '@/hooks/use-permissions';
import { Application } from '@/types/applications';
import { CategoryService } from '@/lib/services/application/category-service';
import { Category } from '@/types/categories';
import { LearnerAppCard } from './_components/learner-app-card';
import { toast } from 'react-hot-toast';
import { useFavorites } from '@/hooks/use-favorites';

export default function LearnerAppsPage() {
  const { userProfile: profile, isLoading: authLoading } = usePermissions();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'popular' | 'recent'>(
    'popular'
  );

  const { favorites, loading: favoritesLoading } = useFavorites();

  // Debounce search query
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch applications with learner-specific filtering
  const {
    applications: filteredApplications,
    loading: appsLoading,
    error,
    refreshApps,
    updateFilters,
    trackAppUsage,
    hasAccess
  } = useLearnerApps({
    sortBy,
    categoryId: selectedCategory,
    search: debouncedSearch
  });

  // No need for additional useEffect - useLearnerApps handles filtering automatically

  // Load categories
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoadingCategories(true);
        const categoriesData = await CategoryService.getCategories();
        setCategories(categoriesData);
      } catch (error) {
        console.error('Error loading categories:', error);
        toast.error('Failed to load app categories');
      } finally {
        setLoadingCategories(false);
      }
    };

    loadData();
  }, []);

  // Handle app launch tracking
  const handleAppOpen = (app: Application) => {
    // Track app usage for analytics
    trackAppUsage(app.id);
  };

  // Handle refresh
  const handleRefresh = async () => {
    try {
      await refreshApps();
      toast.success('Apps refreshed successfully');
    } catch (error) {
      toast.error('Failed to refresh apps');
    }
  };

  const isLoading = authLoading || appsLoading || loadingCategories;

  return (
    <LearnerLayout>
      <div className='min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-green-50/20'>
        <LearnerPageHeader
          title='My Apps'
          subtitle='Discover and access educational applications'
        />

        <div className='p-4 space-y-6'>
          {/* Search and Filters */}
          <div className='bg-white/80 backdrop-blur-sm rounded-2xl p-4 md:p-6 shadow-lg border border-white/50'>
            <div className='flex flex-col sm:flex-row gap-3 md:gap-4'>
              {/* Search */}
              <div className='relative flex-1'>
                <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400' />
                <Input
                  placeholder='Search apps, tools, and resources...'
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className='pl-10 bg-white/70 border-gray-200/50 focus:bg-white focus:border-blue-300 hover:bg-white/90 transition-all duration-200'
                />
              </div>

              {/* Category Filter */}
              <Select
                value={selectedCategory}
                onValueChange={setSelectedCategory}
              >
                <SelectTrigger className='w-full sm:w-44 md:w-48 bg-white/70 border-gray-200/50 hover:bg-white transition-colors'>
                  <SelectValue placeholder='All Categories' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Categories</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Sort */}
              <Select
                value={sortBy}
                onValueChange={(value: any) => setSortBy(value)}
              >
                <SelectTrigger className='w-full sm:w-32 md:w-36 bg-white/70 border-gray-200/50 hover:bg-white transition-colors'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='popular'>Popular</SelectItem>
                  <SelectItem value='name'>Name</SelectItem>
                  <SelectItem value='recent'>Recent</SelectItem>
                </SelectContent>
              </Select>

              {/* Refresh Button */}
              <Button
                variant='outline'
                size='icon'
                onClick={handleRefresh}
                disabled={isLoading}
                className='bg-white/70 border-gray-200/50 hover:bg-white hover:border-blue-300 hover:text-blue-600 transition-all duration-200'
              >
                <RefreshCw
                  className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}
                />
              </Button>
            </div>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className='flex items-center justify-center py-12'>
              <div className='text-center'>
                <Loader2 className='h-8 w-8 animate-spin text-blue-600 mx-auto mb-2' />
                <p className='text-gray-600'>Loading apps...</p>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && !isLoading && (
            <div className='text-center py-12'>
              <p className='text-red-600 mb-4'>Failed to load apps: {error}</p>
              <Button onClick={handleRefresh} variant='outline'>
                Try Again
              </Button>
            </div>
          )}

          {/* Favorite Apps Section */}
          {!isLoading && !error && favorites.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className='bg-white/80 backdrop-blur-sm rounded-2xl p-4 md:p-6 shadow-lg border border-white/50'
            >
              <div className='flex items-center gap-3 mb-4'>
                <div className='flex items-center gap-2'>
                  <Heart className='h-5 w-5 text-red-600 fill-red-600' />
                  <h2 className='text-xl font-bold text-gray-900'>
                    My Favorites
                  </h2>
                </div>
                <Badge
                  variant='secondary'
                  className='bg-red-50 text-red-700 border-red-200'
                >
                  {favorites.length}
                </Badge>
              </div>

              <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 md:gap-6'>
                {favorites.slice(0, 10).map((app, index) => (
                  <motion.div
                    key={app.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.05 }}
                    className='h-full'
                  >
                    <LearnerAppCard
                      application={app}
                      onAppOpen={handleAppOpen}
                    />
                  </motion.div>
                ))}
              </div>

              {favorites.length > 10 && (
                <div className='text-center mt-4'>
                  <p className='text-sm text-gray-600'>
                    Showing 10 of {favorites.length} favorites
                  </p>
                </div>
              )}
            </motion.section>
          )}

          {/* Content */}
          {!isLoading && !error && (
            <AnimatePresence mode='wait'>
              {filteredApplications.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className='text-center py-12'
                >
                  <div className='max-w-md mx-auto'>
                    <div className='w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4'>
                      <Search className='h-8 w-8 text-gray-400' />
                    </div>
                    <h3 className='text-lg font-semibold text-gray-900 mb-2'>
                      No apps found
                    </h3>
                    <p className='text-gray-600 mb-4'>
                      {searchQuery || selectedCategory !== 'all'
                        ? 'Try adjusting your search or filters'
                        : 'No applications are available for your role'}
                    </p>
                    {(searchQuery || selectedCategory !== 'all') && (
                      <Button
                        variant='outline'
                        onClick={() => {
                          setSearchQuery('');
                          setSelectedCategory('all');
                        }}
                      >
                        Clear Filters
                      </Button>
                    )}
                  </div>
                </motion.div>
              ) : (
                <motion.section
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className='space-y-4'
                >
                  <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-2'>
                      <TrendingUp className='h-5 w-5 text-green-500' />
                      <h2 className='text-xl font-bold text-gray-900'>
                        {searchQuery || selectedCategory !== 'all'
                          ? 'Search Results'
                          : 'All Apps'}
                      </h2>
                      <Badge variant='secondary' className='ml-2'>
                        {filteredApplications.length}
                      </Badge>
                    </div>
                  </div>

                  <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 md:gap-6'>
                    {filteredApplications.map((app, index) => (
                      <motion.div
                        key={app.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(index * 0.05, 0.3) }}
                        className='h-full'
                      >
                        <LearnerAppCard
                          application={app}
                          onAppOpen={handleAppOpen}
                        />
                      </motion.div>
                    ))}
                  </div>
                </motion.section>
              )}
            </AnimatePresence>
          )}
        </div>
      </div>
    </LearnerLayout>
  );
}
