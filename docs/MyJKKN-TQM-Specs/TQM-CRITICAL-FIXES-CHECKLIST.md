# TQM Critical Fixes Checklist

**Date:** 2026-02-05
**Status:** URGENT - Production Blocking Issues
**Report:** See `TQM-COMPREHENSIVE-TEST-REPORT-2026-02-05.md`

---

## P0 - CRITICAL (Fix Immediately)

### 1. Parent Portal QueryClient Error ❌

**File:** `app/(routes)/parent-portal/page.tsx`

**Issue:** Page crashes with QueryClient error when accessed from admin dashboard

**Fix:**
```typescript
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function ParentPortalPage() {
  const router = useRouter();
  const [parentSession, setParentSession] = useState<string | null>(null);

  useEffect(() => {
    // Check for parent session
    const storedParentId = sessionStorage.getItem('parent_portal_id');
    if (storedParentId && /^[a-zA-Z0-9-_]+$/.test(storedParentId)) {
      setParentSession(storedParentId);
    }
  }, []);

  // If no parent session, show info card
  if (!parentSession) {
    return (
      <div className="container max-w-2xl mx-auto py-10">
        <Card>
          <CardHeader>
            <CardTitle>Parent Portal</CardTitle>
            <CardDescription>
              The Parent Portal uses separate authentication for security.
              Parents access this portal via OTP-based phone authentication.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This portal is designed for parents to:
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              <li>View their child's academic progress</li>
              <li>Track attendance and grades</li>
              <li>Communicate with teachers</li>
              <li>Manage fee payments</li>
              <li>Submit feedback</li>
            </ul>
            <div className="flex gap-4 pt-4">
              <Button asChild>
                <Link href="/auth/parent/login">
                  Parent Login
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/dashboard">
                  Back to Dashboard
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // If parent session exists, show portal
  return (
    <div>
      {/* Import actual parent portal client here */}
      <p>Parent Portal Dashboard</p>
    </div>
  );
}
```

**Estimated Time:** 15 minutes

**Test:**
```bash
# Open in browser
open https://myjkkn-omm-dev.vercel.app/parent-portal

# Should show info card with "Parent Login" button
# Should NOT crash
```

---

### 2. Process Excellence - New Definition Route 404 ❌

**File:** `app/(routes)/process-excellence/definitions/new/page.tsx`

**Issue:** Route returns 404 when accessed via "New Process" button

**Debug Steps:**

1. **Check file exists:**
```bash
ls -la /Users/omm/PROJECTS/MyJKKN/app/\(routes\)/process-excellence/definitions/new/page.tsx
```

2. **Verify page export:**
```typescript
// File should have default export
export default function NewProcessDefinitionPage() {
  return <ProcessDefinitionForm />;
}
```

3. **Check for build errors:**
```bash
cd /Users/omm/PROJECTS/MyJKKN
npm run build 2>&1 | grep -i "process-excellence"
```

4. **If file is missing or incorrect, create it:**

```typescript
'use client';

import { useRouter } from 'next/navigation';
import { ProcessDefinitionForm } from '../../_components/process-definition-form';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function NewProcessDefinitionPage() {
  const router = useRouter();

  return (
    <div className="container max-w-4xl mx-auto py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/process-excellence/definitions">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Definitions
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New Process Definition</CardTitle>
          <CardDescription>
            Define a new auditable process with stages, SLAs, and value-add targets
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProcessDefinitionForm />
        </CardContent>
      </Card>
    </div>
  );
}
```

**Estimated Time:** 15 minutes

**Test:**
```bash
# Navigate to definitions page
open https://myjkkn-omm-dev.vercel.app/process-excellence/definitions

# Click "New Process" button
# Should open form, NOT 404
```

---

## P1 - HIGH (Fix This Session)

### 3. Assign Institution to Test User ⚠️

**Issue:** test-superadmin cannot access NPS module due to missing institution assignment

