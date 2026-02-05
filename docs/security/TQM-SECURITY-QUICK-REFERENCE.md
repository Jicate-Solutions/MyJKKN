# TQM Security Quick Reference Card

**Last Updated:** 2026-02-05
**For:** Developers working on TQM modules

---

## 🚨 CRITICAL VULNERABILITIES - URGENT FIXES NEEDED

### 1. MA-01: Self-Approval Bug in Maturity Assessment
**File:** `app/api/maturity-assessment/assessments/[id]/approve/route.ts`
**Issue:** Users can approve their own assessments
**Fix:** Add role check + verify assessor_id ≠ approver_id

### 2. COPQ-01: No Cost Validation
**File:** `lib/services/billing/copq/billing-copq-service.ts`
**Issue:** Negative costs and overflow possible
**Fix:** Add min(0), max(10M), 2-decimal validation

### 3. PP-02: Parent Link Hijacking
**File:** `lib/services/parent-portal/parent-portal-service.ts`
**Issue:** Parent can link any learner
**Fix:** Verify authenticated parent owns parent_id

---

## ✅ Security Checklist for New Features

```typescript
// 1. AUTHENTICATION - Always check session
const { session, error } = await getAuthSession();
if (error || !session) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

// 2. AUTHORIZATION - Verify role/permissions
const { data: user } = await supabase
  .from('profiles')
  .select('role, institution_id')
  .eq('id', session.user.id)
  .single();

if (!['super_admin', 'admin'].includes(user.role)) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// 3. INPUT VALIDATION - Use Zod schemas
const validated = mySchema.parse(body);

// 4. MULTI-TENANCY - Always filter by institution_id
query = query.eq('institution_id', user.institution_id);

// 5. SQL INJECTION - Sanitize search inputs
const sanitizedSearch = filters.search.replace(/[%_\\]/g, '\\$&');
query = query.ilike('field', `%${sanitizedSearch}%`);

// 6. ERROR HANDLING - Generic errors to client
try {
  // ...
} catch (error) {
  console.error('[module] Detailed error:', error); // Log internally
  throw new Error('Generic error message');          // Return to client
}
```

---

## 🔒 Common Security Patterns

### Financial Data Validation
```typescript
// Always validate money fields
const costSchema = z.number()
  .min(0, 'Cost cannot be negative')
  .max(10000000, 'Cost exceeds maximum ($10M)')
  .multipleOf(0.01, 'Cost must have at most 2 decimal places')
  .finite('Cost must be a finite number');
```

### Timestamp Validation
```typescript
// Prevent future-dating and excessive backdating
const timestampSchema = z.string().refine(
  (val) => {
    const date = new Date(val);
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return date <= now && date >= thirtyDaysAgo;
  },
  { message: 'Timestamp must be within last 30 days and not in future' }
);
```

### Permission Verification
```typescript
// Check ownership before update/delete
const resource = await getResource(id);
if (resource.created_by !== session.user.id && user.role !== 'admin') {
  throw new Error('Permission denied');
}
```

### Cross-Institution Protection
```typescript
// Verify all related entities are from same institution
const [parentInst, learnerInst] = await Promise.all([
  supabase.from('parent_profiles').select('institution_id').eq('id', parentId).single(),
  supabase.from('learners_profiles').select('institution_id').eq('id', learnerId).single()
]);

if (parentInst.data.institution_id !== learnerInst.data.institution_id) {
  throw new Error('Cross-institution operation not allowed');
}
```

---

## 🛡️ RLS Policy Template

```sql
-- Always enable RLS first
ALTER TABLE my_table ENABLE ROW LEVEL SECURITY;

-- Pattern 1: Institution-scoped data
CREATE POLICY "users_can_view_own_institution_data"
  ON my_table FOR SELECT
  USING (
    institution_id IN (
      SELECT institution_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Pattern 2: Role-based access
CREATE POLICY "admins_can_manage_data"
  ON my_table FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND institution_id = my_table.institution_id
    )
  );

-- Pattern 3: Ownership-based access
CREATE POLICY "users_can_manage_own_records"
  ON my_table FOR UPDATE
  USING (created_by = auth.uid());
```

