# Claude Code MCP Servers Usage Guide

---

## ⛔ CRITICAL: GIT BRANCH SAFETY RULES

| Branch | Rule |
|--------|------|
| **main** | **NEVER TOUCH - PROTECTED** |
| **omm-dev** | Safe for all development work |

### Non-Negotiable Rules:
1. **NEVER push to main branch** - not even with `--force`
2. **NEVER checkout main branch** - stay on omm-dev
3. **NEVER merge into main** - only developers do this via GitHub PR
4. **NEVER create PRs to main** - that's for the human developer
5. **All Claude Code work happens on omm-dev only**

### Why This Exists:
- User is a non-coder using vibe coding
- Main branch is for production-ready code
- Developer reviews and merges omm-dev → main via PR
- Local git hooks will BLOCK any main branch operations, but don't even try

### Your Only Allowed Git Commands:
```bash
git checkout omm-dev           # ✅ OK
git add .                      # ✅ OK (on omm-dev)
git commit -m "message"        # ✅ OK (on omm-dev)
git push origin omm-dev        # ✅ OK
git pull origin omm-dev        # ✅ OK
```

### FORBIDDEN Git Commands:
```bash
git checkout main              # ❌ BLOCKED
git push origin main           # ❌ BLOCKED
git push --force origin main   # ❌ BLOCKED
git merge omm-dev (on main)    # ❌ BLOCKED
gh pr create --base main       # ❌ DO NOT DO
```

---

## ⛔ CRITICAL: SUPABASE SAFETY RULES

| Database | Project ID | Rule |
|----------|------------|------|
| **Production** | `kvizhngldtiuufknvehv` | **NEVER EDIT - READ ONLY** |
| **Staging** | `hhprjbgknupaplivtoib` | Safe for all development work |

### Non-Negotiable Rules:
1. **NEVER make any changes to production Supabase** (kvizhngldtiuufknvehv)
2. **READ-ONLY access to production** - only to sync schema to staging
3. **All development work happens in staging** (hhprjbgknupaplivtoib)
4. When syncing schema: **copy FROM production, apply TO staging**

### Schema Pull Script: `scripts/pull-schema-from-production.sh`

**Purpose:** ONE-WAY pull of schema from production to staging

| What It Does | What It NEVER Does |
|--------------|-------------------|
| ✅ READS schema from production | ❌ Never WRITES to production |
| ✅ WRITES schema to staging | ❌ Never syncs data (only structure) |
| ✅ Requires manual confirmation | ❌ Never runs automatically |

**What Gets Pulled (Schema Only):**
- Table structures (columns, types, constraints)
- Enums and custom types
- Functions and triggers
- Indexes
- RLS policies

**What Does NOT Get Pulled:**
- Actual data/records (staging has test data)
- User sessions or auth data
- File storage contents

**Usage:**
```bash
# Preview changes only (no modifications)
./scripts/pull-schema-from-production.sh --dry-run

# Pull and apply (with confirmation prompts)
./scripts/pull-schema-from-production.sh
```

**Requirements:**
- Docker must be running
- Supabase CLI installed and logged in

**Dashboard Links:**
- Production (VIEW ONLY): https://supabase.com/dashboard/project/kvizhngldtiuufknvehv
- Staging (SAFE TO EDIT): https://supabase.com/dashboard/project/hhprjbgknupaplivtoib

---

## Overview
This guide explains how to effectively use the Memory and Sequential Thinking MCP servers in your MyJKKN development workflow.

## 🧠 Memory MCP Server

The Memory server helps Claude remember important context about your project across sessions.

### How to Use Memory Server

#### 1. Store Project Context
Tell Claude to remember important project details:
```
"Remember that our MyJKKN project uses:
- Supabase for database (project: kvizhngldtiuufknvehv)
- Next.js 14 with App Router
- TypeScript with strict mode
- Billing module uses optimized queries with _optimized suffix
- Attendance module tracks daily attendance with period-wise tracking"
```

