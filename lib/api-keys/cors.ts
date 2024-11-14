// lib/cors.ts

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // For development. In production, set this to specific domains
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-Requested-With'
};