**SQL Fix:**
```sql
-- Connect to Supabase staging: hhprjbgknupaplivtoib

-- First, check if institutions exist
SELECT id, institution_name FROM institutions LIMIT 5;

-- If no institutions, create test institution
INSERT INTO institutions (
  institution_name,
  institution_code,
  institution_type,
  address,
  city,
  state,
  postal_code,
  country
) VALUES (
  'JKKN College of Engineering',
  'JKKN-COE',
  'college',
  '123 Test Street',
  'Erode',
  'Tamil Nadu',
  '638183',
  'India'
) ON CONFLICT (institution_code) DO NOTHING
RETURNING id;

-- Assign test-superadmin to institution
INSERT INTO institution_user_access (user_id, institution_id, role)
SELECT
  p.id,
  i.id,
  'admin'
FROM profiles p
CROSS JOIN institutions i
WHERE p.email = 'test-superadmin@jkkn.local'
  AND i.institution_code = 'JKKN-COE'
ON CONFLICT (user_id, institution_id) DO NOTHING;

-- Verify assignment
SELECT
  p.email,
  i.institution_name,
  iua.role
FROM institution_user_access iua
JOIN profiles p ON p.id = iua.user_id
JOIN institutions i ON i.id = iua.institution_id
WHERE p.email = 'test-superadmin@jkkn.local';
```

**Estimated Time:** 5 minutes

**Test:**
```bash
# Logout and login again
open https://myjkkn-omm-dev.vercel.app/stakeholder-nps

# Should NOT show "You need to be assigned to an institution"
# Should show NPS dashboard
```

---

### 4. Fix Grievance Analytics 404 ⚠️

**File:** `app/(routes)/grievance/analytics/page.tsx`

**Issue:** Direct navigation to `/grievance/analytics` returns 404

**Debug Steps:**

1. **Check if file exists:**
```bash
ls -la /Users/omm/PROJECTS/MyJKKN/app/\(routes\)/grievance/analytics/
```

2. **Check file content:**
```bash
cat /Users/omm/PROJECTS/MyJKKN/app/\(routes\)/grievance/analytics/page.tsx | head -20
```

3. **If missing export, fix it:**
```typescript
// Should have default export
export default function GrievanceAnalyticsPage() {
  return <GrievanceAnalyticsClient />;
}
```

4. **Alternative: Redirect to dashboard**
```typescript
import { redirect } from 'next/navigation';

export default function GrievanceAnalyticsPage() {
  redirect('/grievance/dashboard');
}
```

**Estimated Time:** 10 minutes

**Test:**
```bash
open https://myjkkn-omm-dev.vercel.app/grievance/analytics

# Should either show analytics OR redirect to dashboard
# Should NOT show 404
```

---

## P2 - MEDIUM (Fix Soon)

### 5. Investigate Maturity Assessment Redirect ⚠️

**File:** `app/(routes)/maturity-assessment/page.tsx`

**Issue:** Page redirects to main dashboard instead of showing maturity content

**Debug Steps:**

1. **Check page content:**
```bash
cat /Users/omm/PROJECTS/MyJKKN/app/\(routes\)/maturity-assessment/page.tsx
```

2. **Look for redirect logic:**
```typescript
// Check for:
// - redirect() calls
// - useRouter().push() calls
// - middleware redirects
```

3. **Check if institution access is required:**
```typescript
// May need similar fix as NPS:
const { institution } = useUserInstitutionAccess();

if (!institution) {
  return <NoInstitutionMessage />;
}
```

**Estimated Time:** 20 minutes

---

### 6. Create Comprehensive Test Data 📊

**File:** `supabase/migrations/YYYYMMDD_test_data.sql`

**Test Data Needed:**

1. **Stakeholder NPS:**
```sql
-- Create sample survey
INSERT INTO nps_surveys (
  institution_id,
  stakeholder_type,
  start_date,
  end_date,
  status
) VALUES (
  (SELECT id FROM institutions WHERE institution_code = 'JKKN-COE'),
  'learners',
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '30 days',
  'active'
);
```

2. **Process Excellence:**
```sql
-- Create sample process definition
INSERT INTO process_definitions (
  institution_id,
  name,
  description,
  category,
  value_add_target,
  sla_hours
) VALUES (
  (SELECT id FROM institutions WHERE institution_code = 'JKKN-COE'),
  'Student Admission Process',
  'Complete admission workflow from application to enrollment',
  'academic',
  0.70,
  48
);
```

