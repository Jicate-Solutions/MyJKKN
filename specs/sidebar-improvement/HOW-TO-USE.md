# Sidebar Improvement — How to Use This Handoff

## For Ommsharravana (Project Owner)

### What this handoff covers

5 improvements to MyJKKN's navigation system:

1. **Make SF100 findable** — 16 Startup Studio pages can't be found via Ctrl+K search, bottom nav, or favorites. One file change fixes all three.

2. **Restore sidebar entries** — PR #139 is ready. Merge it.

3. **Prevent future sidebar overwrites** — Split the 2,120-line monolith into separate files per module. No more merge conflicts.

4. **Quick action button** — Floating "+" button for SF100 team leaders to quickly log check-ins and paid users.

5. **New module badge** — Small dot on new sidebar items so users discover them.

### How to give this to a developer

Copy-paste this prompt:

```
Read the handoff at /Users/omm/PROJECTS/MyJKKN/specs/sidebar-improvement/00-HANDOFF-INDEX.md

Then read the master spec: /Users/omm/PROJECTS/MyJKKN/specs/sidebar-improvement-spec.md

Start with Task 1 (page registry registration). It's the highest impact change — 15 minutes of work that makes 16 pages findable through command palette, bottom nav, and favorites.

After Task 1, merge PR #139 for Task 2.

Then proceed to Task 3 (sidebar split) which is the architectural fix.
```

### How to verify each task was done correctly

```bash
# After Task 1:
git show jicate/main:lib/navigation/page-registry.ts | grep "solve-for-100" | wc -l
# Expected: 7+

# After Task 2:
git show jicate/main:lib/sidebarMenuLink.ts | grep "Solve for 100"
# Expected: found

# After Task 3:
ls lib/sidebar/modules/ | wc -l
# Expected: 10+
```
