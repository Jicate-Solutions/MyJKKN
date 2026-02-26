# Database Setup Checklist

**Current Status**: ✅ Google OAuth working, ❌ Database schema missing

---

## Quick Setup Steps

### 1. Open Supabase SQL Editor
- [ ] Go to: https://supabase.com/dashboard/project/zwiasdpodeirxnybwvuw/sql/new
- [ ] Keep this tab open

### 2. Run SQL Files (In Order)

#### File 1: Master Setup
- [ ] Open: `supabase/setup/00_master_setup.sql` in your code editor
- [ ] Copy entire file contents (Ctrl+A, Ctrl+C)
- [ ] Paste in Supabase SQL Editor
- [ ] Click **Run** button (or Ctrl+Enter)
- [ ] Wait for "Success" message ✅
- [ ] Clear the editor for next file

#### File 2: Tables
- [ ] Open: `supabase/setup/01_tables.sql`
- [ ] Copy entire file contents
- [ ] Paste in Supabase SQL Editor
- [ ] Click **Run**
- [ ] Wait for "Success" ✅
- [ ] Clear the editor

#### File 3: Functions
- [ ] Open: `supabase/setup/02_functions.sql`
- [ ] Copy entire file
- [ ] Paste in SQL Editor
- [ ] Click **Run**
- [ ] Wait for "Success" ✅
- [ ] Clear the editor

#### File 4: Policies (Security)
- [ ] Open: `supabase/setup/03_policies.sql`
- [ ] Copy entire file
- [ ] Paste in SQL Editor
- [ ] Click **Run**
- [ ] Wait for "Success" ✅
- [ ] Clear the editor

#### File 5: Triggers
- [ ] Open: `supabase/setup/04_triggers.sql`
- [ ] Copy entire file
- [ ] Paste in SQL Editor
- [ ] Click **Run**
- [ ] Wait for "Success" ✅
- [ ] Clear the editor

#### File 6: Views
- [ ] Open: `supabase/setup/05_views.sql`
- [ ] Copy entire file
- [ ] Paste in SQL Editor
- [ ] Click **Run**
- [ ] Wait for "Success" ✅
- [ ] Clear the editor

#### File 7: Foreign Keys
- [ ] Open: `supabase/setup/06_foreign_keys.sql`
- [ ] Copy entire file
- [ ] Paste in SQL Editor
- [ ] Click **Run**
- [ ] Wait for "Success" ✅

### 3. Verify Setup
- [ ] In Supabase SQL Editor, paste contents of `verify-database-setup.sql`
- [ ] Click **Run**
- [ ] Check that results show:
  - ✅ profiles table exists
  - ✅ RLS enabled
  - ✅ Multiple tables created
  - ✅ Extensions installed

### 4. Test in Application
- [ ] Open browser: `http://localhost:3000/auth/login`
- [ ] Click **Continue with Google**
- [ ] Sign in with Google account
- [ ] **Expected**: See "Complete Profile" page (not error!)
- [ ] Fill in profile details:
  - [ ] Full name
  - [ ] Phone number (optional)
  - [ ] Select institution
  - [ ] Select role
- [ ] Click **Complete Profile**
- [ ] **Expected**: Redirected to dashboard ✅

---

## Success Indicators

You'll know it worked when:
1. ✅ No "table not found" errors
2. ✅ Can see "Complete Profile" page
3. ✅ Can submit profile form
4. ✅ Get redirected to dashboard
5. ✅ Can see your profile data

---

## If You Get Errors

### "relation already exists"
**Fix**: Ignore - this is harmless, table already created

### "permission denied"
**Fix**: Make sure you're logged into Supabase as project owner

### "syntax error"
**Fix**: Make sure you copied the ENTIRE file contents

### Still seeing "table not found" after running SQL
**Fix**:
1. Check Supabase → Table Editor (left sidebar)
2. Verify "profiles" table is listed
3. Refresh browser/restart dev server
4. Try login again

---

## Estimated Time

- SQL Setup: **5-10 minutes**
- Verification: **2 minutes**
- Testing: **2 minutes**
- **Total: ~15 minutes**

---

**Need detailed instructions?** See: `SETUP_DATABASE.md`
**Need to verify?** Run: `verify-database-setup.sql`
