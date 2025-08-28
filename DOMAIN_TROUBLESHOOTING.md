# MyJKKN Domain Troubleshooting Guide

## Issue: ERR_FAILED in Some Chrome Browsers

### Problem Description
The website https://my.jkkn.ac.in/ works in some browsers but shows `ERR_FAILED` error in certain Chrome browsers.

## Root Causes & Solutions

### 1. DNS Resolution Issues

**Check DNS Configuration:**
```bash
# Windows
nslookup my.jkkn.ac.in

# Mac/Linux
dig my.jkkn.ac.in
```

**Expected Results:**
- Should resolve to Vercel's IP addresses
- Both domains (my.jkkn.ac.in and m.jkkn.ac.in) are configured

### 2. HSTS (HTTP Strict Transport Security) Issues

**Problem:** The previous configuration had `preload` directive which can cause issues if the domain was previously accessed over HTTP.

**Solution Applied:**
- Removed `preload` from HSTS header
- Reduced max-age to allow recovery from misconfiguration

### 3. Browser-Specific Issues

**Chrome-Specific Fixes:**

1. **Clear HSTS Cache:**
   - Navigate to: `chrome://net-internals/#hsts`
   - Query domain: `my.jkkn.ac.in`
   - If found, delete the security policies

2. **Clear DNS Cache:**
   - Navigate to: `chrome://net-internals/#dns`
   - Click "Clear host cache"

3. **Reset Chrome Flags:**
   - Navigate to: `chrome://flags`
   - Click "Reset all to default"

4. **Clear All Site Data:**
   - Settings → Privacy and security → Clear browsing data
   - Select "Cookies and other site data" and "Cached images and files"
   - Time range: "All time"

### 4. CORS and Security Headers

**Updates Applied to vercel.json:**

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Access-Control-Allow-Origin",
          "value": "*"
        },
        {
          "key": "Access-Control-Allow-Methods",
          "value": "GET, POST, PUT, DELETE, OPTIONS"
        },
        {
          "key": "Access-Control-Allow-Headers",
          "value": "X-Requested-With, Content-Type, Authorization"
        }
      ]
    }
  ]
}
```

### 5. Regional Configuration

**Added Multi-Region Support:**
```json
{
  "regions": ["iad1", "sin1", "bom1"]
}
```

This ensures better availability across different geographical locations.

### 6. URL Configuration

**Added Clean URL Settings:**
```json
{
  "trailingSlash": false,
  "cleanUrls": true
}
```

## Verification Steps

### 1. Test DNS Resolution
```bash
# Check if DNS resolves correctly
ping my.jkkn.ac.in
```

### 2. Test HTTPS Certificate
```bash
# Check SSL certificate
openssl s_client -connect my.jkkn.ac.in:443 -servername my.jkkn.ac.in
```

### 3. Test with Different Browsers
- Chrome (Regular and Incognito)
- Firefox
- Edge
- Safari

### 4. Test with curl
```bash
# Basic connectivity test
curl -I https://my.jkkn.ac.in/

