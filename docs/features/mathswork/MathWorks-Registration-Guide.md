# MathWorks LTI 1.3 Registration Guide

**Purpose:** Complete LTI 1.3 registration with MathWorks for MATLAB Grader integration
**Created:** 2026-01-12
**Prerequisites:** Phase 1-3 complete, RSA keys generated

---

## Overview

This guide walks through registering MyJKKN as an LTI 1.3 platform with MathWorks to enable MATLAB Grader integration with single sign-on (SSO).

**What You'll Achieve:**
- Students can launch MATLAB Grader from MyJKKN with one click
- No separate MATLAB login required (SSO)
- Grades automatically sync from MATLAB to MyJKKN
- Faculty see correct student rosters in MATLAB

---

## Step 1: Prepare MyJKKN Endpoints

Before contacting MathWorks, ensure these endpoints are deployed and accessible:

### Required Endpoints

| Endpoint | URL | Purpose |
|----------|-----|---------|
| **JWKS (Public Key)** | `https://jkkn.ai/api/lti/jwks` | Tool verifies JWT signatures |
| **OIDC Login** | `https://jkkn.ai/api/lti/auth` | Handle login initiation |
| **OAuth Token** | `https://jkkn.ai/api/lti/token` | Issue access tokens for services |
| **Redirect URI** | `https://jkkn.ai/api/lti/callback` | Handle authentication responses |

### Verify Endpoints Are Live

```bash
# Test JWKS endpoint
curl https://jkkn.ai/api/lti/jwks

# Expected response:
# {
#   "keys": [
#     {
#       "kty": "RSA",
#       "use": "sig",
#       "alg": "RS256",
#       "kid": "myjkkn-2026-key-001",
#       "n": "...",
#       "e": "AQAB"
#     }
#   ]
# }
```

---

## Step 2: Contact MathWorks LTI Support

### Email Template

**To:** lti-support@mathworks.com
**Subject:** LTI 1.3 Platform Registration Request - JKKN College of Engineering

**Body:**
```
Dear MathWorks LTI Support Team,

We would like to register our learning management system, MyJKKN, as an LTI 1.3
platform to integrate MATLAB Grader for our students and faculty.

Institution Information:
- Institution Name: JKKN College of Engineering
- Institution Type: Engineering College
- Location: Tamil Nadu, India
- Expected Users: 10,000+ students and faculty
- Current MATLAB Users: 7 (expanding to full institution)

Platform Information:
- Platform Name: MyJKKN
- Platform URL: https://jkkn.ai
- Platform Type: Custom Next.js LMS with Supabase
- LTI 1.3 Implementation: Complete

LTI 1.3 Endpoints:
- Platform Issuer: https://jkkn.ai
- JWKS URL: https://jkkn.ai/api/lti/jwks
- OIDC Login URL: https://jkkn.ai/api/lti/auth
- OAuth Token URL: https://jkkn.ai/api/lti/token
- Redirect URI: https://jkkn.ai/api/lti/callback

Services Required:
- MATLAB Grader (Primary)
- Assignment and Grade Services (AGS) - for grade passback
- Names and Roles Provisioning Service (NRPS) - for roster sync

Technical Contact:
- Name: [Your Name]
- Email: [Your Email]
- Phone: [Your Phone]

Could you please provide us with:
1. Client ID for our platform
2. Deployment ID
3. Your LTI endpoints (Launch URL, JWKS URL, OIDC Auth URL, Redirect URI)
4. Any additional configuration requirements

We are ready to begin testing as soon as we receive the credentials.

Thank you for your assistance!

Best regards,
[Your Name]
[Your Title]
JKKN College of Engineering
```

---

## Step 3: Wait for MathWorks Response

**Typical Response Time:** 2-5 business days

**What MathWorks Will Provide:**

1. **Client ID** - Unique identifier for MyJKKN
   - Format: Usually a long alphanumeric string
   - Example: `abc123def456ghi789jkl012mno345pqr678`

2. **Deployment ID** - Deployment identifier
   - Format: Usually numeric or short string
   - Example: `1` or `deployment-jkkn-001`

3. **Tool Endpoints:**
   - Launch URL: `https://learningtool.mathworks.com/v1p3/launch`
   - JWKS URL: `https://learningtool.mathworks.com/lti/jwk`
   - OIDC Auth URL: `https://learningtool.mathworks.com/lti/oidc`
   - Redirect URI: `https://learningtool.mathworks.com/lti/redirect`

4. **Additional Information:**
   - Supported LTI message types
   - Available services (AGS, NRPS, Deep Linking)
   - Custom parameters (if any)

---

## Step 4: Register Tool in MyJKKN

Once you receive credentials from MathWorks:

### 4.1 Login to MyJKKN Admin

1. Navigate to: `https://jkkn.ai`
2. Login with super_admin or administrator account
3. Go to: **System → LTI Tools Management**

