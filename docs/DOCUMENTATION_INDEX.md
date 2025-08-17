# 📚 MyJKKN Documentation Index

## ⚠️ CRITICAL DOCUMENTATION RULES

### 🔴 STRICT POLICY: ONE DOCUMENT, ONE PURPOSE
**NEVER create duplicate documentation. ALWAYS update existing files.**

## 📁 Documentation Structure

```
docs/
├── DOCUMENTATION_INDEX.md    # THIS FILE - Master index
├── README.md                  # Project overview ONLY
├── modules/                   # Module-specific documentation
│   ├── billing/              # Billing module docs
│   ├── attendance/           # Attendance module docs
│   ├── admissions/           # Admissions module docs
│   ├── students/             # Student management docs
│   └── staff/                # Staff management docs
├── features/                  # Feature documentation
│   ├── completed/            # Implemented features
│   └── planned/              # Upcoming features
├── fixes/                     # Bug fixes and solutions
│   ├── YYYY-MM/              # Organized by date
│   └── critical/             # Critical fixes
├── architecture/              # System architecture
│   ├── database/             # Database design
│   ├── frontend/             # Frontend architecture
│   └── backend/              # Backend architecture
├── api/                       # API documentation
│   ├── rest/                 # REST API docs
│   ├── graphql/              # GraphQL docs (if any)
│   └── webhooks/             # Webhook docs
├── deployment/                # Deployment guides
│   ├── local/                # Local setup
│   ├── staging/              # Staging deployment
│   └── production/           # Production deployment
├── guides/                    # How-to guides
│   ├── development/          # Dev guides
│   ├── testing/              # Testing guides
│   └── troubleshooting/      # Troubleshooting
├── decisions/                 # Architecture Decision Records (ADRs)
│   └── YYYY-MM-DD-title.md  # Decision records
└── templates/                 # Documentation templates
```

## 📝 File Naming Convention

### Standard Format:
```
[DATE]-[CATEGORY]-[TITLE].md

Examples:
2025-01-16-MODULE-billing-implementation.md
2025-01-16-FIX-attendance-calculation.md
2025-01-16-FEATURE-dashboard-widgets.md
2025-01-16-GUIDE-api-authentication.md
```

### Categories:
- `MODULE` - Module documentation
- `FEATURE` - Feature documentation
- `FIX` - Bug fix documentation
- `GUIDE` - How-to guides
- `ADR` - Architecture decisions
- `API` - API documentation
- `DEPLOY` - Deployment docs

## 📋 Current Documentation Registry

### ✅ Organized Documents

#### Modules Documentation
| File | Location | Purpose | Last Updated |
|------|----------|---------|--------------|
| Billing Implementation | `docs/modules/billing/implementation.md` | Billing module overview | - |
| Attendance System | `docs/modules/attendance/system.md` | Attendance tracking | - |
| Staff Planning | `docs/modules/staff/planning.md` | Staff management | - |

#### Features Documentation
| File | Location | Purpose | Last Updated |
|------|----------|---------|--------------|
| Dashboard Personalization | `docs/features/completed/dashboard-personalization.md` | Custom dashboards | - |
| Auto Invoice Generation | `docs/features/completed/auto-invoice.md` | Automatic invoicing | - |

#### Fixes Documentation
| File | Location | Purpose | Last Updated |
|------|----------|---------|--------------|
| Billing Refund Fix | `docs/fixes/2025-01/billing-refund.md` | Refund calculation fix | - |
| Attendance Errors | `docs/fixes/2025-01/attendance-errors.md` | Attendance bug fixes | - |

### ⚠️ Legacy Documents (Need Migration)

These files exist in root and need to be moved to proper locations:

#### To Migrate:
- [ ] `BILLING_*.md` → Move to `docs/modules/billing/`
- [ ] `ATTENDANCE_*.md` → Move to `docs/modules/attendance/`
- [ ] `STAFF_*.md` → Move to `docs/modules/staff/`
- [ ] `*_IMPLEMENTATION.md` → Move to `docs/features/`
- [ ] `*_FIX.md` → Move to `docs/fixes/`

## 🚫 Deprecated Locations

**NEVER create documentation in these locations:**
- ❌ Root directory (except main README.md)
- ❌ Random module folders
- ❌ Component folders
- ❌ Source code directories

## 📝 Documentation Templates

### When Creating New Documentation:

1. **Check this index first** - Does it already exist?
2. **Use the correct directory** - Follow the structure above
3. **Use standard naming** - `YYYY-MM-DD-CATEGORY-title.md`
4. **Update this index** - Add your document to the registry
5. **Use templates** - See `docs/templates/`

## 🔍 Quick Search Guide

### By Module:
- Billing: `docs/modules/billing/`
- Attendance: `docs/modules/attendance/`
- Students: `docs/modules/students/`
- Staff: `docs/modules/staff/`
- Admissions: `docs/modules/admissions/`

### By Type:
- Bug Fixes: `docs/fixes/`
- Features: `docs/features/`
- Guides: `docs/guides/`
- API: `docs/api/`

### By Date:
- Check date prefix in filename
- Fixes organized by YYYY-MM folders

## 🔄 Update Protocol

When updating any documentation:

1. **Find existing file** using this index
2. **Add update header**:
```markdown
## Update Log
- **2025-01-16**: [Your Name] - Description of changes
```
3. **Update this index** with new timestamp
4. **Never create a duplicate**

## 📊 Documentation Statistics

- Total Documents: 55+ (legacy)
- Organized: 0 (starting fresh)
- To Migrate: 30+ 
- Templates: 5

## 🎯 Next Steps

1. Migrate all root-level .md files to proper locations
2. Create templates for each documentation type
3. Set up automated documentation generation
4. Implement documentation linting

---

**Last Index Update**: 2025-01-16
**Maintained By**: Claude & Development Team
**Version**: 1.0.0