3. **Grievance:**
```sql
-- Create sample grievance category
INSERT INTO grievance_categories (
  institution_id,
  name,
  description,
  sla_hours
) VALUES (
  (SELECT id FROM institutions WHERE institution_code = 'JKKN-COE'),
  'Academic Issues',
  'Course registration, grade concerns, academic advising',
  48
);

-- Create sample ticket
INSERT INTO grievance_tickets (
  institution_id,
  raised_by,
  category_id,
  subject,
  description,
  priority,
  status
) VALUES (
  (SELECT id FROM institutions WHERE institution_code = 'JKKN-COE'),
  (SELECT id FROM profiles WHERE email = 'test-superadmin@jkkn.local'),
  (SELECT id FROM grievance_categories WHERE name = 'Academic Issues' LIMIT 1),
  'Unable to register for elective course',
  'The system shows the course as full but I checked and there are seats available',
  'high',
  'open'
);
```

4. **Maturity Assessment:**
```sql
-- Create sample assessment
INSERT INTO maturity_assessments (
  institution_id,
  department_id,
  assessed_by,
  assessment_date,
  overall_stage
) VALUES (
  (SELECT id FROM institutions WHERE institution_code = 'JKKN-COE'),
  (SELECT id FROM departments WHERE department_code = 'CSE' LIMIT 1),
  (SELECT id FROM profiles WHERE email = 'test-superadmin@jkkn.local'),
  CURRENT_DATE,
  'managed'
);
```

**Estimated Time:** 1 hour

---

## Test Verification Checklist

After fixes, run these tests:

### Stakeholder NPS
- [ ] Navigate to `/stakeholder-nps` - should NOT show institution error
- [ ] Click "New Survey" - form should open
- [ ] Navigate to `/stakeholder-nps/surveys` - should show surveys
- [ ] Navigate to `/stakeholder-nps/analytics` - should show charts

### Process Excellence
- [ ] Navigate to `/process-excellence/definitions` - should load
- [ ] Click "New Process" - form should open (NOT 404)
- [ ] Navigate to `/process-excellence/audits` - should load
- [ ] Navigate to `/process-excellence/waste` - should load

### Parent Portal
- [ ] Navigate to `/parent-portal` - should show info card (NOT crash)
- [ ] Click "Parent Login" - should go to `/auth/parent/login`
- [ ] Click "Back to Dashboard" - should go to `/dashboard`

### Grievance
- [ ] Navigate to `/grievance` - should load dashboard
- [ ] Navigate to `/grievance/analytics` - should load OR redirect (NOT 404)
- [ ] Click "Raise Grievance" - form should open
- [ ] Navigate to `/grievance/tickets` - should show tickets

### Maturity Assessment
- [ ] Navigate to `/maturity-assessment` - should show assessment dashboard
- [ ] Navigate to `/maturity-assessment/assessments` - should show list
- [ ] Click "New Assessment" - form should open

### OKR ABCD
- [ ] Navigate to `/okr/abcd` - should show matrix ✅ (already passing)

### Billing COPQ
- [ ] Navigate to `/billing/copq` - should show dashboard ✅ (already passing)

---

## Deployment Workflow

After all fixes:

1. **Test locally:**
```bash
npm run dev
# Test all modules manually
```

2. **Commit changes:**
```bash
git add .
git commit -m "fix: resolve critical TQM module issues

- Fix Parent Portal QueryClient error with proper session check
- Fix Process Excellence new definition 404 route
- Add institution assignment for test user
- Fix Grievance analytics route
- Create comprehensive test data

Fixes issues identified in TQM-COMPREHENSIVE-TEST-REPORT-2026-02-05.md"
```

3. **Push to staging:**
```bash
git push origin omm-dev
```

4. **Apply database changes:**
```bash
# Run SQL scripts in Supabase dashboard
# Or use migration files
```

5. **Verify deployment:**
```bash
# Use browser-use or manual testing
# Check all modules again
```

6. **Create new test report:**
```bash
# Run comprehensive tests again
# Document all modules passing
```

---

## Success Criteria

✅ **All modules accessible (no 404s)**
✅ **All modules load without errors**
✅ **Test data visible in all modules**
✅ **Forms functional for creating new records**
✅ **Dashboard metrics calculating correctly**
✅ **No console errors**
✅ **Mobile responsive (future test)**

---

*Last Updated: 2026-02-05*
*See: TQM-COMPREHENSIVE-TEST-REPORT-2026-02-05.md for full details*
