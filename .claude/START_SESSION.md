# Claude Code Session Starter

## 🚀 Quick Start (Copy & Paste This)

```
Load settings from .claude/claude_settings.json and remember:

CLAUDE SKILLS:
Load all skills from .claude/skills/ for automatic use:
- toast-migrator: Auto-fix useToast → react-hot-toast
- Auto-detect patterns and apply appropriate skills

SUPABASE RULES:
1. ALWAYS check supabase/SQL_FILE_INDEX.md first
2. NEVER create duplicate SQL files
3. Update ONLY files in supabase/setup/
4. Tables → setup/01_tables.sql
5. Functions → setup/02_functions.sql
6. Policies → setup/03_policies.sql
7. Add dated comments for all changes
8. Update SQL_FILE_INDEX.md after changes

RLS POLICY RULES:
- Always use (SELECT auth.uid()) not auth.uid()
- SELECT: USING only, INSERT: WITH CHECK only
- UPDATE: USING + WITH CHECK, DELETE: USING only
- Always specify TO authenticated or TO anon
- Create indexes on all policy columns
- Use PERMISSIVE policies (avoid RESTRICTIVE)
- Never use FOR ALL - create separate policies

SUPABASE AUTH SSR (CRITICAL):
⛔ NEVER USE:
- cookie.get(), cookie.set(), cookie.remove()
- @supabase/auth-helpers-nextjs (DEPRECATED)
✅ ALWAYS USE:
- @supabase/ssr package
- ONLY getAll() and setAll() methods
- Middleware MUST call getUser()
- Return supabaseResponse from middleware

EDGE FUNCTIONS RULES:
✅ USE: Deno.serve, npm:/jsr:/node: imports with versions
✅ SHARED: Code in _shared folder, no cross-dependencies
✅ FILES: Write only to /tmp directory
❌ NEVER: Bare specifiers, old serve import
❌ NEVER: Cross-function dependencies

DATABASE FUNCTIONS:
✅ DEFAULT: SECURITY INVOKER (safer than DEFINER)
✅ ALWAYS: SET search_path = '' (security)
✅ USE: Fully qualified names (public.table)
✅ SPECIFY: IMMUTABLE/STABLE/VOLATILE correctly
❌ AVOID: SECURITY DEFINER unless required

SQL STYLE:
✅ lowercase keywords, snake_case identifiers
✅ Plural tables (users), singular columns (user_id)
✅ Schema prefix always (public.users)
✅ Comments on all tables
✅ ISO 8601 dates, meaningful aliases with 'as'

PROJECT CONTEXT:
- Project: MyJKKN (Education Management System)
- Database: Supabase (project: kvizhngldtiuufknvehv)
- Stack: Next.js 14, TypeScript, React Query
- Multi-tenant with institution_id
- RLS enabled on all tables

AUTOMATION:
- When I say "new module" → Follow new_module workflow
- When I say "update table" → Follow update_table workflow  
- When I say "debug database" → Follow debug_issue workflow
- Use Task agents for complex operations

Ready to work on MyJKKN with all rules loaded.
```

## 📋 Full Session Setup (Detailed)

### Step 1: Load Memory Context
```
Remember these contexts for MyJKKN:

DATABASE CONVENTIONS:
- All tables: id (UUID), institution_id, created_at, updated_at
- Use snake_case everywhere
- Enable RLS on all tables
- Indexes prefixed with idx_
- Triggers prefixed with trg_

FILE ORGANIZATION:
- SQL only in supabase/setup/
- Types in types/[module].ts
- Services in lib/services/[module]/
- Hooks in hooks/[module]/
- Check SQL_FILE_INDEX.md always
```

### Step 2: Enable Auto-Agents
```
Enable these automated behaviors:

TRIGGER WORDS:
- "database", "table", "SQL" → Check SQL_FILE_INDEX.md
- "new module" → Use supabase_module_creator agent
- "debug" + "database" → Use supabase_debugger agent
- "migrate", "update schema" → Use supabase_migrator agent

AUTO-CHECKS:
- Before any SQL work → Check index
- Before creating files → Verify location
- After changes → Update index
```

### Step 3: Load Task Agents
```
Load custom Task agents:

1. supabase_module_creator - For new modules
2. supabase_debugger - For debugging issues
3. supabase_migrator - For schema updates

Use with: "Use Task tool with supabase_[agent] for [task]"
```

## 🎯 Shortcut Commands

After loading, use these shortcuts:

| Shortcut | Action |
|----------|--------|
| `supa-new` | Create new module with all conventions |
| `supa-update` | Update existing table properly |
| `supa-debug` | Debug database issue systematically |
| `supa-check` | Verify current schema and index |

## 📝 Example Usage After Setup

### Creating a Module:
```
"supa-new: Library Management with books, members, borrowing"
```

### Updating Schema:
```
"supa-update: Add status column to students table"
```

### Debugging:
```
"supa-debug: Bills not calculating correctly"
```

## 🔄 Workflow Verification

After setup, test with:
```
"Show me the current Supabase workflow for adding a new module"
```

Expected response should follow:
1. Check SQL_FILE_INDEX.md
2. Update setup/01_tables.sql only
3. Add proper comments
4. Create types, services, hooks
5. Update index

## 💡 Pro Tips

1. **Start every session** with the Quick Start prompt
2. **Use shortcuts** for common tasks
3. **Chain commands** for complex operations
4. **Verify workflows** before major changes

## 🚨 Emergency Reset

If something goes wrong:
```
"Reset Supabase rules: Load from SUPABASE_PROMPTS.md, 
check SQL_FILE_INDEX.md, never create duplicates,
update only setup files, follow all conventions."
```

---

**Remember**: Consistency prevents confusion. Start every session the same way!