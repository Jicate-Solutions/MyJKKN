'use client';

import { Search, X, Filter, Mic } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useState, useRef } from 'react';

export function LearnerSearchBar() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearch = () => {
    if (searchQuery.trim()) {
      // TODO: Implement search functionality
      console.log('Searching for:', searchQuery);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
    if (e.key === 'Escape') {
      setSearchQuery('');
      inputRef.current?.blur();
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    inputRef.current?.focus();
  };

  return (
    <div className='px-4 py-3'>
      <div className='relative'>
        {/* Search Input Container */}
        <div
          className={`relative transition-all duration-300 ${
            isFocused ? 'transform scale-[1.02]' : ''
          }`}
        >
          <div
            className={`absolute inset-0 rounded-2xl transition-all duration-300 ${
              isFocused
                ? 'bg-gradient-to-r from-green-500/20 to-blue-500/20 shadow-lg'
                : 'bg-white shadow-sm'
            }`}
          />

          <div className='relative flex items-center'>
            {/* Search Icon */}
            <div className='absolute left-4 z-10'>
              <Search
                className={`h-5 w-5 transition-colors duration-200 ${
                  isFocused ? 'text-green-600' : 'text-gray-400'
                }`}
              />
            </div>

            {/* Input Field */}
            <Input
              ref={inputRef}
              type='text'
              placeholder='Search courses, assignments, resources...'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onKeyDown={handleKeyDown}
              className={`w-full pl-12 pr-24 py-4 rounded-2xl border-0 bg-transparent text-gray-900 placeholder-gray-500 focus:ring-0 focus:border-transparent transition-all duration-200 ${
                isFocused ? 'placeholder-gray-400' : ''
              }`}
            />

            {/* Action Buttons */}
            <div className='absolute right-2 flex items-center space-x-1 z-10'>
              {/* Clear Button */}
              {searchQuery && (
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={clearSearch}
                  className='h-8 w-8 p-0 hover:bg-gray-100 rounded-full transition-all duration-200'
                >
                  <X className='h-4 w-4 text-gray-500' />
                </Button>
              )}

              {/* Voice Search Button */}
              <Button
                variant='ghost'
                size='sm'
                className='h-8 w-8 p-0 hover:bg-gray-100 rounded-full transition-all duration-200'
                title='Voice search'
              >
                <Mic className='h-4 w-4 text-gray-500' />
              </Button>

              {/* Search Button */}
              <Button
                onClick={handleSearch}
                className={`h-8 w-8 p-0 rounded-full transition-all duration-200 ${
                  searchQuery.trim()
                    ? 'bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white shadow-md'
                    : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                }`}
              >
                <Search className='h-4 w-4' />
              </Button>
            </div>
          </div>
        </div>

        {/* Search Suggestions */}
        {isFocused && (
          <div className='absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-lg border border-gray-100 z-20 overflow-hidden'>
            <div className='p-4'>
              <h4 className='text-sm font-medium text-gray-900 mb-3'>
                Quick searches
              </h4>
              <div className='space-y-2'>
                {[
                  'Assignments due today',
                  'Course materials',
                  'My grades',
                  'Class schedule',
                  'Library resources'
                ].map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => setSearchQuery(suggestion)}
                    className='w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors duration-150 flex items-center space-x-2'
                  >
                    <Search className='h-4 w-4 text-gray-400' />
                    <span>{suggestion}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Search Filters */}
      {searchQuery && (
        <div className='mt-3 flex items-center space-x-2'>
          <Button
            variant='outline'
            size='sm'
            className='h-8 px-3 rounded-full border-gray-200 text-gray-600 hover:bg-gray-50'
          >
            <Filter className='h-3 w-3 mr-1' />
            Filters
          </Button>
          <div className='flex items-center space-x-1'>
            {['All', 'Courses', 'Assignments', 'Resources'].map((filter) => (
              <Button
                key={filter}
                variant={filter === 'All' ? 'default' : 'ghost'}
                size='sm'
                className={`h-8 px-3 rounded-full text-xs transition-all duration-200 ${
                  filter === 'All'
                    ? 'bg-gradient-to-r from-green-600 to-blue-600 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {filter}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
