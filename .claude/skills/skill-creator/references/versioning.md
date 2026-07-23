# Skill Versioning

Guide for tracking skill versions, maintaining changelogs, and managing migrations.

## Version Field in Frontmatter

Add a `version` field to SKILL.md frontmatter:

```yaml
---
name: my-skill
description: Does X when Y happens
version: 1.2.0
---
```

While only `name` and `description` are required fields, `version` is strongly recommended for skills that are shared, packaged, or iterated on frequently.

## Semantic Versioning for Skills

Skills use semantic versioning adapted for behavioral changes:

| Version | When to Bump | Example |
|---------|-------------|---------|
| **MAJOR** (X.0.0) | Breaking workflow changes, removed steps, restructured phases | Changing a 3-phase skill to 5-phase |
| **MINOR** (x.Y.0) | New capabilities, added steps, new reference files | Adding eval support to a skill |
| **PATCH** (x.y.Z) | Clarity fixes, typo corrections, prompt refinements | Rewording a confusing instruction |

**Rule of thumb:** If a user who memorized the old version would be surprised by the new behavior, it's at least MINOR. If their existing workflow would break, it's MAJOR.

## Changelog Format

Maintain a changelog section at the bottom of SKILL.md or in a separate `references/changelog.md`:

```markdown
## Changelog

### 1.2.0 (2026-04-04)
- Added: Eval/testing workflow in Step 6
- Added: references/eval-testing.md for test scenario patterns

### 1.1.0 (2026-03-15)
- Added: Multi-agent orchestration guidance in Step 2
- Added: references/multi-agent.md with agent templates

### 1.0.1 (2026-03-01)
- Fixed: Clarified Step 4 wording for reference file organization

### 1.0.0 (2026-02-01)
- Initial release
```

**Keep entries concise.** Use Added/Changed/Removed/Fixed prefixes (follows Keep a Changelog convention).

**Placement guidance:**
- For skills under ~400 lines: include changelog at the bottom of SKILL.md
- For skills near the 500-line limit: move to `references/changelog.md` and link from SKILL.md

## When to Bump Versions

Bump the version **when you package the skill** (Step 5), not during development. During active iteration:

1. Make changes to SKILL.md and resources
2. Test the changes (see eval-testing.md)
3. When ready to distribute, bump version and add changelog entry
4. Run `package_skill.py` to create the .skill file

## Migration Guidance

For MAJOR version bumps, include migration notes:

```markdown
### 2.0.0 (2026-06-01)
- **BREAKING:** Replaced single-agent workflow with multi-phase orchestration
- **BREAKING:** Moved all templates from assets/ to references/
- Migration: Users on v1.x should re-read the updated Step 2 for new planning guidance
- Migration: assets/template.html → references/template.md (format changed)
```

## Version Compatibility

When a skill depends on specific tool capabilities or model features:

```yaml
---
name: advanced-skill
description: Does X using subagent orchestration
version: 2.0.0
---
```

Document compatibility requirements in SKILL.md body:

```markdown
## Requirements
- Claude Code with Agent tool support (for multi-phase orchestration)
- Opus model recommended for Phase 1 and Phase 3
```

## Versioning Reference Files

Reference files don't need individual versions. They inherit the skill's version. When updating a reference file, bump the skill version accordingly and note the change in the changelog.
