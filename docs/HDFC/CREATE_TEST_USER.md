# Create Test User for Payment Testing

## Quick Guide: Create Email/Password Test User

Since Google OAuth redirects to jkkn.ai, you can create a test user with email/password to test locally.

### Method 1: Using Supabase Dashboard (Easiest)

1. Go to: [Supabase Dashboard](https://supabase.com/dashboard)
2. Select project: **hhprjbgknupaplivtoib**
3. Go to: **Authentication** → **Users**
4. Click: **Add User** → **Create new user**
5. Fill in:
   - **Email**: `test-payment@jkkn.ac.in`
   - **Password**: `Test@123456`
   - **Auto Confirm User**: ✅ Check this
6. Click: **Create user**

### Method 2: Create Profile and Assign Role

After creating the user, you need to:

1. **Get the user ID** from the users table
2. **Create a profile** in the `profiles` table:

```sql
-- Run in Supabase SQL Editor
-- Replace 'USER_ID_HERE' with the actual user ID from step 1

-- Create profile
INSERT INTO profiles (id, role, email, full_name)
VALUES (
  'USER_ID_HERE',
  'super_admin',  -- or 'admin', 'staff' depending on what you need
  'test-payment@jkkn.ac.in',
  'Test Payment User'
);

-- Link to an institution (if needed)
INSERT INTO user_institution_access (user_id, institution_id, role)
VALUES (
  'USER_ID_HERE',
  (SELECT id FROM institutions LIMIT 1),  -- Gets first institution
  'admin'
);
```

### Method 3: Use Existing User

If you already have a user with email/password login:

1. Just login with that user
2. Test the payment flow

---

## Testing with Test User

1. **Access**: `http://localhost:3000`
2. **Login with**:
   - Email: `test-payment@jkkn.ac.in`
   - Password: `Test@123456`
3. **Navigate to**: Billing → Students
4. **Test payment flow**

---

## Cleanup After Testing

After testing is complete, you can delete the test user:

```sql
-- Delete test user and related data
DELETE FROM user_institution_access WHERE user_id = 'USER_ID_HERE';
DELETE FROM profiles WHERE id = 'USER_ID_HERE';
-- User will be auto-deleted from auth.users
```

---

## Note

This is only needed if you don't want to update Supabase Site URL settings.

**Better solution**: Update Supabase Site URL to `http://localhost:3000` as described in the main testing guide.
