// Configuration for student query optimization

export const STUDENT_QUERY_CONFIG = {
  // Maximum time for a query to execute (in milliseconds)
  QUERY_TIMEOUT: 30000, // 30 seconds
  
  // Default page size for better performance
  DEFAULT_PAGE_SIZE: 10,
  MAX_PAGE_SIZE: 50,
  
  // Enable query optimization strategies
  USE_LIGHTWEIGHT_QUERIES: true,
  
  // Retry configuration
  MAX_RETRIES: 2,
  RETRY_DELAY: 1000, // 1 second
  
  // Performance hints
  PERFORMANCE_HINTS: {
    timeout: 'Try reducing the number of filters or page size',
    largeDataset: 'Consider using more specific filters to narrow down results',
    indexing: 'Ensure database indexes are properly created'
  }
};

// Helper to determine if we should use lightweight query
export function shouldUseLightweightQuery(filters: any): boolean {
  // Use lightweight query when:
  // 1. No complex search filters
  // 2. Basic listing without detailed filters
  // 3. Initial page load
  
  const hasComplexFilters = 
    filters.created_from || 
    filters.created_to || 
    filters.gender || 
    filters.entry_type || 
    filters.accommodation_type;
    
  return !hasComplexFilters;
}