# Learner Profile Change Approval Workflow

**Created:** 2025-01-20
**Status:** ✅ Complete
**Version:** 1.0.0

## Overview

A comprehensive approval workflow system that allows students to request profile edits with HOD/Staff review and approval. Students can only edit personal information fields (contact, parent, address), while academic and credential fields remain read-only. All changes require approval before being applied to the profile.

## Features

### For Students
- ✅ Edit personal profile information (contact, parent/guardian, address, other details)
- ✅ Preview changes before submission with side-by-side comparison
- ✅ Track pending change request status with visual indicators
- ✅ View approval/rejection feedback from reviewers
- ✅ Cancel pending requests
- ✅ Mobile-responsive interface

### For Approvers (HOD/Staff/Super Admin)
- ✅ View all pending change requests (role-based filtering)
- ✅ Review changes with side-by-side comparison
- ✅ Approve or reject requests with optional comments
- ✅ Provide constructive feedback for rejected requests
- ✅ Access comprehensive audit trail
- ✅ Role-based permission scoping (HOD: institution-wide, Staff: department-only)

---

## Architecture

### Database Schema

**Tables:**
1. **`profile_change_requests`** - Active change requests
   - Stores pending, approved, rejected, cancelled requests
   - JSONB field for flexible change tracking
   - Unique constraint: one pending request per learner

2. **`profile_change_audit_log`** - Permanent audit trail
   - Immutable history of all profile changes
   - Links to original change requests
   - Records performer, timestamp, comments

**RLS Policies:**
- Students: View/create own requests, cancel pending requests
- HOD: View/update institution-wide requests
- Staff: View/update department-only requests
- Super Admin: Full access

### Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Database:** Supabase PostgreSQL
- **Type Safety:** TypeScript + Zod validation
- **State Management:** React Hook Form + React Query
- **UI Components:** shadcn/ui + Tailwind CSS
- **Icons:** lucide-react

---

## User Workflows

### Student Workflow

1. **Navigate to My Profile**
   - Path: `/learners/my-profile`
   - View current profile information

2. **Edit Profile**
   - Click "Edit Profile" button
   - Form displays with 4 tabs:
     - Contact Details (mobile, email)
     - Parent/Guardian Information
     - Address Information
     - Other Details (blood group, religion, etc.)
   - Edit allowed fields (read-only fields are excluded)

3. **Preview Changes**
   - Click "Preview Changes (N)" button
   - Review side-by-side comparison:
     - Left: Current values (green)
     - Right: New values (blue)
   - Option to go back and edit or confirm submission

4. **Submit Request**
   - Click "Submit Request"
   - Request status changes to "Pending"
   - Pending banner appears with status
   - Profile comparison view shows requested changes
   - Edit button disabled until request is resolved

5. **Track Status**
   - **Pending:** Yellow banner with "Changes Pending Approval"
   - **Approved:** Green banner with "Changes Approved", profile updated
   - **Rejected:** Red banner with rejection feedback, can resubmit
   - **Cancelled:** Gray banner, can submit new request

6. **Cancel Request (Optional)**
   - Click "Cancel Request" in pending banner
   - Request cancelled, returns to normal view

### Approver Workflow (HOD/Staff)

1. **Access Change Requests**
   - Path: `/learners/change-requests`
   - Sidebar: Learners Management → Change Requests
   - Role-based filtering applied automatically

2. **View Requests List**
   - Table with columns:
     - Roll Number
     - Student Name
     - Fields Changed (badges)
     - Submitted (relative time)
     - Actions (Review button)
   - Status filter tabs: Pending, Approved, Rejected
   - Search by student name/roll number

3. **Review Individual Request**
   - Click "Review" button
   - View student information:
     - Name, roll number, email
     - Institution, department, program
     - Request status and timestamp
   - Side-by-side comparison:
     - Current values vs Requested values
     - Field labels formatted for readability

4. **Approve Request**
   - Click "Approve" button (green)
   - Optional: Add comments
   - Confirm approval
   - System updates:
     - Learner profile updated with new values
     - Request status → "approved"
     - Audit log entry created
     - Student sees updated profile

5. **Reject Request**
   - Click "Reject" button (red)
   - **Required:** Enter rejection reason
   - Provide constructive feedback
   - Confirm rejection
   - System updates:
     - Learner profile unchanged
     - Request status → "rejected"
     - Audit log entry created
     - Student sees rejection feedback

---

## Technical Implementation

### File Structure

