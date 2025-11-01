# Admissions Analytics - AI Insights Authentication Fix

## 📋 Overview

Fixed the "User not authenticated" error when generating AI insights in the Admissions Analytics Dashboard.

---

## 🐛 Problem

### **Error:**
```
Error Generating Insights
User not authenticated

[api/admissions/ai-insights] Error: Error: User not authenticated
    at AdmissionService.getDashboardAnalytics (lib\services\admission\admission-service.ts:583:24)
    at async GET (app\api\admissions\ai-insights\route.ts:144:23)
```

### **Root Cause:**

The issue occurred because:

1. **API Route Flow:**
   ```
   Client → API Route → AdmissionService.getDashboardAnalytics()
   ```

2. **The Problem:**
   - API route used **server-side** Supabase client (has access to cookies/auth)
   - API route authenticated the user successfully
   - API route called `AdmissionService.getDashboardAnalytics(filters)`
   - Service tried to get user again using **client-side** Supabase instance
   - Client-side instance doesn't have access to server-side cookies
   - Authentication failed with "User not authenticated"

3. **Why This Happened:**
   ```typescript
   // AdmissionService uses client-side Supabase
   export class AdmissionService {
     private static supabase = createClientSupabaseClient(); // ❌ Client-side

     static async getDashboardAnalytics(filters) {
       const { data: { user } } = await this.supabase.auth.getUser(); // ❌ Can't access server auth
       if (!user) throw new Error('User not authenticated'); // ❌ Throws error
     }
   }
   ```

---

## ✅ Solution

### **Approach:**

Modified `AdmissionService.getDashboardAnalytics()` to:
1. Accept optional server-side Supabase client
2. Accept optional user context (already authenticated user info)
3. Use provided client/context when called from API routes
4. Fall back to client-side auth when called from React hooks

### **Benefits:**
- ✅ No breaking changes to existing code
- ✅ Works from both client-side (React hooks) and server-side (API routes)
- ✅ Avoids duplicate authentication calls
- ✅ Maintains security and institution filtering

---

## 🔧 Changes Made

### **1. Updated AdmissionService.getDashboardAnalytics()**

**File:** `lib/services/admission/admission-service.ts`

**Before:**
```typescript
static async getDashboardAnalytics(
  filters: AdmissionAnalyticsFilters = {}
): Promise<AdmissionDashboardAnalytics> {
  // Always tries to get user from client-side instance
  const { data: { user } } = await this.supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated'); // ❌ Fails in API routes

  const { data: profile } = await this.supabase
    .from('profiles')
    .select('institution_id, is_super_admin, role')
    .eq('id', user.id)
    .single();

  // ... rest of code
}
```

**After:**
```typescript
static async getDashboardAnalytics(
  filters: AdmissionAnalyticsFilters = {},
  supabaseClient?: any,                                    // ✅ Optional server client
  userContext?: {                                          // ✅ Optional user context
    userId: string;
    institutionId?: string;
    isSuperAdmin: boolean;
  }
): Promise<AdmissionDashboardAnalytics> {
  // Use provided client or default to class instance
  const supabase = supabaseClient || this.supabase;       // ✅ Flexible client

  let effectiveFilters = { ...filters };

  // If user context is provided (from API route), use it directly
  if (userContext) {                                       // ✅ Skip auth if context provided
    if (!userContext.isSuperAdmin && userContext.institutionId) {
      effectiveFilters.institution_id = userContext.institutionId;
    }
  } else {
    // Otherwise, get current user from client-side auth
    const { data: { user } } = await supabase.auth.getUser(); // ✅ Only when needed
    if (!user) throw new Error('User not authenticated');

    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id, is_super_admin, role')
      .eq('id', user.id)
      .single();

    const isSuperAdmin = profile?.is_super_admin || profile?.role === 'super_admin';
    if (!isSuperAdmin && profile?.institution_id) {
      effectiveFilters.institution_id = profile.institution_id;
    }
  }

  // Build base query using flexible client
  let baseQuery = supabase.from('admissions').select('*', { count: 'exact' }); // ✅ Uses correct client

  // ... rest of code
}
```

