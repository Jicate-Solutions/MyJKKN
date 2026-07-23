# Multi-Agent Skill Patterns

Guide for creating skills that spawn subagents to handle complex, multi-phase workflows.

## When to Use Multi-Agent Architecture

Use multi-agent orchestration when:

- The workflow has 3+ distinct phases with different expertise requirements
- A single context window would degrade before the task completes (~40% usage threshold)
- Phases can benefit from different model capabilities (Opus for reasoning, Sonnet for execution)
- Each phase produces a discrete artifact that feeds the next phase

**Do NOT use multi-agent when:**

- The task fits comfortably in a single context window
- Phases are tightly coupled and need shared state
- The overhead of agent setup exceeds the benefit

## Context Multiplication

**Problem:** Claude's context window degrades after ~40% usage.
**Solution:** Each subagent gets a fresh context window.

| Approach | Usable Tokens |
|----------|---------------|
| Monolithic (single agent) | ~80k usable of 200k |
| 5-phase orchestration | 5 × 80k = ~400k usable |

## Skill Structure for Multi-Agent Skills

```
{skill-name}/
├── SKILL.md                    # Orchestrator instructions
├── agents/
│   ├── phase-1-{name}.md      # Subagent prompts with frontmatter
│   ├── phase-2-{name}.md
│   └── phase-N-{name}.md
├── references/
│   ├── 00-{shared}.md         # All agents read this
│   ├── 01-{phase-specific}.md # Phase-specific reference
│   └── output-templates.md    # JSON contracts
├── scripts/
│   └── init-session.sh        # Session setup
└── reports/                    # Output directory (gitignored)
```

## Agent File Format

Each agent file uses YAML frontmatter to declare its configuration:

```markdown
---
name: phase-1-discovery
description: Researches the codebase to identify patterns, conventions, and architecture
model: opus
tools:
  - Read
  - Glob
  - Grep
  - WebSearch
---

# Phase 1: Discovery

## Context
You are phase 1 of a {N}-phase pipeline. Your job is to research and document findings.

## Inputs
- Session directory: `${SESSION_DIR}`
- Shared reference: Read `${SKILL_DIR}/references/00-shared.md`

## Process
1. [Specific steps for this phase]
2. [Each step should be concrete and actionable]

## Output
Write your report to `${SESSION_DIR}/01-discovery.md`

Return JSON:
\`\`\`json
{
  "status": "complete",
  "report_path": "${SESSION_DIR}/01-discovery.md",
  "discovery_summary": {
    "files_analyzed": 0,
    "patterns_found": [],
    "key_findings": []
  }
}
\`\`\`
```

## Model Selection Guide

| Phase Type | Recommended Model | Why |
|-----------|-------------------|-----|
| Architecture/Design | **opus** | Complex reasoning, strategic decisions |
| Analysis/Synthesis | **opus** | Deep insight, pattern recognition |
| Creative/Ideation | **opus** | Novel thinking, alternatives |
| Final Report/Quality | **opus** | Quality matters most |
| Search/Extraction | sonnet | Speed advantage, systematic |
| Code Generation | sonnet | Reliable patterns, fast |
| QA/Verification | sonnet | Systematic checking |
| Deploy/Format | haiku | Pure execution, speed |

For skills where all phases need similar capability, use a single model throughout.

## Orchestrator SKILL.md Pattern

The orchestrator manages the pipeline. Key rules:

1. **Only the orchestrator uses TodoWrite** — agents return JSON
2. **Pass `SKILL_DIR` to agents** — so they can read references
3. **Each phase reads previous reports** — not the full conversation
4. **Later phases may read MULTIPLE previous reports** — not just the immediate predecessor

```markdown
## Execution Flow

1. Create session directory: `{output_dir}/{timestamp}-{session-name}/`
2. For each phase:
   a. Spawn agent using `agents/phase-N-{name}.md`
   b. Pass: session_dir, skill_dir, and any previous phase summaries
   c. Wait for JSON response
   d. Verify report was written
   e. Update todo list
3. Present final output to user
```

## Report Naming Convention

```
0{phase_number}-{phase-name}.md
Examples: 01-discovery.md, 02-analysis.md, 03-synthesis.md
```

## JSON Response Contract

Every agent returns this structure:

```json
{
  "status": "complete|partial|error",
  "report_path": "{session_dir}/0N-phase-name.md",
  "{phase_name}_summary": {
    // Phase-specific metrics and key findings
    // Keep this concise — it's passed to subsequent phases
  }
}
```

## Common Orchestration Archetypes

### 1. Linear Chain
A → B → C → D (each phase feeds the next)
**Use for:** Research → Analyze → Write → Polish

### 2. Convergent (Fan-In)
A, B, C → Synthesize (parallel phases merge)
**Use for:** Multi-source research, cross-functional analysis

### 3. Divergent (Fan-Out)
A → B, C, D (one phase spawns parallel work)
**Use for:** Generating alternatives, multi-target deployment

### 4. Iterative Loop
Write → Review → Rewrite (loop until quality threshold)
**Use for:** Content refinement, code quality improvement

### 5. Conditional Branch
If finding X → Phase B; else → Phase C
**Use for:** Dynamic workflows that adapt based on findings

### 6. Accumulative
Build knowledge across multiple passes over the same data
**Use for:** Deep analysis, comprehensive audits

## Agent Template Rules

**DO:**
- Return JSON with status and report path
- Read shared references from `${SKILL_DIR}/references/`
- Write reports to `${SESSION_DIR}/`
- Keep summary fields concise (they're passed to later phases)

**DO NOT:**
- Use TodoWrite (orchestrator manages this)
- Proceed to the next phase (orchestrator controls flow)
- Save state outside the report file
- Assume knowledge from other phases without reading their reports