```
app/(routes)/learners/
├── my-profile/
│   ├── page.tsx                              # Server: Auth + data fetch
│   └── _components/
│       ├── profile-page-content.tsx          # Client: Orchestration
│       ├── profile-view.tsx                  # Read-only view
│       ├── profile-edit-form.tsx             # Edit form with validation
│       ├── change-request-dialog.tsx         # Preview dialog
│       ├── pending-changes-banner.tsx        # Status banner
│       ├── profile-comparison-view.tsx       # Side-by-side comparison
│       └── info-field.tsx                    # Field display helper
│
└── change-requests/
    ├── page.tsx                              # Server: Auth + role filtering
    ├── [id]/
    │   ├── page.tsx                          # Server: Fetch request details
    │   └── _components/
    │       ├── request-detail-client.tsx     # Client: Review interface
    │       └── request-detail-card.tsx       # Comparison display
    └── _components/
        ├── change-requests-client.tsx        # Client: Table with tabs
        └── columns.tsx                       # Table column definitions

lib/services/
├── learner-profile-change-service.ts         # CRUD + approve/reject logic
└── learner-profile-audit-service.ts          # Audit log operations

hooks/learner-profile/
├── use-change-request.ts                     # React Query hooks (queries)
└── use-change-request-mutations.ts           # React Query hooks (mutations)

types/
└── learner-profile-change.ts                 # TypeScript types + constants

lib/validations/
└── profile-change-request.ts                 # Zod schemas + helpers

app/api/learner-profile/change-requests/
├── route.ts                                  # GET (list), POST (create)
├── pending/[learnerId]/route.ts              # GET pending for learner
├── [id]/
│   ├── route.ts                              # GET single request
│   ├── approve/route.ts                      # POST approve
│   ├── reject/route.ts                       # POST reject
│   └── cancel/route.ts                       # POST cancel

supabase/migrations/
├── 20250120000001_create_profile_change_requests.sql
└── 20250120000002_add_rls_policies_profile_changes.sql
```

### Key Design Patterns

**1. Server/Client Separation**
- Server components: Auth, data fetching, permission checks
- Client components: Interactivity, state management, forms

**2. Optimistic Updates**
- Approve/reject mutations remove from list immediately
- Rollback on error
- Cache invalidation on success

**3. Type Safety**
- Zod schemas for runtime validation
- TypeScript types for compile-time safety
- DTO pattern for API boundaries

**4. Field Security**
```typescript
EDITABLE_FIELDS = [
  'student_mobile', 'student_email', 'alternate_mobile',
  'father_name', 'father_mobile', 'father_occupation',
  'mother_name', 'mother_mobile', 'mother_occupation',
  // ... (27 editable fields total)
]

READ_ONLY_FIELDS = [
  'institution_id', 'degree_id', 'roll_number',
  'first_name', 'last_name', 'date_of_birth',
  // ... (18 read-only fields total)
]
```

**5. Role-Based Filtering**
```typescript
// Service layer permission check
if (role === 'hod') {
  query = query.eq('learner.institution_id', user.institution_id);
} else if (role === 'staff') {
  query = query.eq('learner.department_id', user.department_id);
}
// super_admin: no filter (sees all)
```

---

## API Endpoints

### Student Endpoints

```typescript
POST   /api/learner-profile/change-requests
Body:  { learner_id, changed_fields, fields_summary }
Auth:  Student role, owns learner_id
Returns: Created ProfileChangeRequest

GET    /api/learner-profile/change-requests/pending/{learnerId}
Auth:  Student role, owns learner_id
Returns: ProfileChangeRequest | 404

POST   /api/learner-profile/change-requests/{id}/cancel
Auth:  Student role, owns request
Returns: Updated ProfileChangeRequest
```

### Approver Endpoints

```typescript
GET    /api/learner-profile/change-requests?status=pending&page=1&limit=20
Auth:  HOD/Staff/Super Admin
Returns: { data: ProfileChangeRequest[], total: number }

GET    /api/learner-profile/change-requests/{id}
Auth:  HOD/Staff/Super Admin, has permission for learner
Returns: ProfileChangeRequest with full learner data

POST   /api/learner-profile/change-requests/{id}/approve
Body:  { review_comments?: string }
Auth:  HOD/Staff/Super Admin, has permission
Returns: Updated ProfileChangeRequest (status='approved')

POST   /api/learner-profile/change-requests/{id}/reject
Body:  { review_comments: string } (required)
Auth:  HOD/Staff/Super Admin, has permission
Returns: Updated ProfileChangeRequest (status='rejected')
```

---

## Validation Rules

### Form Validation (Zod)

