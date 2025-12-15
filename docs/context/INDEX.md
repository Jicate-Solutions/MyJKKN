# MyJKKN Context Documentation Index

> Complete reference documentation for building MyJKKN-connected applications

---

## Quick Navigation

### For Students Building Applications

If you're building an application that connects to MyJKKN, start here:

1. **[Integration Guide](./integration/README.md)** - How to connect your app
2. **[Authentication](./integration/AUTHENTICATION.md)** - Auth flow for child apps
3. **[API Reference](./integration/API_REFERENCE.md)** - All available endpoints
4. **[Permissions](./integration/PERMISSIONS.md)** - Permission system guide

### For Understanding Data Structures

1. **[Academic Hierarchy](./entities/academic-hierarchy.md)** - Institution → Degree → Department → Program → Semester → Section
2. **[Billing Hierarchy](./entities/billing-hierarchy.md)** - Category → Sub-Category → Item → Bill
3. **[Data Types Reference](./entities/data-types.md)** - All enums, status values, custom types

---

## Module Documentation

### Priority 0: Core Entities (Start Here)

| Module | Description | Files |
|--------|-------------|-------|
| **[Organizations](./modules/organizations/README.md)** | Institution hierarchy (institutions, degrees, departments, programs, semesters, sections, courses) | 8 files |
| **[Students](./modules/students/README.md)** | Student profiles, enrollment, promotion (80+ fields) | 4 files |
| **[Users](./modules/users/README.md)** | User profiles, roles, permissions, institution access | 4 files |

### Priority 1: High-Use Modules

| Module | Description | Files |
|--------|-------------|-------|
| **[Academic](./modules/academic/README.md)** | Timetables, attendance, periods, staff planning, academic years | 6 files |
| **[Billing](./modules/billing/README.md)** | Bills, invoices, receipts, refunds, discounts, categories | 7 files |
| **[Staff](./modules/staff/README.md)** | Staff profiles, employment categories | 3 files |

### Priority 2: Feature Modules

| Module | Description | Files |
|--------|-------------|-------|
| **[Admissions](./modules/admissions/README.md)** | Student admission workflow | 2 files |
| **[Resource Management](./modules/resource-management/README.md)** | Resources, reservations, maintenance | 4 files |
| **[Notifications](./modules/notifications/README.md)** | Push, in-app, email notifications | 2 files |

### Priority 3: Specialized Modules

| Module | Description |
|--------|-------------|
| **[Admin](./modules/admin/README.md)** | System administration tools |
| **[AI Query](./modules/ai-query/README.md)** | Natural language data queries |
| **[Application Hub](./modules/application-hub/README.md)** | App discovery and access |
| **[Applications](./modules/applications/README.md)** | Third-party app integrations |
| **[Audit Trail](./modules/audit-trail/README.md)** | Activity logging |
| **[Bug Leaderboard](./modules/bug-leaderboard/README.md)** | Bug reporter rankings |
| **[My Bug Reports](./modules/my-bug-reports/README.md)** | Personal bug tracking |
| **[Dashboard](./modules/dashboard/README.md)** | Personalized dashboards |
| **[Profile](./modules/profile/README.md)** | User profile management |
| **[System](./modules/system/README.md)** | System configuration |

---

## Entity Reference

Cross-module entity documentation for understanding data relationships:

| Document | Description |
|----------|-------------|
| **[Entity Index](./entities/INDEX.md)** | Complete list of all 68 database tables |
| **[Academic Hierarchy](./entities/academic-hierarchy.md)** | Institution → Section relationship chain |
| **[Billing Hierarchy](./entities/billing-hierarchy.md)** | Billing category structure |
| **[Data Types](./entities/data-types.md)** | Enums, status values, custom types |

---

## Integration Guide

For building child applications that connect to MyJKKN:

| Document | Description |
|----------|-------------|
| **[Overview](./integration/README.md)** | Integration architecture |
| **[Authentication](./integration/AUTHENTICATION.md)** | OAuth/API key authentication |
| **[API Reference](./integration/API_REFERENCE.md)** | Complete endpoint documentation |
| **[Permissions](./integration/PERMISSIONS.md)** | Permission requirements |
| **[Examples](./integration/EXAMPLES.md)** | Code examples (TypeScript, Python) |

---

## Documentation Status

See **[IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md)** for current documentation progress.

---

## How to Use This Documentation

### For AI-Assisted Development

When using an AI assistant (like Claude) to build a MyJKKN-connected application:

1. **Load relevant context files** based on your task:
   - Building a student-facing app? Load `modules/students/` + `modules/academic/`
   - Building a billing integration? Load `modules/billing/` + `integration/`
   - Need all data models? Load `entities/`

2. **Reference specific files** for detailed information:
   - Entity fields and types
   - Business rules and validations
   - API endpoints and schemas
   - Permission requirements

3. **Use the integration guide** for authentication and API access patterns

### File Naming Convention

Each module follows this structure:
```
modules/[module-name]/
├── README.md           # Module overview
├── [entity-name].md    # Entity documentation
└── [feature-name].md   # Feature-specific docs
```

### Document Template

All documentation files follow a consistent template:
- **Overview**: Purpose and capabilities
- **Data Model**: Fields, types, relationships
- **Business Rules**: Validations and constraints
- **User Flows**: Step-by-step processes
- **Permissions**: Required permissions per operation
- **API Reference**: Endpoints with examples
- **Sample Data**: Realistic JSON examples

---

## Quick Stats

| Metric | Count |
|--------|-------|
| Total Modules | 19 |
| Database Tables | 68 |
| Total Fields | 1200+ |
| Permission Categories | 13 |
| API Endpoints | 100+ |

---

## Related Documentation

- **[MYJKKN_CONTEXT.md](../MYJKKN_CONTEXT.md)** - High-level system overview
- **[CLAUDE.md](../../CLAUDE.md)** - AI development guide
- **[supabase/SQL_FILE_INDEX.md](../../supabase/SQL_FILE_INDEX.md)** - Database schema reference

---

*Last Updated: December 2024*
*Documentation Version: 1.0*