#### 2. Store Code Patterns
Save your coding conventions:
```
"Remember our code patterns:
- All services go in lib/services/
- Use React Query hooks in hooks/ folder
- Data tables use our custom data-table component
- Always check institution access with useUserInstitutionAccess hook"
```

#### 3. Store Common Issues & Solutions
Document recurring problems:
```
"Remember: When working with billing:
- Always use billing-invoice-service-optimized.ts for performance
- Check for existing discounts before applying new ones
- Refunds require approved_by field to be set"
```

### Memory Commands Examples

```
# Store information
"Remember that the attendance module uses daily_attendance table for tracking"

# Recall information
"What do you remember about our billing module?"

# Update memories
"Update your memory: We now use semester hierarchy for all academic modules"
```

## 🔄 Sequential Thinking MCP Server

The Sequential Thinking server helps Claude break down complex tasks systematically.

### How to Use Sequential Thinking

#### 1. Complex Feature Implementation
```
"Using sequential thinking, help me implement a new notification system:
1. Design the database schema
2. Create the API endpoints
3. Build the React components
4. Add real-time updates
5. Implement push notifications"
```

#### 2. Debugging Complex Issues
```
"Use sequential thinking to debug why student bills are not calculating correctly:
1. Trace the data flow from UI to database
2. Check all calculation functions
3. Verify database triggers
4. Test edge cases
5. Propose a fix"
```

#### 3. Refactoring Code
```
"Using sequential thinking, refactor the attendance module:
1. Analyze current implementation
2. Identify performance bottlenecks
3. Design optimized solution
4. Plan migration strategy
5. Implement changes incrementally"
```

## 📝 Practical Examples for MyJKKN

### Example 1: Adding a New Module
```
"Remember this workflow for adding new modules to MyJKKN:
1. Create database schema in supabase/migrations/
2. Add TypeScript types in types/
3. Create service layer in lib/services/
4. Build React Query hooks in hooks/
5. Implement UI components in app/(routes)/
6. Add to sidebar menu in lib/sidebarMenuLink.ts"

Now use sequential thinking to implement a Library Management module following this workflow.
```

### Example 2: Performance Optimization
```
"Use sequential thinking to optimize the student search:
1. Analyze current query performance
2. Identify N+1 queries
3. Create optimized service with proper joins
4. Implement caching strategy
5. Add loading states and pagination"
```

### Example 3: Debugging with Context
```
"Remember that our billing module had issues with:
- Partial payments not updating bill_balance
- Discounts applying incorrectly to refunds
- Invoice generation timeout for large batches

Now use sequential thinking to implement auto-invoice generation that avoids these issues."
```

## 🎯 Best Practices

### For Memory Server:
1. **Store Project-Specific Context**: Save database schemas, API keys (non-sensitive), module relationships
2. **Document Decisions**: Remember why certain approaches were chosen
3. **Track TODOs**: Store pending tasks and tech debt
4. **Save Error Patterns**: Remember common errors and their solutions

### For Sequential Thinking:
1. **Break Down Complex Tasks**: Use for features spanning multiple files/modules
2. **Plan Before Coding**: Let it create implementation plans
3. **Systematic Debugging**: Use for tracing complex bugs
4. **Code Reviews**: Use to systematically review code changes

## 🚀 Workflow Commands

### Daily Development Session
```
1. "What do you remember about the current tasks in MyJKKN?"
2. "Use sequential thinking to plan today's work on [feature]"
3. "Remember the decisions we made today about [topic]"
```

### Before Major Changes
```
1. "Recall our architecture decisions for [module]"
2. "Use sequential thinking to plan the migration"
3. "Remember to update the documentation after changes"
```

### Debugging Session
```
1. "What do you remember about similar issues we've faced?"
2. "Use sequential thinking to trace this bug"
3. "Remember this solution for future reference"
```

## 🗄️ Supabase MCP Server

The Supabase MCP server provides direct database access for your MyJKKN project.

### ⚠️ CRITICAL SQL FILE MANAGEMENT RULES

