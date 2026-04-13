# SPEC: Permissions Audit Dashboard

> **Status:** Draft | **Author:** Claude (SDD Phase 1) | **Date:** 2026-04-13
> **Route:** `/users/permissions-audit` | **Access:** Super Admin only

---

## 1. True Goal

**WHY:** The MyJKKN role system has two sources of truth (`profiles.role` and `user_roles` table) that have drifted apart for 330+ users. Nobody can answer "what can user X actually do?" without running SQL. This dashboard makes the invisible visible.

**Success = ** An admin opens this page, searches a user, and in 3 seconds sees their complete effective permissions, role mismatches, and institution access - without touching the database.

---

## 2. Users & Access

| Who | What They Do | Access Level |
|-----|-------------|--------------|
| Super Admin (8 people) | Audit any user's permissions, spot system health issues | Full access |
| Administrator | View permissions for users in their institution | Read-only, institution-scoped |
| Everyone else | Cannot access this page | Redirected to /unauthorized |

---

## 3. Live Data Context (From Audit 2026-04-13)

| Metric | Value | Severity |
|--------|-------|----------|
| Total users | 5,646 | - |
| Total roles defined | 19 | - |
| Users with NO user_roles entry (orphans) | 271 | HIGH |
| Users with profiles.role vs user_roles mismatch | 330+ | HIGH |
| Super admins | 8 | Monitor |
| Multi-role users | 20 | Low |
| Institution access entries | 52 | - |
| Distinct access_type values (ungoverned) | 5 | MEDIUM |

---

## 4. Feature Specification

### 4.1 System Health Overview (Default Tab)

**Purpose:** At-a-glance health of the entire permission system.

**Cards Row (top):**

| Card | Data Source | Color Logic |
|------|-----------|-------------|
| Total Users | `COUNT(*) FROM profiles` | Neutral |
| Orphan Users | `profiles LEFT JOIN user_roles WHERE ur.id IS NULL` | Red if > 0 |
| Role Mismatches | `profiles.role != user_roles primary role_key` | Red if > 0 |
| Active Roles | `COUNT(*) FROM custom_roles` | Neutral |

**Tables below cards:**

**A. Users Per Role** (two columns: role_key from profiles.role counts + role_key from user_roles counts)

| Column | Source |
|--------|--------|
| Role Name | `custom_roles.role_name` |
| Profile Count | `COUNT profiles WHERE role = role_key` |
| user_roles Count | `COUNT user_roles WHERE role_id = custom_roles.id` |
| Delta | Difference (flags mismatches) |

**B. Permission Health by Role**

| Column | Source |
|--------|--------|
| Role | `custom_roles.role_name` |
| Total Defined | `jsonb_object_keys(permissions) count` |
| Granted | `count WHERE value = 'true'` |
| Granted % | Percentage |
| Flag | Warning icon if < 10% granted (likely misconfigured) |

**C. Super Admin List**

| Column | Source |
|--------|--------|
| Name | `profiles.full_name` |
| Email | `profiles.email` |
| Last Login | `profiles.last_login` |
| Has user_roles Entry | Boolean |
| Flag | Warning if no user_roles entry |

### 4.2 User Permission Resolver (Second Tab)

**Purpose:** Search any user, see everything about their permissions.

**Search:** Combobox with debounced search (name or email), returns top 10 matches.

**Selected User Card:**

```
[Avatar] Full Name
Email: xxx@jkkn.ac.in
Status: Active/Inactive
Last Login: Apr 13, 2026

Legacy Role (profiles.role): faculty
Primary Role (user_roles): hod         [MISMATCH badge if different]
All Assigned Roles: faculty, hod       [chips]
Is Super Admin: No
Is Orphan: No                          [WARNING badge if yes]
```

**Institution Access Section:**

| Institution | Access Type | Active | Granted By |
|-------------|-----------|--------|------------|
| JKKN Engineering | full | Yes | Director |
| JKKN Pharmacy | billing | Yes | Admin |

If no entries: "No cross-institution access configured. User sees only their primary institution."

**Effective Permissions Section:**

Collapsible accordion grouped by PERMISSION_CATEGORIES from `lib/constants/permissions.ts`:

```
> User Management (4/12 granted)
  [x] users.view
  [x] users.create
  [ ] users.edit
  [ ] users.delete
  ...

> Academic Management (8/15 granted)
  [x] academic.years.view
  ...
```

- Green checkmark = granted
- Gray X = denied
- Each permission shows which role(s) grant it (tooltip: "Granted by: hod")
- Filter: "Show granted only" / "Show denied only" / "Show all"

### 4.3 Permission Matrix View (Third Tab)

**Purpose:** Compare what each role can do across modules.

**Layout:** Horizontal scrollable table.

| Permission | super_admin | administrator | faculty | hod | student | ... |
|-----------|------------|--------------|---------|-----|---------|-----|
| users.view | G | G | G | G | - | |
| users.create | G | G | - | - | - | |
| users.delete | G | G | - | - | - | |
| billing.view | G | G | - | - | G | |

- `G` = Granted (green cell)
- `-` = Denied (empty/gray cell)
- Grouped by permission category (collapsible rows)
- Column header shows role name + user count

**Filters:**
- Module filter (show only billing permissions, only academic, etc.)
- Role filter (show only selected roles)

### 4.4 Comparison View (Fourth Tab)

**Purpose:** Compare two users OR two roles side by side.

**Mode Toggle:** "Compare Users" | "Compare Roles"

**Compare Users:**
- Two user search boxes
- Shows side-by-side:
  - Profile info
  - Assigned roles
  - Effective permissions (highlight differences)
  - Institution access

