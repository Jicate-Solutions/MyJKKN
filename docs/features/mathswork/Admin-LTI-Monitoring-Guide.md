# LTI Monitoring & Administration Guide

**Version:** 1.0
**Last Updated:** 2026-01-12
**Audience:** System Administrators, Super Admins

---

## Table of Contents

1. [Overview](#overview)
2. [Accessing Monitoring Dashboards](#accessing-monitoring-dashboards)
3. [Analytics Dashboard](#analytics-dashboard)
4. [Grade Sync Monitoring](#grade-sync-monitoring)
5. [Launch Debug View](#launch-debug-view)
6. [Audit Trail](#audit-trail)
7. [Common Issues & Solutions](#common-issues--solutions)
8. [Performance Monitoring](#performance-monitoring)
9. [Security Best Practices](#security-best-practices)

---

## Overview

MyJKKN provides comprehensive monitoring tools for LTI (Learning Tools Interoperability) integrations with external educational tools like MATLAB Grader. These tools help administrators:

- Track tool usage and adoption
- Monitor grade synchronization
- Debug launch issues
- Review security events
- Generate usage reports

**Access Requirements:**
- Role: `administrator` or `super_admin`
- Permission: `lti.monitor`

---

## Accessing Monitoring Dashboards

### Navigation

1. Login to MyJKKN with admin credentials
2. Navigate to **Admin** → **LTI Monitoring**
3. Choose from available dashboards:
   - **Analytics** - Usage statistics and charts
   - **Grade Sync** - Grade passback monitoring
   - **Launch Debug** - Detailed launch records

### URL Structure

```
/admin/lti/analytics          # Main analytics dashboard
/admin/lti/grade-sync         # Grade synchronization monitoring
/admin/lti/launches           # Launch debug view
```

---

## Analytics Dashboard

**URL:** `/admin/lti/analytics`

### Key Metrics

The analytics dashboard provides four primary metrics:

1. **Total Launches**
   - Total number of LTI tool launches in date range
   - Indicates overall tool adoption

2. **Unique Users**
   - Number of distinct users who launched tools
   - Shows average launches per user

3. **Student Launches**
   - Launches by users with "Learner" role
   - Percentage of total launches

4. **Faculty Launches**
   - Launches by users with "Instructor" role
   - Percentage of total launches

### Charts & Visualizations

#### 1. Launches Over Time
- **Type:** Line chart
- **Purpose:** Track daily launch trends
- **Insights:**
  - Peak usage days
  - Adoption trends
  - Anomalies or drop-offs

#### 2. Tool Usage
- **Type:** Horizontal bar chart
- **Purpose:** Compare launches across different tools
- **Insights:**
  - Most popular tools
  - Under-utilized tools
  - Resource allocation needs

#### 3. User Role Distribution
- **Type:** Donut chart
- **Purpose:** Student vs Faculty usage breakdown
- **Insights:**
  - Primary user demographic
  - Usage patterns by role

#### 4. Top Institutions
- **Type:** Ranked bar chart
- **Purpose:** Launches by institution (multi-tenant view)
- **Insights:**
  - Institutional adoption rates
  - License utilization by institution

### Filters

Apply filters to narrow down analytics:

- **Date Range:** Start and end dates (default: last 30 days)
- **Institution:** Filter by specific institution (multi-tenant deployments)
- **Tool:** Filter by specific LTI tool (e.g., MATLAB Grader only)

**Example Use Cases:**

```
Use Case: Check MATLAB adoption in October 2025
Filters:
  - Start Date: 2025-10-01
  - End Date: 2025-10-31
  - Tool: MATLAB Grader

Use Case: Compare usage across institutions
Filters:
  - Date Range: Last 90 days
  - Institution: All
```

### Exporting Data

Click **Export to Excel** to download:
- Raw launch data
- Aggregated statistics
- Charts as images

---

## Grade Sync Monitoring

**URL:** `/admin/lti/grade-sync`

### Overview

Monitor grade passback from LTI tools to MyJKKN. Track successful syncs, pending grades, and failures.

### Statistics Cards

1. **Total Grades**
   - Grades received in date range
   - All statuses included

2. **Synced**
   - Successfully synced to gradebook
   - Shows sync rate percentage

3. **Pending**
   - Awaiting synchronization
   - Not yet processed

4. **Failed**
   - Sync errors occurred
   - Shows failure rate percentage

### Grade Sync Table

Displays all grade records with:

- **Student Name & Roll Number**
- **Assignment Name** (from LTI tool)
- **Score** (fraction and percentage)
- **Tool Name** (e.g., MATLAB Grader)
- **Graded At** (when LTI tool graded)
- **Status Badge:**
  - 🟢 **Synced** - Successfully in gradebook
  - 🟡 **Pending** - Awaiting sync
  - 🔴 **Failed** - Error occurred

### Troubleshooting Failed Syncs

#### View Error Details

1. Locate failed grade in table (red "Failed" badge)
2. Check error message displayed under status
3. Common errors:
   - `"Invalid score range"` - Score exceeds maximum
   - `"Student not found"` - Student removed or inactive
   - `"Gradebook entry missing"` - No matching assignment
   - `"Permission denied"` - RLS policy issue

#### Manual Retry

For failed grades with transient errors:

1. Click **Retry** button next to failed grade
2. System will attempt to sync again
3. Page refreshes with updated status

**Best Practice:** Review error message before retrying to avoid repeated failures.

### Filters

- **Date Range:** Default last 7 days (adjustable)
- **Tool:** Filter by specific LTI tool
- **Sync Status:**
  - All
  - Synced only
  - Pending only
  - Failed only

**Example Queries:**

```
Query: Find all failed syncs for MATLAB in last week
Filters:
  - Date Range: Last 7 days
  - Tool: MATLAB Grader
  - Sync Status: Failed

Query: Check pending syncs across all tools
Filters:
  - Date Range: Last 24 hours
  - Tool: All Tools
  - Sync Status: Pending
```

---

## Launch Debug View

**URL:** `/admin/lti/launches`

### Overview

Detailed debugging interface for all LTI tool launches. Use this for troubleshooting launch failures, investigating security events, and auditing user activity.

### Statistics Cards

1. **Total Launches** - Launches in date range
2. **Avg Session Duration** - Average time spent in tool
3. **Student Launches** - Count and percentage
4. **Faculty Launches** - Count and percentage

### Launch Table

Each row shows:

- **Launched At** - Date and time
- **User** - Name and roll number (if student)
- **Role** - Student or Faculty badge
- **Tool** - Tool name and type
- **Institution** - Institution short name
- **Context** - Class/course context (e.g., "CSE-S3-A")
- **Type** - Launch type (assignment, resource, deep_link)
- **Session** - Duration in minutes/seconds

### View Detailed Launch Information

Click **Details** button to open modal with:

#### Basic Information
- Launch ID (UUID)
- Launched timestamp
- Tool name
- Institution name

#### User Information
- User ID (UUID)
- Student name and roll number
- MyJKKN role (student, faculty, etc.)
- LTI role sent to tool
- IP address

#### Context Information
- Context ID (unique identifier)
- Context label (e.g., "CSE-S3-A")
- Context title (full name)
- Resource link ID (assignment ID from tool)
- Resource title (assignment name)

#### JWT Information
- Nonce (one-time random string)
- Expiration timestamp
- Message type (LtiResourceLinkRequest)

#### Session Information
- Launch type (assignment, resource, etc.)
- Session duration

### Filters

- **Date Range:** Default last 7 days
- **Tool:** Filter by LTI tool
- **Institution:** Filter by institution
- **Launch Type:** assignment, resource, deep_link, content_selection
- **User ID:** Advanced debugging (paste user UUID)

**Advanced Debugging:**

```
Scenario: User reports "MATLAB didn't launch"
Steps:
1. Get user ID from learners_profiles table
2. Paste user ID in "User ID" filter
3. Check recent launches
4. Click "Details" on most recent launch
5. Review JWT expiration, IP address, errors
6. Check audit logs for security events
```

### Common Launch Issues

| Issue | Possible Cause | Solution |
|-------|---------------|----------|
| No launches for user | User not active | Check lifecycle_status |
| JWT expired | Clock skew > 5 min | Sync server time |
| Invalid nonce | Duplicate launch | Check for replay attack |
| Context mismatch | Student promoted | Update context mapping |

---

## Audit Trail

**Module:** `lti`, `lti_tools`, `lti_launches`, `lti_grades`, `lti_roster`

### Logged Events

#### Tool Management
- **create:** LTI tool registered
- **update:** Tool configuration updated
- **delete:** Tool removed

#### Launches
- **create:** Launch success or failure
- **Security events:** Invalid JWT, unauthorized access

#### Grade Passback
- **create:** Grade received from tool
- **update:** Grade synced to gradebook
- **Error:** Grade passback failed

#### Roster Sync
- **view:** Roster requested by tool
- **export:** Roster successfully synced
- **Error:** Roster sync failed

### Viewing Audit Logs

Navigate to **Admin** → **Audit Trail** → Filter by:
- **Module:** Select `lti`, `lti_tools`, etc.
- **Action:** create, update, delete, view, export
- **Severity:** info, warning, error, critical
- **Date Range:** Custom range

### Security Monitoring

Critical security events to monitor:

1. **Invalid JWT Attempts**
   - Severity: WARNING
   - Description: "Blocked invalid JWT"
   - Action: Review IP address, check for patterns

2. **JWT Replay Attacks**
   - Severity: CRITICAL
   - Description: "Blocked JWT replay attack"
   - Action: Investigate user account, check for compromise

3. **Unauthorized Launch Attempts**
   - Severity: WARNING
   - Description: "Blocked unauthorized launch"
   - Action: Verify user permissions, check role mapping

4. **Suspicious Activity**
   - Severity: CRITICAL
   - Description: Custom based on detection
   - Action: Immediate investigation required

**Alert Thresholds:**

```
Warning: 5+ invalid JWT attempts from same IP in 1 hour
Critical: Any JWT replay attempt
Critical: 10+ unauthorized launch attempts in 1 day
```

---

## Common Issues & Solutions

### Issue 1: Low Adoption Rate

**Symptoms:**
- Total launches < 100 in last 30 days
- Unique users < 10% of total students

**Solutions:**
1. Faculty training workshops
2. Promote tool via announcements
3. Create assignments requiring tool usage
4. Check license availability

### Issue 2: High Grade Sync Failure Rate

**Symptoms:**
- Failure rate > 5%
- Many "Student not found" errors

**Solutions:**
1. Verify student accounts active
2. Check learner_profile data completeness
3. Review RLS policies on lti_grades table
4. Check gradebook module (if implemented)

### Issue 3: Slow Launch Times

**Symptoms:**
- Average launch time > 5 seconds
- User complaints about delays

**Solutions:**
1. Check JWT generation performance
2. Review Supabase query response times
3. Check network latency to LTI tool
4. Enable caching for context queries

### Issue 4: JWT Expiration Errors

**Symptoms:**
- "JWT expired" errors
- Launches work after refresh

**Solutions:**
1. Sync server clock (NTP)
2. Check JWT expiration setting (default: 5 min)
3. Verify timezone configuration
4. Review clock skew tolerance

### Issue 5: Missing Student Roster in Tool

**Symptoms:**
- Faculty report empty class in MATLAB
- Students not enrolled automatically

**Solutions:**
1. Check LTI Names & Roles API logs
2. Verify context_id mapping correct
3. Check institution_id filtering
4. Ensure students have active lifecycle_status

---

## Performance Monitoring

### Recommended Metrics

| Metric | Target | Action if Below |
|--------|--------|----------------|
| Launch Success Rate | > 95% | Investigate failures |
| Launch Time (p95) | < 2 seconds | Optimize queries |
| Grade Sync Rate | > 95% | Debug failures |
| Session Duration | > 5 minutes | Check engagement |
| API Uptime | > 99.9% | Review hosting |

### Monitoring Tools

1. **Vercel Analytics**
   - Track API response times
   - Monitor error rates
   - Alert on downtime

2. **Supabase Dashboard**
   - Database query performance
   - Connection pool usage
   - RLS policy overhead

3. **Custom Alerts**
   - Email admins when failure rate > 5%
   - Slack notification for security events
   - Weekly usage reports

### Performance Optimization Tips

1. **Database Indexes**
   - Ensure indexes on lti_launches (launched_at, user_id, tool_id)
   - Index lti_grades (received_at, synced_to_gradebook)

2. **Query Optimization**
   - Use date range filters to limit rows
   - Avoid `SELECT *` in production
   - Use pagination for large result sets

3. **Caching**
   - Cache roster queries (5 min TTL)
   - Cache tool configurations
   - Use CDN for public assets

---

## Security Best Practices

### 1. Key Management

- ✅ **DO:**
  - Rotate RSA keys quarterly
  - Store private key in Vercel encrypted env vars
  - Use key ID (kid) for gradual rollover
  - Generate 2048-bit minimum keys

- ❌ **DON'T:**
  - Commit keys to git
  - Share keys across environments
  - Log private keys in error messages
  - Use same key for multiple platforms

### 2. JWT Validation

- ✅ **DO:**
  - Verify signature with tool's public key
  - Check expiration (< 5 minutes old)
  - Validate nonce uniqueness
  - Store used nonces temporarily

- ❌ **DON'T:**
  - Skip signature verification
  - Accept expired tokens
  - Allow long expiration times
  - Reuse nonces

### 3. Rate Limiting

Configure rate limits:

```
LTI Launch: 10 launches per user per minute
Grade Passback: 100 grades per tool per minute
Roster Sync: 5 syncs per context per hour
```

### 4. Access Control

- ✅ **DO:**
  - Use RLS policies on all LTI tables
  - Check institution_id in all queries
  - Verify user permissions before launch
  - Log all security events

- ❌ **DON'T:**
  - Disable RLS on production tables
  - Trust client-side filtering
  - Skip permission checks
  - Ignore security warnings

### 5. Monitoring & Alerting

Set up alerts for:

1. **Critical:** JWT replay attempts
2. **Critical:** Suspicious activity patterns
3. **Warning:** 5+ invalid JWT in 1 hour
4. **Warning:** 10+ unauthorized launches per day
5. **Info:** License approaching expiry (30 days)

### 6. Incident Response

**If security event detected:**

1. **Identify:**
   - Review audit logs
   - Check IP addresses
   - Identify affected users

2. **Contain:**
   - Disable compromised tools if needed
   - Reset affected user sessions
   - Block suspicious IP addresses

3. **Investigate:**
   - Review full audit trail
   - Check for data exfiltration
   - Identify attack vector

4. **Remediate:**
   - Patch vulnerabilities
   - Update security policies
   - Rotate keys if compromised

5. **Document:**
   - Create incident report
   - Update security procedures
   - Train staff on lessons learned

---

## Support & Resources

### Internal Resources

- **Documentation:** `docs/features/mathswork/`
- **API Reference:** `docs/api/lti-api-reference.md`
- **Developer Guide:** `docs/developers/lti-integration-architecture.md`
- **Troubleshooting:** `docs/troubleshooting/lti-common-issues.md`

### External Resources

- **LTI 1.3 Specification:** https://www.imsglobal.org/spec/lti/v1p3
- **MathWorks LTI Support:** lti-support@mathworks.com
- **Supabase Docs:** https://supabase.com/docs

### Getting Help

1. **Check Audit Logs:** Most issues leave audit trail
2. **Review Documentation:** Search existing guides
3. **Contact Support:** Email support@jkkn.ai with:
   - Issue description
   - Screenshots of error
   - User ID or launch ID
   - Date/time of issue

---

**Document Version:** 1.0
**Last Review:** 2026-01-12
**Next Review:** 2026-04-12 (Quarterly)