```typescript
student_mobile: /^[6-9]\d{9}$/           // Indian mobile (10 digits, starts 6-9)
student_email: email format
alternate_mobile: /^[6-9]\d{9}$/
permanent_pincode: /^\d{6}$/             // 6 digits
present_pincode: /^\d{6}$/
blood_group: enum ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
father_name: min 2 characters
mother_name: min 2 characters
permanent_address: min 5 characters
present_address: min 5 characters

// Global validations:
- At least one field must be changed
- Only editable fields allowed (security check)
```

### Business Rules

1. **One Pending Request Per Student**
   - Database constraint enforced
   - UI prevents submission if pending exists

2. **Only Active Students Can Submit**
   - Lifecycle status must be 'active'
   - Validated in service layer

3. **Student Can Only Edit Own Profile**
   - Auth check in API routes
   - learner_id verification

4. **Approval Permission Hierarchy**
   - Super Admin: All requests
   - HOD: Institution-wide (institution_id match)
   - Staff: Department-only (department_id match)

5. **Rejection Requires Feedback**
   - review_comments field required for reject action
   - Encourages constructive feedback

---

## Testing Checklist

### Database & Migrations

- [ ] Apply migrations to development database
  ```bash
  supabase migration up
  ```
- [ ] Verify tables created: `profile_change_requests`, `profile_change_audit_log`
- [ ] Verify RLS policies enabled on both tables
- [ ] Test unique constraint: One pending request per learner
- [ ] Test foreign key relationships
- [ ] Verify indexes created for performance

### API Endpoints

