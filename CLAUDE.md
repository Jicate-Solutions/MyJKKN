# Claude Code MCP Servers Usage Guide

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

## Notes
- Memory persists across Claude Code sessions
- Sequential thinking helps maintain consistency in complex tasks
- Combine both for maximum effectiveness
- Always restart Claude Code after updating MCP configuration
- Check `.claude/SUPABASE_PROMPTS.md` for detailed Supabase templates
- add to this memory for when i create a custorm roles for organization permision access