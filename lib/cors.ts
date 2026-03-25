// lib/api-keys/cors.ts
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Or specify your domains like 'http://localhost:3001'
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version',
  'Access-Control-Max-Age': '86400'
};