### 4.2 Register MATLAB Grader Tool

Click **"Register New Tool"** and fill in the form:

#### Basic Information
- **Tool Name:** `MATLAB Grader`
- **Tool Type:** `matlab_grader`

#### LTI 1.3 Configuration
- **Client ID:** `[from MathWorks]`
- **Deployment ID:** `[from MathWorks]`
- **Platform ID:** `https://jkkn.ai` (auto-filled)

#### Endpoint URLs
- **Launch URL:** `https://learningtool.mathworks.com/v1p3/launch`
- **Public Keyset URL (JWKS):** `https://learningtool.mathworks.com/lti/jwk`
- **OIDC Auth URL:** `https://learningtool.mathworks.com/lti/oidc`
- **Redirect URI:** `https://learningtool.mathworks.com/lti/redirect`

#### Features (Enable All)
- ✅ **Grade Passback (AGS)** - Tool can send grades to MyJKKN
- ✅ **Names & Roles (NRPS)** - Tool can fetch student roster
- ✅ **Deep Linking** - Tool supports content selection

#### Status & License
- ✅ **Active** - Enabled
- **License Expiry Date:** `[if applicable]`

Click **"Register Tool"** to save.

### 4.3 Link to Application Hub

Update the MATLAB Grader application record:

```sql
-- Update MATLAB Grader application with LTI tool ID
UPDATE applications
SET
  lti_tool_id = '[newly_created_lti_tool_id]',
  integration_type = 'lti_1.3',
  uses_parent_auth = true,
  auth_method = 'sso'
WHERE name = 'MATLAB Grader';
```

Or via admin UI:
1. Go to: **Applications → Application Hub Management**
2. Find "MATLAB Grader"
3. Click **Edit**
4. Set **Integration Type:** `lti_1.3`
5. Set **LTI Tool:** Select "MATLAB Grader" from dropdown
6. Save changes

---

## Step 5: Test the Integration

### 5.1 Test as Student

1. **Login as Student Account:**
   - Use a test student account with:
     - Active learner profile (`lifecycle_status = 'active'`)
     - Assigned to program, semester, section

2. **Navigate to Application Hub:**
   - Go to: **Applications → Application Hub**
   - Locate "MATLAB Grader" card

3. **Launch MATLAB Grader:**
   - Click **"Open"** button
   - Should see loading animation
   - New popup window opens with "Launching..." screen
   - Should redirect to MATLAB Grader (5-10 seconds)

4. **Verify SSO:**
   - ✅ No MATLAB login screen should appear
   - ✅ Student should land directly in MATLAB Grader
   - ✅ Student name should display correctly
   - ✅ Enrolled in correct course/section

5. **Check Launch Record:**
   ```sql
   SELECT
     ll.id,
     ll.launched_at,
     ll.user_role_sent,
     ll.context_label,
     u.email AS user_email
   FROM lti_launches ll
   JOIN auth.users u ON ll.user_id = u.id
   ORDER BY ll.launched_at DESC
   LIMIT 5;
   ```

### 5.2 Test as Faculty

1. **Login as Faculty Account**

2. **Launch MATLAB Grader:**
   - Should receive "Instructor" role instead of "Learner"
   - Should have instructor privileges in MATLAB

3. **Create Test Assignment:**
   - Create a simple MATLAB problem
   - Assign to test section
   - Verify students see the assignment

### 5.3 Test Roster Sync (NRPS)

1. **In MATLAB Grader (as Faculty):**
   - View course roster
   - Should see all active students from section
   - Student names and emails should match MyJKKN data

2. **Add New Student in MyJKKN:**
   - Add new student to section
   - Set `lifecycle_status = 'active'`
   - Wait ~5 minutes for cache to clear

3. **Refresh Roster in MATLAB:**
   - New student should appear

### 5.4 Test Grade Passback (AGS)

1. **In MATLAB Grader (as Student):**
   - Complete an assignment
   - Submit solution
   - Wait for auto-grading

2. **Check Grade in MyJKKN:**
   ```sql
   SELECT
     lg.resource_link_title,
     lg.score,
     lg.score_maximum,
     lg.score_percentage,
     lg.graded_at,
     lg.synced_to_gradebook
   FROM lti_grades lg
   WHERE user_id = '[student_user_id]'
   ORDER BY lg.graded_at DESC;
   ```

3. **Verify Grade Appeared:**
   - Navigate to: **My Grades** (student view)
   - Should see MATLAB assignment with score

---

## Step 6: Troubleshooting

### Issue 1: Launch Fails with "Tool not found"

**Symptoms:**
- Error: "No registered LTI tool found"
- Launch button doesn't work

**Solution:**
```sql
-- Check tool registration
SELECT id, name, is_active, client_id
FROM lti_tools
WHERE name LIKE '%MATLAB%';

-- Check application link
SELECT id, name, integration_type, lti_tool_id
FROM applications
WHERE name = 'MATLAB Grader';
```