#### 🔴 STRICT POLICY: ONE FILE, ONE PURPOSE
**NEVER create duplicate SQL files. ALWAYS update existing files.**

#### File Location Rules:
- **Tables**: ONLY in `supabase/setup/01_tables.sql`
- **Functions**: ONLY in `supabase/setup/02_functions.sql`
- **Policies**: ONLY in `supabase/setup/03_policies.sql`
- **Triggers**: ONLY in `supabase/setup/04_triggers.sql`
- **Views**: ONLY in `supabase/setup/05_views.sql`
- **Check Index**: ALWAYS refer to `supabase/SQL_FILE_INDEX.md`

#### ❌ NEVER DO THIS:
```
# Creating duplicate files like:
- admission_module_schema.sql
- organization_module_setup.sql  
- billing_module_complete.sql
- new_tables_2025.sql
```

#### ✅ ALWAYS DO THIS:
```sql
-- When updating any SQL file:
-- Updated: 2025-01-16 - Added new column to students table
-- Previous: column_name TEXT
ALTER TABLE students ADD COLUMN new_column TEXT;
```

### Supabase MCP Commands

Note: The Supabase MCP server is in **read-only mode** for safety.

#### Query Examples:
```
"Using Supabase MCP, show me all students in the current semester"
"Query the daily_attendance table for today's records"
"List all active bills with pending status"
```

#### Schema Inspection:
```
"Using Supabase MCP, describe the structure of the students table"
"Show me all foreign key relationships for the sections table"
"List all indexes on the daily_attendance table"
```

### Workflow for Database Changes

1. **Check Existing Structure**:
```
"Remember to check supabase/SQL_FILE_INDEX.md before any SQL changes"
"Using Supabase MCP, verify current table structure"
```

2. **Update Appropriate File**:
```
"Update supabase/setup/01_tables.sql to add the new column"
"Add proper comments with date and reason for change"
```

3. **Test Changes**:
```sql
-- First test in Supabase Dashboard SQL Editor
-- Then update the file with tested SQL
```

4. **Update Index**:
```
"Update supabase/SQL_FILE_INDEX.md with the changes made"
```

### Integration with Memory Server

Store database conventions:
```
"Remember: 
- All tables have id (UUID), created_at, updated_at
- Use snake_case for all identifiers
- Always enable RLS on sensitive tables
- Institution_id is required for multi-tenant queries
- Check supabase/SQL_FILE_INDEX.md before creating ANY SQL file"
```

### Common Supabase + Sequential Thinking Workflows

#### Adding a New Feature:
```
"Use sequential thinking to add Equipment Management module:
1. Check supabase/SQL_FILE_INDEX.md for existing tables
2. Design tables in supabase/setup/01_tables.sql
3. Add RLS policies in supabase/setup/03_policies.sql
4. Create service functions in lib/services/
5. Build React Query hooks
6. Update SQL_FILE_INDEX.md"
```

#### Debugging Database Issues:
```
"Use Supabase MCP to check the actual data:
1. Query the problematic table
2. Check foreign key constraints
3. Verify RLS policies
4. Test with different user roles"
```

## 🔧 Integration with MyJKKN Modules

### Academic Module
```
"Remember: Academic module hierarchy is Institution -> Program -> Semester -> Section -> Course"
"Use sequential thinking to add a new grading system feature"
```

### Billing Module
```
"Remember: Always use optimized services for billing queries"
"Use sequential thinking to implement bulk discount application"
```

### Attendance Module
```
"Remember: Attendance uses period-wise tracking with daily_attendance table"
"Use sequential thinking to add attendance analytics dashboard"
```

## 📊 Testing & Validation

Always include these in your sequential thinking:
1. Write unit tests for new functions
2. Test with institution access controls
3. Verify RLS policies in Supabase
4. Check performance with large datasets
5. Validate UI responsiveness

## 🔐 Security Reminders

Store these in memory:
- Never commit sensitive API keys
- Always validate user permissions
- Use RLS policies for data access
- Sanitize user inputs
- Check institution access for all queries