---

## 🚫 Common Mistakes to Avoid

### ❌ DON'T
```typescript
// 1. Trust client-provided scores/calculations
await update({ score: body.score }); // Client can manipulate

// 2. Return detailed errors to client
throw new Error(`Query failed: ${error.message}`); // Exposes DB structure

// 3. Skip institution_id filtering
query.eq('id', id); // Missing institution_id check!

// 4. Allow self-approval
await approve(assessmentId, session.user.id); // No check if user is assessor

// 5. Concatenate user input in queries
query.ilike('name', `%${search}%`); // SQL injection risk if not sanitized

// 6. Accept any timestamp
insert({ timestamp: body.timestamp }); // User can backdate or future-date
```

### ✅ DO
```typescript
// 1. Recalculate server-side
const score = calculateScore(responses);
await update({ score });

// 2. Log internally, return generic error
console.error('[module] Error:', error);
throw new Error('Operation failed');

// 3. Always filter by institution
query.eq('id', id).eq('institution_id', user.institution_id);

// 4. Verify user is not self-approving
if (assessment.assessor_id === session.user.id) {
  throw new Error('Cannot approve own assessment');
}

// 5. Sanitize search input
const sanitized = search.replace(/[%_\\]/g, '\\$&');
query.ilike('name', `%${sanitized}%`);

// 6. Validate timestamp range
if (timestamp > now || timestamp < thirtyDaysAgo) {
  throw new Error('Invalid timestamp');
}
```

---

## 🔍 Testing Checklist

Before marking a feature "done":

- [ ] **Authentication Test:** Try API without auth → Should get 401
- [ ] **Authorization Test:** Try as wrong role → Should get 403
- [ ] **Cross-Institution Test:** Try accessing other institution's data → Should fail
- [ ] **SQL Injection Test:** Send `%' OR 1=1--` in search → Should return 0 results
- [ ] **XSS Test:** Submit `<script>alert('xss')</script>` → Should be escaped
- [ ] **CSRF Test:** Submit form from external site → Should fail (when CSRF enforced)
- [ ] **Input Validation Test:** Send invalid data → Should return 400 with clear error
- [ ] **Rate Limiting Test:** Send 100 requests in 1 second → Should get 429 after limit

---

## 📋 Code Review Focus Areas

When reviewing TQM code, check:

1. ✅ Every API route starts with `getAuthSession()`
2. ✅ User role is checked before privileged operations
3. ✅ All queries include `institution_id` filter (except super_admin)
4. ✅ Search inputs are sanitized with `replace(/[%_\\]/g, '\\$&')`
5. ✅ Financial fields validated: min(0), max(10M), 2 decimals
6. ✅ Timestamps validated: not future, not too old
7. ✅ No PII returned in error messages
8. ✅ RLS policies exist for all new tables
9. ✅ Zod schemas validate all user inputs
10. ✅ Tests cover security scenarios (cross-institution, role escalation)

---

## 🆘 Emergency Contacts

**Security Issue Reporting:**
- Email: security@jkkn.ac.in
- Slack: #security-incidents
- On-call: +91-XXX-XXX-XXXX

**Immediate Actions for Security Incident:**
1. Alert #security-incidents Slack channel
2. Disable affected API endpoints if actively exploited
3. Review audit logs: `SELECT * FROM audit_logs WHERE created_at > NOW() - INTERVAL '1 hour'`
4. Notify senior engineer and product owner

---

## 🔗 Additional Resources

- **Full Audit Report:** `docs/security/TQM-COMPREHENSIVE-SECURITY-AUDIT-2026-02-05.md`
- **Fix Checklist:** `docs/security/TQM-SECURITY-FIXES-CHECKLIST.md`
- **RLS Documentation:** `docs/security/RLS_VERIFICATION_CHECKLIST.md`
- **Parent Portal Auth:** `docs/security/parent-portal-authentication.md`
- **OWASP Top 10:** https://owasp.org/www-project-top-ten/

---

**Remember:** Security is everyone's responsibility. When in doubt, ask!
