// lib/cors.ts

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // For development. In production, set this to specific domains
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-Requested-With, Accept, apikey',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Max-Age': '86400' // 24 hours
};

// Helper function to get CORS headers with a specific origin
export function getCorsHeadersWithOrigin(origin: string | null) {
  return {
    ...corsHeaders,
    'Access-Control-Allow-Origin': origin || '*'
  };
}