---

## Quick Reference

### Memory Server Commands
- `"Remember that..."` - Store information
- `"What do you remember about..."` - Recall information  
- `"Update your memory..."` - Modify stored information
- `"Forget about..."` - Remove information

### Sequential Thinking Triggers
- `"Use sequential thinking to..."` - Activate step-by-step reasoning
- `"Break down the task of..."` - Decompose complex tasks
- `"Plan the implementation of..."` - Create detailed plans
- `"Systematically debug..."` - Structured debugging

## 🎯 Supabase Default Prompts & Agents

### Master Supabase Prompt (Use at Session Start)
```
"Load the Supabase rules from .claude/SUPABASE_PROMPTS.md and remember:
- NEVER create duplicate SQL files
- Check SQL_FILE_INDEX.md before any SQL work  
- Update ONLY existing files in supabase/setup/
- Follow naming conventions and security rules
- Always enable RLS and add proper indexes"
```

### Creating Custom Supabase Agents

#### Database Module Agent
```
"Use Task tool to create a [MODULE_NAME] module:
Subagent: general-purpose
Prompt: You are a Supabase specialist. Check SQL_FILE_INDEX.md, 
update ONLY setup/01_tables.sql, follow all conventions from SUPABASE_PROMPTS.md,
create types, services, and hooks. Never create duplicate files."
```

#### Database Debugging Agent
```
"Use Task tool to debug [ISSUE]:
Subagent: general-purpose  
Prompt: Debug using Supabase MCP. Check table data, RLS policies, 
user permissions, foreign keys. Follow debugging workflow from SUPABASE_PROMPTS.md."
```

### Automated Triggers

Set these at session start for automatic behavior:

```
"When I mention 'new module' or 'add table':
1. Automatically check SQL_FILE_INDEX.md
2. Only update supabase/setup/01_tables.sql
3. Follow template from SUPABASE_PROMPTS.md
4. Create all related files (types, services, hooks)
5. Update the index"
```

### Quick Commands

#### For New Features:
```
"Supabase module: [NAME] with tables for [ENTITIES]. Follow SUPABASE_PROMPTS.md rules."
```

#### For Updates:
```
"Update [TABLE]: add [COLUMNS]. Check index, update setup files only, add migration."
```

#### For Debugging:
```
"Debug Supabase: [ISSUE]. Use MCP to check data, verify RLS, test permissions."
```

## 📚 Documentation Standards

### ⚠️ CRITICAL: Documentation Management Rules

#### 🔴 NEVER CREATE DUPLICATE DOCS
**ALWAYS check `docs/DOCUMENTATION_INDEX.md` before creating ANY documentation**

#### File Location Rules:
```
docs/
├── modules/[module]/     # Module-specific docs
├── features/            # Feature documentation
├── fixes/YYYY-MM/       # Bug fixes by date
├── architecture/        # System design docs
├── api/                # API documentation
├── guides/             # How-to guides
└── templates/          # Use these templates!
```

#### Naming Convention:
```
YYYY-MM-DD-CATEGORY-title.md

Examples:
2025-01-16-MODULE-billing-system.md
2025-01-16-FIX-login-error.md
2025-01-16-FEATURE-dashboard.md
```

#### Before Creating Any Documentation:
```
1. Check docs/DOCUMENTATION_INDEX.md - Does it exist?
2. If exists → UPDATE the existing file
3. If new → Use appropriate template from docs/templates/
4. Update the index after creating/updating
5. NEVER create .md files in root directory
```

### Documentation Commands:
```
"Check if documentation exists for [topic]"
"Update existing [module] documentation"
"Create new documentation using [template] for [feature]"
"List all documentation for [module]"
```

### Templates Available:
- `MODULE_TEMPLATE.md` - For module documentation
- `FEATURE_TEMPLATE.md` - For feature documentation
- `FIX_TEMPLATE.md` - For bug fix documentation
- `API_TEMPLATE.md` - For API documentation
- `GUIDE_TEMPLATE.md` - For how-to guides

