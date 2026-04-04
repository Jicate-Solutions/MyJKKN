# VAC Module Handoff — How to Use

**For:** Project Owner (Omm)
**Module:** Value-Added Courses + CASE Graduation Tracker

## Give This to Boobalan

Share the entire `specs/vac-handoff/` folder. He should start with `00-HANDOFF-INDEX.md`.

## Copy-Paste Prompt for AI Agent

If using Claude Code or another AI agent to execute the merge, paste this:

```
Read all files in specs/vac-handoff/ directory. This is a developer handoff for merging the VAC module to production.

Your task:
1. Read 00-HANDOFF-INDEX.md for overview
2. Read 06-PRODUCTION-DELTA.md for the exact 49 files to create
3. Run the database migration in 04-MIGRATION-GUIDE.md on production Supabase
4. Cherry-pick or merge the omm-dev branch commits for the VAC module
5. Update lib/sidebarMenuLink.ts with the VAC route permissions
6. Run npm run build to verify
7. Deploy to Vercel

Source: ommdev remote (Jicate-Solutions/myjkkn_ommdev), branch omm-dev
Target: origin (JKKN-Institutions/MyJKKN), branch main
```

## What's NOT in This Handoff

1. **Course content enrichment** — the 150 lessons have placeholder content. A separate session will rewrite them with real educational material. This is a DATABASE-ONLY update and does NOT require code changes.

2. **Production data seed** — the 92 courses, 2,746 lessons, and CASE track data need to be exported from staging and imported to production. Use Supabase's data export/import tools.

## After Deployment

Verify on production:
- [ ] `/vac` loads with course catalog and filters
- [ ] `/vac/case` shows 6 CASE tracks
- [ ] `/vac/admin` accessible to admin users only
- [ ] `/vac/admin/case/tracks` shows track management
- [ ] Enrollment flow works end-to-end
- [ ] Placement test redirects from CASE tracker