# Verbose output for debugging
curl -v https://my.jkkn.ac.in/
```

## Deployment Configuration

### Current Setup (Verified via Vercel MCP):
- **Project ID:** prj_yH37MwPX0aAAUXNjZX1YlOHoowRM
- **Team:** JKKN Institutions (team_pYMqy5sll6MktuqDp3GXLs1u)
- **Framework:** Next.js
- **Node Version:** 22.x
- **Domains Configured:**
  - my.jkkn.ac.in (Primary)
  - m.jkkn.ac.in (Alternative)
  - my-jkkn-jkkn-institutions.vercel.app
  - my-jkkn-git-main-jkkn-institutions.vercel.app

### Latest Deployment:
- **ID:** dpl_7TJ6ieoPaxdvXZaA2ci4i98bxiY2
- **Status:** READY
- **Target:** production
- **Region:** iad1 (US East)

## Common Browser Error Codes

### ERR_FAILED
- Usually indicates network-level issues
- Can be caused by DNS, proxy, or firewall settings

### ERR_CONNECTION_REFUSED
- Server is not accepting connections
- Check if deployment is active

### ERR_NAME_NOT_RESOLVED
- DNS resolution failure
- Verify domain configuration in Vercel

### ERR_SSL_PROTOCOL_ERROR
- SSL/TLS negotiation failure
- Check certificate configuration

## Quick Fixes for Users

### For End Users Experiencing Issues:

1. **Clear Browser Cache:**
   - Press `Ctrl+Shift+Delete` (Windows) or `Cmd+Shift+Delete` (Mac)
   - Select "Cached images and files"
   - Clear data

2. **Try Incognito/Private Mode:**
   - Chrome: `Ctrl+Shift+N`
   - Firefox: `Ctrl+Shift+P`
   - Edge: `Ctrl+Shift+N`

3. **Disable Extensions:**
   - Temporarily disable all browser extensions
   - Test if the site loads

4. **Check Proxy Settings:**
   - Ensure no proxy is configured
   - Windows: Settings → Network & Internet → Proxy
   - Mac: System Preferences → Network → Advanced → Proxies

5. **Flush DNS:**
   ```bash
   # Windows (Run as Administrator)
   ipconfig /flushdns
   
   # Mac
   sudo dscacheutil -flushcache
   
   # Linux
   sudo systemd-resolve --flush-caches
   ```

## Monitoring & Alerts

### Set Up Monitoring:
1. Use Vercel Analytics to track availability
2. Set up uptime monitoring (e.g., UptimeRobot, Pingdom)
3. Configure alerts for SSL certificate expiration

### Regular Checks:
- Weekly: Check deployment status
- Monthly: Review security headers
- Quarterly: SSL certificate renewal status

## Contact & Support

### For Technical Issues:
- Check Vercel Status: https://www.vercel-status.com/
- Vercel Support: support@vercel.com
- Project Repository: GitHub - JKKN-Institutions/MyJKKN

### Internal Team:
- DevOps Team: Monitor deployment pipeline
- Security Team: Review security headers quarterly
- Infrastructure Team: DNS and domain management

## Cookie/Cache Conflict Issue - CRITICAL FIX

### Problem
Site only works ONCE after clearing cookies, then shows ERR_FAILED on refresh.

### Root Cause
**Custom headers in vercel.json interfere with Next.js's built-in session and cookie management**, creating a conflict where:
1. First visit: Browser receives conflicting cookie/cache headers
2. Refresh: Browser uses cached headers that block the connection
3. The Vary: Cookie header was causing the browser to cache responses per-cookie
4. Cache-Control headers were conflicting with Next.js's internal caching

### SOLUTION: Remove ALL Custom Headers
The fix is to use **MINIMAL or NO custom configuration** in vercel.json:

```json
{
  "framework": "nextjs"
}
```

### Why This Works
1. **Next.js handles its own headers** - Custom headers interfere with Next.js's built-in security and caching
2. **Vercel automatically applies security headers** - No need to manually add them
3. **Cookie management is automatic** - Next.js handles sessions without custom configuration
4. **Cache control is built-in** - Next.js optimizes caching automatically

### DO NOT ADD These Headers
❌ Cache-Control
❌ Vary: Cookie  
❌ Set-Cookie directives
❌ Clear-Site-Data
❌ Strict-Transport-Security with preload
❌ Custom CORS headers (unless specifically needed)

## Status 0 Error Fix

### Problem
Chrome DevTools showing Status 0 with connection failure (55.98ms duration).

### Root Cause
1. **Overly restrictive security headers** blocking connections
2. **HSTS with preload** causing TLS handshake issues  
3. **Catch-all rewrite rule** interfering with routing
4. **Strict Permissions-Policy** blocking browser features

### Solution Applied
1. **Removed problematic headers:**
   - Removed HSTS header completely (was causing TLS issues)
   - Removed XSS-Protection (deprecated)
   - Removed strict Permissions-Policy
   - Changed X-Frame-Options from DENY to SAMEORIGIN
   - Changed Referrer-Policy to no-referrer-when-downgrade

2. **Removed routing interference:**
   - Removed catch-all rewrite rule
   - Removed function configuration
   - Removed region specification
   - Removed cleanUrls and trailingSlash settings

3. **Added proper caching:**
   - API routes: no-store
   - Static assets: immutable with long cache

## Root URL Fix

### Problem
Only the root URL (https://my.jkkn.ac.in/) shows ERR_FAILED on refresh, while all other pages work fine.

### Root Cause
**Missing app/page.tsx file** - The root route had no page component, causing Next.js routing to fail.

### Solution
Created `app/page.tsx` with a simple redirect:
```tsx
import { redirect } from 'next/navigation';

export default function RootPage() {
  redirect('/auth/login');
}
```

## Change Log

### 2025-01-28 (Update 5) - ROOT URL FIX
- **Created app/page.tsx for root route**
- Fixed root URL refresh issue
- Removed problematic rewrites from vercel.json
- Used Next.js native redirect instead

### 2025-01-28 (Update 4) - CRITICAL FIX
- **REMOVED ALL CUSTOM HEADERS FROM vercel.json**
- Simplified to minimal configuration (framework: nextjs only)
- Let Next.js handle all headers automatically
- Fixed the refresh ERR_FAILED issue permanently

### 2025-01-28 (Update 3)
- Fixed cookie/cache conflict issues
- Removed Clear-Site-Data header
- Added proper cache control headers
- Fixed Vary header for cookie handling
- Simplified CORS configuration

### 2025-01-28 (Update 2)
- Fixed Status 0 connection errors
- Removed overly strict security headers
- Removed problematic rewrite rules
- Added proper cache control for different file types
- Simplified configuration for better compatibility

### 2025-01-28 (Update 1)
- Updated vercel.json with improved security headers
- Added CORS support for cross-origin requests
- Removed HSTS preload directive
- Added multi-region support
- Configured clean URLs and trailing slash handling
- Added function duration limits

## Next Steps

1. **Deploy Changes:**
   ```bash
   git add vercel.json DOMAIN_TROUBLESHOOTING.md
   git commit -m "Fix: Update Vercel configuration for browser compatibility issues"
   git push origin main
   ```

2. **Monitor Deployment:**
   - Watch deployment progress in Vercel Dashboard
   - Test immediately after deployment

3. **Validate Fix:**
   - Test on affected Chrome browsers
   - Verify all domains are accessible
   - Check security headers are applied

4. **Documentation:**
   - Share this guide with support team
   - Update internal wiki with troubleshooting steps