**Student Endpoints:**
- [ ] POST `/api/learner-profile/change-requests` - Create request
- [ ] GET `/api/learner-profile/change-requests/pending/{learnerId}` - Fetch pending
- [ ] POST `/api/learner-profile/change-requests/{id}/cancel` - Cancel request
- [ ] Test 401 unauthorized (not logged in)
- [ ] Test 403 forbidden (trying to edit another student's profile)
- [ ] Test validation errors (invalid field values)

**Approver Endpoints:**
- [ ] GET `/api/learner-profile/change-requests` - List with filters
- [ ] GET `/api/learner-profile/change-requests/{id}` - Single request
- [ ] POST `/api/learner-profile/change-requests/{id}/approve` - Approve
- [ ] POST `/api/learner-profile/change-requests/{id}/reject` - Reject
- [ ] Test role-based filtering (HOD vs Staff)
- [ ] Test permission checks (403 for wrong department/institution)
- [ ] Test rejection without comments (400 error)

### UI Components

**Student UI:**
- [ ] Navigate to `/learners/my-profile`
- [ ] View profile in read-only mode
- [ ] Click "Edit Profile" - form opens
- [ ] Edit multiple fields across tabs
- [ ] Click "Preview Changes" - dialog opens with comparison
- [ ] Submit request - success toast
- [ ] Pending banner appears with status
- [ ] Profile comparison view shows requested changes
- [ ] Edit button disabled during pending
- [ ] Cancel pending request - returns to normal view
- [ ] View approved request - green banner, profile updated
- [ ] View rejected request - red banner with feedback

**Approver UI:**
- [ ] Navigate to `/learners/change-requests`
- [ ] Sidebar shows "Change Requests" link (HOD/Staff/Super Admin only)
- [ ] View list of pending requests
- [ ] Search by student name/roll number works
- [ ] Status tabs filter correctly (Pending/Approved/Rejected)
- [ ] Click "Review" - detail page opens
- [ ] View student information header
- [ ] View side-by-side comparison
- [ ] Click "Approve" - dialog opens
- [ ] Add optional comments and confirm - success toast
- [ ] Request removed from pending list
- [ ] Click "Reject" - dialog opens
- [ ] Required feedback field validated
- [ ] Confirm rejection - success toast
- [ ] Student sees rejection feedback

### Role-Based Access

**Student:**
- [ ] Can access `/learners/my-profile`
- [ ] Can edit own profile
- [ ] Cannot access `/learners/change-requests`
- [ ] Cannot access other students' profiles

**Staff:**
- [ ] Can access `/learners/change-requests`
- [ ] Sees only department requests
- [ ] Can approve/reject department requests
- [ ] Cannot approve requests from other departments (403)

**HOD:**
- [ ] Can access `/learners/change-requests`
- [ ] Sees institution-wide requests
- [ ] Can approve/reject all institution requests
- [ ] Cannot approve requests from other institutions (403)

**Super Admin:**
- [ ] Sees all requests (no filtering)
- [ ] Can approve/reject any request

### Form Validation

**Field-Level Validation:**
- [ ] Mobile number: 10 digits, starts with 6-9
- [ ] Email: valid format
- [ ] Pincode: 6 digits
- [ ] Blood group: valid enum
- [ ] Names: minimum 2 characters
- [ ] Addresses: minimum 5 characters

**Form-Level Validation:**
- [ ] At least one field must be changed
- [ ] Only editable fields accepted
- [ ] Cannot submit with validation errors
- [ ] Error messages display below fields

### Edge Cases

- [ ] Submit request while another pending (should error)
- [ ] Edit inactive student profile (should error)
- [ ] Approve already approved request (should error)
- [ ] Reject without providing reason (should error: 400)
- [ ] Cancel someone else's request (should error: 403)
- [ ] Access request from different institution/department (should error: 403)
- [ ] Very long field values (test JSONB limits)
- [ ] Special characters in text fields
- [ ] Empty optional fields (should handle gracefully)

### Mobile Responsiveness

- [ ] Profile view responsive (stacked on mobile)
- [ ] Edit form tabs responsive (2-column → 1-column)
- [ ] Comparison view responsive (side-by-side → stacked)
- [ ] Table responsive (horizontal scroll if needed)
- [ ] Dialogs fit mobile screens
- [ ] Buttons full-width on mobile

### Performance

- [ ] Page load time < 2 seconds
- [ ] Form submission < 1 second
- [ ] Approval/rejection < 1 second
- [ ] Table loads with 50+ requests smoothly
- [ ] Optimistic updates feel instant
- [ ] No flickering during state changes

---

## Security Considerations

### Data Protection

✅ **RLS Policies**: All database access protected by Row Level Security
✅ **Auth Checks**: Every API route verifies authentication
✅ **Permission Checks**: Role-based access enforced at multiple layers
✅ **Field Whitelisting**: Only editable fields accepted (prevents privilege escalation)
✅ **Ownership Verification**: Students can only edit own profiles
✅ **Audit Trail**: All actions logged with performer + timestamp

### Validation Layers

1. **Client-side**: Zod schema + React Hook Form (UX)
2. **API layer**: Request body validation (security)
3. **Service layer**: Business rule validation (data integrity)
4. **Database**: Constraints + RLS (enforcement)

### Potential Vulnerabilities (Mitigated)

❌ **Mass Assignment**: Prevented by field whitelisting
❌ **Privilege Escalation**: Read-only fields rejected at API layer
❌ **IDOR**: Ownership + permission checks prevent unauthorized access
❌ **SQL Injection**: Supabase parameterized queries + RLS
❌ **XSS**: React auto-escapes, user input sanitized

---

## Known Limitations

1. **Single Pending Request Per Student**
   - Students cannot submit multiple requests simultaneously
   - Must wait for approval/rejection before new submission
   - *Rationale:* Simplifies approval workflow, prevents conflicts

2. **All-or-Nothing Approval**
   - Approvers cannot selectively approve individual fields
   - Must approve all changes or reject all
   - *Future Enhancement:* Field-level approval

3. **No Notification System**
   - Students not automatically notified of approval/rejection
   - Must manually check My Profile page
   - *Future Enhancement:* Email/push notifications

4. **Read-Only Academic Fields**
   - Students cannot request changes to academic assignments
   - Includes institution, degree, department, semester, section
   - *Rationale:* Academic changes require administrative oversight

5. **No Change History View**
   - Students cannot view past approved/rejected requests
   - Audit log exists but not exposed in UI
   - *Future Enhancement:* Change history tab

---

## Future Enhancements

### Phase 2 Features

1. **Email Notifications**
   - Notify students when request approved/rejected
   - Notify approvers when new request submitted
   - Configurable notification preferences

2. **Field-Level Approval**
   - Allow approvers to approve some fields, reject others
   - More granular control for complex changes

3. **Bulk Approval**
   - Select multiple requests
   - Approve/reject in batch
   - Efficiency for high-volume institutions

4. **Change History**
   - Student-facing history of all requests
   - Timeline view with status transitions
   - Download history as PDF

5. **Request Comments**
   - Students can add notes explaining changes
   - Approvers can ask clarifying questions
   - Threaded conversation on requests

6. **Auto-Approval Rules**
   - Define fields that don't require approval
   - Set approval thresholds (e.g., email changes auto-approve)
   - Institution-configurable rules

7. **Delegation**
   - HODs can delegate approval authority to staff
   - Temporary approval permissions
   - Approval workflow customization

8. **Analytics Dashboard**
   - Approval/rejection rates
   - Average approval time
   - Most frequently changed fields
   - Department/institution comparisons

### Technical Debt

- Add comprehensive unit tests (service layer)
- Add integration tests (API endpoints)
- Add E2E tests (Playwright)
- Performance optimization for large datasets
- Implement caching strategy for frequently accessed data
- Add rate limiting for API endpoints

---

## Deployment Checklist

### Pre-Deployment

- [ ] All TypeScript errors resolved
- [ ] All linting warnings addressed
- [ ] Code reviewed and approved
- [ ] Database migrations tested in staging
- [ ] RLS policies tested with different roles
- [ ] API endpoints manually tested
- [ ] UI tested in multiple browsers
- [ ] Mobile responsiveness verified

### Deployment Steps

1. **Database Migration**
   ```bash
   # Production database
   supabase migration up --password <PROD_PASSWORD>
   ```

2. **Verify RLS Policies**
   ```sql
   -- Check policies are enabled
   SELECT tablename, policyname FROM pg_policies
   WHERE tablename IN ('profile_change_requests', 'profile_change_audit_log');
   ```

3. **Deploy Application**
   ```bash
   git push origin main
   # Vercel/deployment platform auto-deploys
   ```

4. **Smoke Tests (Production)**
   - [ ] Student can view My Profile
   - [ ] Student can submit request
   - [ ] HOD can view pending requests
   - [ ] HOD can approve request
   - [ ] Staff can view department requests only

### Post-Deployment

- [ ] Monitor error logs for 24 hours
- [ ] Check database performance (slow queries)
- [ ] Verify RLS policies working correctly
- [ ] Collect user feedback (students + approvers)
- [ ] Document any issues found
- [ ] Create tickets for bugs/improvements

---

## Troubleshooting

### Common Issues

**Issue:** Student cannot submit change request
**Possible Causes:**
- Pending request already exists (check for existing pending)
- Student is not 'active' lifecycle status
- RLS policy preventing insert
- API endpoint returning 403

**Solution:**
```sql
-- Check for existing pending request
SELECT * FROM profile_change_requests
WHERE learner_id = 'STUDENT_ID' AND request_status = 'pending';

-- Check student lifecycle status
SELECT lifecycle_status FROM learner_profiles WHERE id = 'STUDENT_ID';
```

---

**Issue:** Approver cannot see change requests
**Possible Causes:**
- User role not HOD/Staff/Super Admin
- RLS policy filtering too aggressively
- Missing permission: `learners.change-requests.view`

**Solution:**
```sql
-- Check user role
SELECT role, institution_id, department_id FROM profiles WHERE id = 'USER_ID';

-- Check RLS policies
SET ROLE authenticated;
SELECT * FROM profile_change_requests WHERE request_status = 'pending';
```

---

**Issue:** Profile not updated after approval
**Possible Causes:**
- Service layer error (check logs)
- Database transaction failed
- RLS policy blocking update on learner_profiles

**Solution:**
```typescript
// Check service logs
console.log('[learner-profile-change-service] Approving request:', requestId);

// Check audit log
SELECT * FROM profile_change_audit_log
WHERE change_request_id = 'REQUEST_ID' ORDER BY created_at DESC;
```

---

## Support & Contact

**Documentation:**
- Technical Docs: `docs/features/2025-01-20-learner-profile-change-approval-workflow.md`
- Implementation Plan: `docs/plans/2025-01-20-learner-profile-change-approval-workflow.md`

**Code Locations:**
- Student UI: `app/(routes)/learners/my-profile/`
- Approver UI: `app/(routes)/learners/change-requests/`
- Services: `lib/services/learner-profile-change-service.ts`
- API Routes: `app/api/learner-profile/change-requests/`

**Database:**
- Tables: `profile_change_requests`, `profile_change_audit_log`
- Migrations: `supabase/migrations/202501200000*.sql`

---

## Changelog

### Version 1.0.0 (2025-01-20)

**Added:**
- Student profile edit form with 4 tabs
- Change request submission with preview dialog
- Side-by-side comparison view for students
- Pending request status banner
- Approver management interface with table
- Request detail page with approve/reject actions
- Role-based filtering (HOD: institution, Staff: department)
- Comprehensive audit trail
- Mobile-responsive design
- Real-time validation with Zod
- Optimistic UI updates with React Query
- Complete API endpoints (CRUD + approve/reject)
- Database schema with RLS policies
- Sidebar menu integration

**Security:**
- RLS policies for all database operations
- Field whitelisting (editable vs read-only)
- Multi-layer permission checks
- Audit logging for all actions

**Documentation:**
- User guides (student + approver workflows)
- Technical implementation docs
- API endpoint documentation
- Testing checklist
- Troubleshooting guide

---

## License

Internal use only - MyJKKN College Management System