## 📝 Logging & Debugging Standards

### Overview
MyJKKN uses an enhanced logging system with smart deduplication and module-based categorization to support the Bug Reporter module and maintain clean, organized logs.

### Enhanced Logger Utility
Location: `lib/utils/enhanced-logger.ts`

Features:
- **Smart Deduplication**: Groups identical logs and counts occurrences
- **Module Detection**: Automatically categorizes logs by module (e.g., "academic/timetables")
- **Component Tracking**: Extracts React component names from stack traces
- **Structured Export**: Provides organized log data for bug reports

### When to Use Different Log Levels

#### ❌ console.log() - Development Only
```typescript
// TEMPORARY debugging only - MUST be removed before commit
if (process.env.NODE_ENV === 'development') {
  console.log('[MODULE] Debug message:', data);
}
```
**Use for**: Active development and debugging
**Remove**: Before committing code
**Note**: These are removed in production but captured by bug reporter in development

#### ⚠️ console.warn() - Keep in Production
```typescript
// Data validation warnings - KEEP these
console.warn('[academic/timetables] No matching semester found:', { semesterId });
console.warn('[billing] Student has pending bills:', { studentId, billCount });
```
**Use for**:
- Missing expected data
- Validation issues
- Deprecated feature usage
- Configuration problems
- Non-critical issues that should be monitored

#### ❌ console.error() - Keep in Production
```typescript
// Critical errors - ALWAYS keep these
console.error('[academic/attendance] Failed to save attendance:', error);
console.error('[billing/invoices] Database query failed:', error);
```
**Use for**:
- API call failures
- Database errors
- Unhandled exceptions
- Critical system failures
- Data integrity issues

### Enhanced Logger API

```typescript
import { logger } from '@/lib/utils/enhanced-logger';

// Development-only logging (automatically removed in production)
logger.dev('academic/timetables', 'Fetching timetable data', { id });

// Production logging
logger.log('academic/timetables', 'Timetable loaded successfully');

// Info messages
logger.info('billing', 'Processing batch invoice generation', { count: 50 });

// Warnings (best practice - use module prefix)
logger.warn('attendance', 'No periods configured for today', { date });

// Errors (best practice - structured error logging)
logger.error('billing/payments', 'Payment processing failed', error);

// Debug (development only)
logger.debug('academic/staff-plan', 'Staff allocation calculated', { allocations });
```

### Module Naming Convention

Use consistent module prefixes for easy filtering and categorization:

```typescript
// Academic modules
'academic/timetables'
'academic/attendance'
'academic/staff-planning'
'academic/periods'

// Billing modules
'billing/invoices'
'billing/payments'
'billing/receipts'
'billing/refunds'

// Organization modules
'organization/institutions'
'organization/departments'
'organization/programs'
'organization/sections'

// Other modules
'students'
'staff'
'admissions'
'resource-management'
'application-hub'
'bug-reports'
```

### Bug Reporter Integration

The bug reporter automatically:
1. Captures all console logs with deduplication
2. Groups logs by module
3. Counts occurrence of identical logs
4. Extracts component names from stack traces
5. Provides structured log summaries

#### Viewing Captured Logs
When a bug is reported, developers see:
```json
{
  "summary": {
    "totalUniqueEntries": 15,
    "totalOccurrences": 847,
    "errorCount": 3,
    "warnCount": 12,
    "topModules": [
      { "module": "academic/timetables", "count": 234 },
      { "module": "billing/invoices", "count": 156 }
    ]
  },
  "logsByModule": {
    "academic/timetables": [
      {
        "type": "warn",
        "message": "No matching semester found",
        "count": 234,
        "component": "TimetablePage",
        "firstSeen": "2025-01-16T10:00:00Z",
        "lastSeen": "2025-01-16T10:05:00Z"
      }
    ]
  }
}
```

### Development Workflow

#### 1. During Development
```typescript
// Add temporary debug logs
if (process.env.NODE_ENV === 'development') {
  console.log('[academic/timetables] Loading slots:', slots);
}

// Or use logger.dev()
logger.dev('academic/timetables', 'Loading slots', { slots });
```