**Compare Roles:**
- Two role dropdowns
- Shows side-by-side:
  - Permission matrix (highlight where they differ)
  - User count per role
  - Green = both have, Yellow = only left has, Blue = only right has

---

## 5. API Endpoints

### 5.1 `GET /api/users/permissions-audit/health`

Returns system health metrics (cards + tables for tab 1).

**Auth:** Super admin or administrator
**Response:**
```json
{
  "totals": {
    "users": 5646,
    "orphans": 271,
    "mismatches": 330,
    "roles": 19,
    "superAdmins": 8
  },
  "usersPerRole": [...],
  "permissionHealth": [...],
  "superAdminList": [...]
}
```

### 5.2 `GET /api/users/permissions-audit/resolve?userId=xxx`

Returns complete resolved permissions for one user.

**Auth:** Super admin or administrator (institution-scoped for admin)
**Response:**
```json
{
  "user": { "id", "email", "fullName", "role", "isSuperAdmin", "isActive", "lastLogin" },
  "isOrphan": true/false,
  "legacyRole": "faculty",
  "assignedRoles": [{ "roleKey", "roleName", "isPrimary", "assignedAt", "assignedBy" }],
  "primaryRole": "hod",
  "isMismatch": true/false,
  "mergedPermissions": { "users.view": true, ... },
  "institutionAccess": [{ "institutionName", "accessType", "isActive" }]
}
```

### 5.3 `GET /api/users/permissions-audit/matrix`

Returns permission matrix for all roles.

**Auth:** Super admin only
**Response:**
```json
{
  "roles": ["super_admin", "administrator", ...],
  "roleMeta": { "super_admin": { "name": "Super Administrator", "userCount": 8 }, ... },
  "matrix": {
    "users.view": { "super_admin": true, "administrator": true, "faculty": true, ... },
    ...
  }
}
```

### 5.4 `GET /api/users/permissions-audit/compare`

Params: `type=users|roles`, `left=id1`, `right=id2`

Returns comparison data with diff highlights.

---

## 6. Data Flow

```
Browser → API Route → Supabase Direct Query (not RPC)
                    → No service layer needed (read-only audit queries)
                    → Returns aggregated data
```

**[DECISION]:** These are read-only audit queries. No new service class needed. The API routes will query Supabase directly with optimized SQL. This avoids coupling to existing services that might change.

**[DECISION]:** No new database tables needed. All data comes from existing tables (profiles, custom_roles, user_roles, user_institution_access, institutions).

---

## 7. UI Component Tree

```
/users/permissions-audit/page.tsx (server component)
└── _components/
    ├── permissions-audit-client.tsx (client wrapper with tabs)
    ├── system-health-tab.tsx
    │   ├── health-stat-cards.tsx
    │   ├── users-per-role-table.tsx
    │   ├── permission-health-table.tsx
    │   └── super-admin-list.tsx
    ├── user-resolver-tab.tsx
    │   ├── user-search-combobox.tsx
    │   ├── user-info-card.tsx
    │   ├── institution-access-table.tsx
    │   └── effective-permissions-accordion.tsx
    ├── permission-matrix-tab.tsx
    │   ├── matrix-filters.tsx
    │   └── matrix-table.tsx
    └── comparison-tab.tsx
        ├── compare-mode-toggle.tsx
        ├── user-comparison.tsx
        └── role-comparison.tsx
```

---

## 8. Edge Cases

| Scenario | Handling |
|----------|---------|
| User has no user_roles entry (orphan) | Show warning badge, display legacy role permissions |
| User has profiles.role but it doesn't match any custom_role | Show "Unknown role: {role}" with error styling |
| Super admin with only is_super_admin flag (no role entry) | Show "Bypass: is_super_admin flag" |
| User with 0 permissions across all roles | Show "No permissions granted" warning |
| Role with 0 users assigned | Still show in matrix, gray out column header |
| Comparison of super_admin (bypass) vs regular user | Super admin shows all green with "bypass" label |
| Very long permission list (400+) | Virtualized list or paginated accordion |
| Stale data after role change | React Query with 30s stale time for audit queries |

---

## 9. Non-Goals (Explicitly Out of Scope)

- **No role editing** from this page (use existing /users/role-management)
- **No user editing** from this page (use existing /users/[id])
- **No permission fixing** from this page (audit only, not remediation)
- **No audit log/history** (no role_changes_log table exists yet)
- **No CSV/PDF export** in v1
- **No email alerts** for mismatches

---

## 10. Success Criteria

| Test | Pass Condition |
|------|---------------|
| Health tab loads | Shows correct orphan count (271), mismatch count, role counts |
| User resolver | Search "director@jkkn.ac.in" → shows super_admin, all permissions granted |
| Orphan detection | Search for Isvarya → shows orphan warning (no user_roles entry) |
| Mismatch detection | Search user with faculty profile + super_admin user_role → shows MISMATCH |
| Permission matrix | Shows 19 roles as columns, permissions grouped by module |
| Comparison | Compare student vs faculty → differences highlighted |
| Access control | Non-super-admin → redirected to /unauthorized |
| Performance | Health tab loads in < 3 seconds with 5,646 users |

---

## 11. Technical Constraints

- **Framework:** Next.js 15 App Router (server + client components)
- **UI Library:** shadcn/ui (Tabs, Card, Table, Badge, Command/Combobox, Accordion)
- **Charts:** None needed (tables are more appropriate for audit data)
- **State:** React Query for API data, no global state needed
- **Styling:** Tailwind CSS, follows existing MyJKKN design system
- **Sidebar:** Add to "User Management" group with `Shield` icon, requires `super_admin` role check

---

## Implementation Notes

_To be filled during Phase 2 (Plan) and Phase 4 (Build)_
