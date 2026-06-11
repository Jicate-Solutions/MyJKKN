# Skill Eval & Testing

Guide for testing skills with sample inputs, measuring quality, and running variance analysis.

## Why Test Skills

Skills instruct Claude's behavior. Unlike code, the same skill can produce different results across runs due to model non-determinism. Testing ensures:

1. **Correctness** — Claude follows the workflow as intended
2. **Consistency** — Results don't vary wildly across runs
3. **Completeness** — All steps produce expected artifacts
4. **Clarity** — Instructions aren't ambiguous (low variance = clear instructions)

## Testing Approaches

### 1. Smoke Test (Manual)

The simplest test: use the skill on a real task and check if it works.

```
Test checklist:
- [ ] Skill triggers on expected input (check description)
- [ ] All workflow steps execute in order
- [ ] Expected output files/artifacts are created
- [ ] Reference files load when needed
- [ ] Scripts execute without errors
- [ ] No steps are skipped or repeated
```

**When to use:** After every edit to SKILL.md or reference files.

### 2. Scenario-Based Testing

Define 3-5 representative scenarios that cover the skill's capabilities:

```markdown
## Test Scenarios

### Scenario 1: Basic usage
- **Input:** "Create a skill for rotating PDFs"
- **Expected:** SKILL.md created with PDF rotation instructions, scripts/rotate.py generated
- **Verify:** SKILL.md has frontmatter, script runs without errors

### Scenario 2: Edge case — minimal input
- **Input:** "Make a skill"
- **Expected:** Skill asks clarifying questions before proceeding
- **Verify:** Does not generate files without understanding the skill purpose

### Scenario 3: Complex workflow
- **Input:** "Create a multi-phase orchestration skill for code review"
- **Expected:** agents/ directory with phase files, references/ with shared context
- **Verify:** Agent files have proper frontmatter, JSON contracts are consistent
```

**Format for scenario files:** Save as `references/test-scenarios.md` in the skill being tested.

### 3. Eval Q&A Pairs

For skills with verifiable outputs, create question-answer pairs:

```xml
<evaluation>
  <qa_pair>
    <question>Given a skill with name "pdf-editor" and description "Edit PDFs", what files should init_skill.py create?</question>
    <answer>pdf-editor/SKILL.md, pdf-editor/scripts/example.py, pdf-editor/references/example.md, pdf-editor/assets/example.txt</answer>
  </qa_pair>
  <qa_pair>
    <question>If a skill's SKILL.md is 480 lines, should detailed reference material be added inline or in a reference file?</question>
    <answer>In a reference file, because SKILL.md should stay under 500 lines</answer>
  </qa_pair>
</evaluation>
```

**Requirements for good eval pairs:**
- Single, verifiable answer
- Tests understanding of the skill's rules, not general knowledge
- Independent (each pair can be evaluated alone)
- Stable (answer doesn't change across model versions)

### 4. Variance Analysis

Run the same prompt through the skill multiple times and measure consistency:

**Process:**
1. Choose a representative prompt
2. Run it 3-5 times (in separate conversations)
3. Compare outputs across runs
4. Identify divergence points

**Scoring:**

| Variance Level | Meaning | Action |
|---------------|---------|--------|
| **Low** (outputs match 90%+) | Instructions are clear and unambiguous | No action needed |
| **Medium** (outputs match 60-90%) | Some instructions are open to interpretation | Tighten language, add examples |
| **High** (outputs match <60%) | Instructions are ambiguous or contradictory | Rewrite problematic sections |

**What to compare:**
- File structure created
- Steps followed (order and completeness)
- Key decisions made
- Output format and content

**Common causes of high variance:**
- "Consider doing X" (vague) → "Always do X when Y" (precise)
- Missing examples for expected output format
- Contradictory instructions between SKILL.md and references
- Over-reliance on Claude's judgment without guardrails

### 5. Regression Testing

After updating a skill, verify previous scenarios still work:

```markdown
## Regression Checklist
- [ ] All existing test scenarios pass
- [ ] No new variance introduced in stable scenarios
- [ ] Changelog entry added for the change
- [ ] Version bumped appropriately (see versioning.md)
```

## Testing Workflow

Integrate testing into the skill creation process:

```
Step 4 (Edit) → Smoke Test → Step 5 (Package)
                    ↓ (issues found)
               Fix → Re-test
                    ↓ (before major release)
               Scenario Tests + Variance Analysis
```

**Minimum testing before packaging:**
- 1 smoke test (manual run-through)
- 3 scenario tests (basic, edge case, complex)

**Recommended for shared/published skills:**
- All of the above, plus:
- 5+ eval Q&A pairs
- 3-run variance analysis on the most important scenario
- Regression test against previous version's scenarios

## Measuring Skill Quality

Track these metrics across iterations:

| Metric | How to Measure | Target |
|--------|---------------|--------|
| **Trigger accuracy** | Does the skill activate on the right inputs? | 95%+ |
| **Step completion** | Are all workflow steps executed? | 100% |
| **Output quality** | Does output match expectations? | Subjective, use scenarios |
| **Variance** | Consistency across multiple runs | Low (<10% divergence) |
| **Token efficiency** | How much of the context window does the skill consume? | <5k tokens for SKILL.md |

## Tips

- Test with the simplest possible input first — if basic usage fails, nothing else matters
- High variance usually means the instructions are too vague, not that the model is unreliable
- If a script fails in testing, fix the script, not the instructions that call it
- Keep test scenarios versioned alongside the skill — they're documentation too