#### 2. Before Committing
- Remove ALL temporary console.log() statements
- Keep console.warn() for validation issues
- Keep console.error() for error handling
- Use logger.warn() and logger.error() for production-ready logging

#### 3. Production Code
```typescript
// ✅ GOOD - Production-ready logging
try {
  const data = await TimetableService.getTimetables(filters);
  logger.info('academic/timetables', 'Timetables loaded', { count: data.length });
  return data;
} catch (error) {
  logger.error('academic/timetables', 'Failed to load timetables', error);
  throw error;
}

// ❌ BAD - Temporary debug log left in production
console.log('Loading timetables...', filters);
```

### Common Patterns

#### Service Layer Logging
```typescript
// lib/services/academic/timetable-service.ts
export class TimetableService {
  static async getTimetables(filters: TimetableFilters) {
    try {
      logger.info('academic/timetables', 'Fetching timetables', { filters });

      const { data, error } = await supabase
        .from('timetables')
        .select('*')
        .eq('institution_id', filters.institutionId);

      if (error) {
        logger.error('academic/timetables', 'Database query failed', error);
        throw error;
      }

      if (!data || data.length === 0) {
        logger.warn('academic/timetables', 'No timetables found', { filters });
      }

      return data;
    } catch (error) {
      logger.error('academic/timetables', 'Unexpected error', error);
      throw error;
    }
  }
}
```

#### Component Logging
```typescript
// app/(routes)/academic/timetables/[id]/page.tsx
export default function TimetablePage() {
  useEffect(() => {
    const loadData = async () => {
      try {
        logger.dev('academic/timetables', 'Component mounted', { id });

        const data = await TimetableService.getTimetable(id);

        if (!data) {
          logger.warn('academic/timetables', 'Timetable not found', { id });
          return;
        }

        setTimetable(data);
      } catch (error) {
        logger.error('academic/timetables', 'Failed to load timetable', error);
      }
    };

    loadData();
  }, [id]);
}
```

### Benefits of Enhanced Logging

1. **Reduced Storage**: Duplicate logs are counted, not stored repeatedly (90%+ reduction)
2. **Better Debugging**: Module categorization makes it easy to find relevant logs
3. **Performance**: Deduplication prevents memory overflow from render loops
4. **Organization**: Structured logs grouped by module and component
5. **Actionable**: Developers quickly see most frequent issues and affected modules

### Best Practices Checklist

- [ ] Use module-prefixed logging: `[module/submodule]`
- [ ] Remove console.log() before committing
- [ ] Keep console.warn() for validation issues
- [ ] Keep console.error() for critical errors
- [ ] Use logger.dev() for temporary development logs
- [ ] Use logger.warn() and logger.error() for production
- [ ] Test bug reporter captures logs correctly
- [ ] Verify no duplicate logs in bug reports

### Testing Your Logs

```bash
# Check for leftover console.log in your code
grep -r "console\.log" --include="*.ts" --include="*.tsx" app/ lib/ hooks/ components/

# Should only find console.warn and console.error (these are OK)
grep -r "console\.(warn|error)" --include="*.ts" --include="*.tsx" app/ lib/ hooks/ components/
```

### Quick Reference

```typescript
// ❌ Remove before commit
console.log('Debug:', data);

// ✅ Keep for warnings
console.warn('[MODULE] Validation issue:', details);

// ✅ Keep for errors
console.error('[MODULE] Error:', error);

// ✅ Best practice - use enhanced logger
import { logger } from '@/lib/utils/enhanced-logger';

logger.dev('module', 'Development log', data);     // Auto-removed in production
logger.warn('module', 'Warning message', data);    // Kept in production
logger.error('module', 'Error message', error);    // Kept in production
```

---

## 🔮 Beads Issue Tracker (bd)

Beads is a **git-backed distributed issue tracker** designed for AI coding agents. It provides persistent memory across sessions using JSONL files that sync via git.