### Issue 2: JWT Signature Verification Fails

**Symptoms:**
- MATLAB shows "Invalid signature" error
- Launch redirects but shows error page

**Solutions:**
1. **Verify JWKS Endpoint:**
   ```bash
   curl https://jkkn.ai/api/lti/jwks
   # Should return valid JWK
   ```

2. **Check Private Key Format:**
   - Verify `LTI_PRIVATE_KEY` environment variable
   - Ensure newlines are escaped as `\n`
   - No extra spaces or line breaks

3. **Regenerate Keys if Needed:**
   - Follow: `docs/features/mathswork/RSA-Key-Generation-Guide.md`
   - Update Vercel environment variables
   - Redeploy application

### Issue 3: Student Shows as Inactive

**Symptoms:**
- Error: "Your student account is not active"

**Solution:**
```sql
-- Check learner profile status
SELECT
  lp.id,
  lp.first_name,
  lp.last_name,
  lp.lifecycle_status,
  lp.program_id,
  lp.semester_id,
  lp.section_id
FROM learners_profiles lp
WHERE lp.user_id = '[student_user_id]';

-- Activate learner if needed
UPDATE learners_profiles
SET lifecycle_status = 'active'
WHERE user_id = '[student_user_id]';
```

### Issue 4: No Context in MATLAB

**Symptoms:**
- Student launches successfully
- But not enrolled in any course/section in MATLAB

**Cause:** Missing academic assignment

**Solution:**
```sql
-- Assign student to program, semester, section
UPDATE learners_profiles
SET
  program_id = '[program_uuid]',
  semester_id = '[semester_uuid]',
  section_id = '[section_uuid]',
  academic_year_id = '[academic_year_uuid]'
WHERE user_id = '[student_user_id]';
```

### Issue 5: Grade Passback Not Working

**Symptoms:**
- Student completes assignment in MATLAB
- Grade doesn't appear in MyJKKN

**Solutions:**
1. **Check Tool Configuration:**
   ```sql
   SELECT supports_grade_passback
   FROM lti_tools
   WHERE name = 'MATLAB Grader';
   -- Should be TRUE
   ```

2. **Check Grade Records:**
   ```sql
   SELECT * FROM lti_grades
   ORDER BY received_at DESC
   LIMIT 10;
   ```

3. **Check OAuth Token Endpoint:**
   - MATLAB needs valid access token
   - Test token endpoint manually
   - Check logs for token request errors

---

## Step 7: Production Rollout

### 7.1 Pilot Testing (Week 1)

- **Pilot Group:** 5 faculty + 50 students
- **Duration:** 1 week
- **Monitor:**
  - Launch success rate (target: >95%)
  - Average launch time (target: <2s)
  - Grade sync accuracy (target: 100%)
  - User feedback

### 7.2 Gradual Rollout (Week 2-3)

- **Week 2:** Expand to 1 department (~500 students)
- **Week 3:** Expand to 3 departments (~1,500 students)
- **Monitor:** Same metrics as pilot

### 7.3 Full Rollout (Week 4)

- **Enable for all institutions**
- **Notify all students and faculty**
- **Provide training materials**

---

## Step 8: Ongoing Maintenance

### Weekly Tasks
- [ ] Monitor launch success rate
- [ ] Check for failed grade syncs
- [ ] Review error logs

### Monthly Tasks
- [ ] Review usage analytics
- [ ] Check license expiry (if applicable)
- [ ] Update documentation as needed

### Quarterly Tasks
- [ ] Rotate RSA keys (see RSA-Key-Generation-Guide.md)
- [ ] Review and update RLS policies
- [ ] Conduct security audit

---

## Support Contacts

### MathWorks Support
- **Email:** lti-support@mathworks.com
- **Documentation:** https://www.mathworks.com/help/matlab-grader/lti-integration.html

### Internal Support
- **MyJKKN Admin Team:** [Your Email]
- **Technical Issues:** [Support Email]

---

## Checklist

Before contacting MathWorks:
- [ ] All Phase 1-3 tasks complete
- [ ] RSA keys generated and stored in Vercel
- [ ] JWKS endpoint live and accessible
- [ ] Other LTI endpoints deployed
- [ ] Test student and faculty accounts ready

After receiving MathWorks credentials:
- [ ] Tool registered in MyJKKN admin UI
- [ ] Application Hub linked to LTI tool
- [ ] Tested as student (launch + SSO)
- [ ] Tested as faculty (instructor role)
- [ ] Roster sync working
- [ ] Grade passback working
- [ ] Documentation updated

---

**Next Steps:**
1. Complete this registration guide
2. Wait for MathWorks credentials
3. Test integration end-to-end
4. Begin pilot rollout
5. Proceed to Phase 5 (Grade Passback UI) and Phase 6 (Roster Sync UI)