**Changes:**
1. Added optional `supabaseClient` parameter
2. Added optional `userContext` parameter with user info
3. Use provided client or fall back to default
4. Skip authentication if user context is provided
5. Updated base query to use the flexible `supabase` variable

### **2. Updated API Route**

**File:** `app/api/admissions/ai-insights/route.ts`

**Before:**
```typescript
// API route already authenticated user
const { data: { user } } = await supabase.auth.getUser();
const { data: profile } = await supabase.from('profiles')...;

// But then passed nothing to service
const analytics = await AdmissionService.getDashboardAnalytics(filters);
// ❌ Service tries to authenticate again with wrong client
```

**After:**
```typescript
// API route authenticates user
const { data: { user } } = await supabase.auth.getUser();
const { data: profile } } = await supabase.from('profiles')...;

// Create user context from already-authenticated user
const userContext = {
  userId: user.id,
  institutionId: profile.institution_id,
  isSuperAdmin: profile.is_super_admin || false
};

// Pass server client and user context to service
const analytics = await AdmissionService.getDashboardAnalytics(
  filters,
  supabase,      // ✅ Server-side client with auth access
  userContext    // ✅ Already-authenticated user info
);
// ✅ Service skips authentication, uses provided context
```

**Changes:**
1. Created `userContext` object with authenticated user info
2. Passed server-side `supabase` client to service
3. Passed `userContext` to service
4. Service now uses server-side client and skips re-authentication

---

## 🔄 How It Works Now

### **Client-Side Flow (React Hooks):**
```typescript
// In React component
const { data: analytics } = useAdmissionAnalytics(filters);

// Hook calls service without parameters
const analytics = await AdmissionService.getDashboardAnalytics(filters);

// Service uses default client-side instance
const supabase = supabaseClient || this.supabase; // Uses this.supabase
const { data: { user } } = await supabase.auth.getUser(); // ✅ Works

// ✅ Success - client-side auth works normally
```

### **Server-Side Flow (API Route):**
```typescript
// In API route
const supabase = await createServerSupabaseClient();
const { data: { user } } = await supabase.auth.getUser();
const { data: profile } } = await supabase.from('profiles')...;

const userContext = {
  userId: user.id,
  institutionId: profile.institution_id,
  isSuperAdmin: profile.is_super_admin
};

// Call service with server client and user context
const analytics = await AdmissionService.getDashboardAnalytics(
  filters,
  supabase,
  userContext
);

// Service uses provided client and context
if (userContext) {
  // ✅ Skips authentication - uses provided context
  effectiveFilters.institution_id = userContext.institutionId;
}

// ✅ Success - uses server-side client and already-authenticated user
```

---

## 🎯 Key Improvements

### **1. Flexible Authentication**
- Service method works from both client and server
- Accepts optional parameters for server-side usage
- Falls back to default behavior for client-side usage

### **2. No Breaking Changes**
- Existing client-side code continues to work
- React hooks don't need to change
- Only API routes use the new parameters

### **3. Better Performance**
- Avoids duplicate authentication calls
- API route authenticates once, service uses that result
- Fewer database queries

### **4. Maintains Security**
- Institution filtering still enforced
- Permission checks remain in place
- Super admin logic preserved

---

## 🧪 Testing

### **Test Client-Side (React Hooks):**
```typescript
// Should work without changes
const { data: analytics } = useAdmissionAnalytics(filters);
// ✅ Uses client-side auth as before
```

### **Test Server-Side (AI Insights):**
```typescript
// Click "Generate AI Insights" button
// Should no longer show "User not authenticated"
// ✅ Uses server-side client with user context
```

---

## 📝 Summary

**Problem:**
- AI insights API route failed with "User not authenticated"
- Service tried to use client-side Supabase in server context

**Solution:**
- Made service accept optional server-side client and user context
- API route passes authenticated user info to service
- Service uses provided context instead of re-authenticating

**Result:**
- ✅ AI insights generation works correctly
- ✅ No breaking changes to existing code
- ✅ Maintains security and institution filtering
- ✅ Better performance with fewer auth calls

**The authentication error is now fixed!** 🎉

---

*Updated: January 17, 2025*
*Files Modified:*
- `lib/services/admission/admission-service.ts`
- `app/api/admissions/ai-insights/route.ts`
