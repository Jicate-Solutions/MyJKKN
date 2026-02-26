// lib/utils/clear-auth-cookies.ts
// Utility to clear authentication cookies and fix HTTP 431 errors

/**
 * Clear all authentication cookies to fix HTTP 431 errors
 * Call this function from browser console or use the cleanup endpoint
 */
export function clearAuthCookies(): void {
  if (typeof document === 'undefined') {
    console.warn('[Auth] clearAuthCookies can only be called in browser');
    return;
  }

  const cookies = document.cookie.split(';');
  let clearedCount = 0;

  cookies.forEach((cookie) => {
    const cookieName = cookie.split('=')[0].trim();

    // Clear Supabase auth cookies
    if (
      cookieName.startsWith('sb-') ||
      cookieName.includes('auth-token') ||
      cookieName.includes('supabase')
    ) {
      // Delete cookie for all possible paths and domains
      const domains = [
        window.location.hostname,
        `.${window.location.hostname}`,
        'localhost',
        '.localhost'
      ];

      const paths = ['/', '/auth', '/auth/callback'];

      domains.forEach((domain) => {
        paths.forEach((path) => {
          document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path}; domain=${domain};`;
          document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path};`;
        });
      });

      clearedCount++;
    }
  });

  console.log(`[Auth] ✅ Cleared ${clearedCount} authentication cookies`);
  console.log('[Auth] 🔄 Please refresh the page');

  // Also clear localStorage auth data
  try {
    Object.keys(localStorage).forEach((key) => {
      if (key.includes('supabase') || key.includes('auth')) {
        localStorage.removeItem(key);
      }
    });
    console.log('[Auth] ✅ Cleared localStorage auth data');
  } catch (error) {
    console.error('[Auth] Failed to clear localStorage:', error);
  }
}

/**
 * Get total size of all cookies in bytes
 * Useful for debugging HTTP 431 errors
 */
export function getCookiesSize(): {
  totalSize: number;
  cookies: Array<{ name: string; size: number }>;
  exceededLimit: boolean;
} {
  if (typeof document === 'undefined') {
    return { totalSize: 0, cookies: [], exceededLimit: false };
  }

  const cookies = document.cookie.split(';');
  const cookieDetails: Array<{ name: string; size: number }> = [];
  let totalSize = 0;

  cookies.forEach((cookie) => {
    const trimmed = cookie.trim();
    const size = new Blob([trimmed]).size;
    const name = trimmed.split('=')[0];

    cookieDetails.push({ name, size });
    totalSize += size;
  });

  // Sort by size (largest first)
  cookieDetails.sort((a, b) => b.size - a.size);

  // Browser limit is typically 4KB per cookie, 50 cookies total
  const exceededLimit = cookieDetails.some((c) => c.size > 4000) || totalSize > 150000;

  return {
    totalSize,
    cookies: cookieDetails,
    exceededLimit
  };
}

/**
 * Debug cookie sizes and check for HTTP 431 risk
 */
export function debugCookies(): void {
  const { totalSize, cookies, exceededLimit } = getCookiesSize();

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🍪 Cookie Size Analysis');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Total size: ${totalSize} bytes (${(totalSize / 1024).toFixed(2)} KB)`);
  console.log(`Total cookies: ${cookies.length}`);
  console.log(`Risk of HTTP 431: ${exceededLimit ? '⚠️ YES' : '✅ NO'}`);
  console.log('\nLargest cookies:');

  cookies.slice(0, 10).forEach((cookie, index) => {
    const sizeKB = (cookie.size / 1024).toFixed(2);
    const warning = cookie.size > 4000 ? ' ⚠️ EXCEEDS 4KB LIMIT' : '';
    console.log(`${index + 1}. ${cookie.name}: ${cookie.size} bytes (${sizeKB} KB)${warning}`);
  });

  if (exceededLimit) {
    console.log('\n⚠️ WARNING: Large cookies detected!');
    console.log('Run clearAuthCookies() to fix HTTP 431 errors');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

// Make functions available in browser console for debugging
if (typeof window !== 'undefined') {
  (window as any).clearAuthCookies = clearAuthCookies;
  (window as any).debugCookies = debugCookies;
  (window as any).getCookiesSize = getCookiesSize;
}