### Installation (Completed)
- **Binary location**: `C:\Users\Admin\AppData\Local\Programs\bd\bd.exe`
- **Project database**: `D:\Projects\MyJKKN\.beads\`
- **Git hooks**: Installed (pre-commit, post-merge, pre-push, post-checkout)

### Key Benefits
| Feature | Description |
|---------|-------------|
| **Persistent Memory** | Issues survive across Claude Code sessions |
| **Dependency Tracking** | 4 types: blocks, related, parent-child, discovered-from |
| **Ready Work Detection** | Auto-finds unblocked issues |
| **Hash-based IDs** | Format `MyJKKN-xxxx` prevents merge conflicts |
| **Git-Synced** | Team collaboration via version control |

### Essential Commands

```bash
# Create an alias for easier use (add to your shell profile)
alias bd='/c/Users/Admin/AppData/Local/Programs/bd/bd.exe'

# Or use full path:
/c/Users/Admin/AppData/Local/Programs/bd/bd.exe [command]

# Core commands
bd ready                              # See unblocked work
bd list                               # View all issues
bd create "Title" -t feature -p 1     # Create issue (P1 = highest priority)
bd show MyJKKN-xxxx                   # View issue details
bd update MyJKKN-xxxx --status in_progress  # Update status
bd close MyJKKN-xxxx --reason "Done"  # Close issue

# Dependencies
bd dep add MyJKKN-a MyJKKN-b          # A blocks B
bd dep tree MyJKKN-xxxx               # Visualize dependencies
bd blocked                            # Show blocked issues

# Sync & Info
bd sync                               # Manual git sync
bd info                               # Database info
bd stats                              # Statistics
```

### Issue Types & Priorities
```bash
# Types: bug, feature, task, improvement, question
bd create "Fix login" -t bug -p 0      # Critical bug (P0)
bd create "Add dark mode" -t feature -p 2   # Normal feature (P2)

# Priorities: 0 (critical) to 4 (low)
# P0: Critical, P1: High, P2: Normal, P3: Low, P4: Trivial
```

### Workflow with Claude Code

```bash
# Start of session - check what's ready
bd ready

# Create issues for planned work
bd create "Implement user authentication" -t feature -p 1
bd create "Add password reset" -t task -p 2

# Set dependencies
bd dep add MyJKKN-xxxx MyJKKN-yyyy --type blocks

# Track progress
bd update MyJKKN-xxxx --status in_progress

# Complete work
bd close MyJKKN-xxxx --reason "Authentication implemented"

# End of session - sync changes
bd sync
```

### Integration with TodoWrite

- **Beads (bd)**: Long-term persistent task tracking (survives sessions)
- **TodoWrite**: Session-based immediate task tracking

Use Beads for:
- Multi-session features
- Bugs to fix later
- Technical debt tracking
- Cross-team visibility

Use TodoWrite for:
- Current session tasks
- Step-by-step work breakdown
- Real-time progress display

### Labels & Filtering
```bash
# Add labels
bd label add MyJKKN-xxxx "billing"
bd label add MyJKKN-xxxx "urgent"

# Filter by label
bd list --label billing
bd list --status open --priority 0-1
```

### Best Practices

1. **Create issues for discovered work**: When you find bugs or improvements while working on something else
2. **Use dependencies**: Link related issues with `bd dep add`
3. **Close with reasons**: Always provide context when closing
4. **Sync regularly**: Run `bd sync` before ending sessions
5. **Use meaningful titles**: Make issues searchable and clear

---

## Notes
- Memory persists across Claude Code sessions
- Sequential thinking helps maintain consistency in complex tasks
- Combine both for maximum effectiveness
- Always restart Claude Code after updating MCP configuration
- Check `.claude/SUPABASE_PROMPTS.md` for detailed Supabase templates
- Enhanced logging system automatically deduplicates logs for bug reports
- Use module prefixes consistently for better log organization
- add to this memory for when i create a custorm roles for organization permision access
- add to memory for "learners module brand color schema"