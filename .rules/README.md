# Empirical-First Substrate — Rule Registry

Rules that intercept Claude tool calls in this project and BLOCK execution when Claude is about to violate empirical-first principles (verify reality, run tests, read configs before per-file fixes).

## Architecture

- **Registry:** Each rule is one YAML file: `R-XXX_short-name.yaml`
- **Dispatcher:** `~/.claude/hooks/empirical-first.sh` reads the registry, intercepts `PreToolUse`, evaluates each rule's triggers against the tool call, and exits non-zero (blocking) if any rule matches.
- **State:** Per-rule cache in `~/.claude/state/empirical-first/<rule-id>.json` (e.g., "config-primitive sweep already ran for symptom X this session").
- **Logs:** All blocks logged to `~/.claude/logs/hook-blocks.log` (shared format with existing 14 PreToolUse hooks).
- **Bypass:** `EMPIRICAL_FIRST_BYPASS=1 <command>` skips ALL rules. Logged separately for audit.

## Rule YAML schema

```yaml
id: R-XXX                          # unique
name: human-readable name
severity: block | warn             # block = exit 1, warn = print + exit 0
project_filter: MyJKKN             # only fire when CWD matches (basename)
triggers:
  - tool: Edit | Write | Bash | MultiEdit | SlashCommand
    when:                          # ALL conditions must match
      file_glob: "..."             # optional, applies to Edit/Write
      input_regex: "..."           # optional, regex on tool_input.content/command
      conversation_keyword: "..."  # optional, set externally via state
    check: |                       # bash to evaluate. Exit 0 = passes (no block).
      bash command...
    fail_message: "..."            # shown to Claude when blocked
    evidence_required: |           # how Claude can satisfy the rule
      What Claude must do/show before retrying
state_keys:                        # optional cache file keys
  - sweep_done_for_<symptom>
related_memory: feedback_xxx.md    # link back to the memory entry this enforces
```

## Rule list (auto-generated, do not edit by hand)

- R-001: Config-primitives-before-per-file
- R-002: Verify-reality-before-spec
- R-003: Discovery-test-IS-verification-test
- R-004: Production-code-sweep-before-plan

## Adding a rule

1. Create `R-NNN_name.yaml` in this folder (next available NNN)
2. Test locally: `EMPIRICAL_FIRST_DEBUG=1 ~/.claude/hooks/empirical-first.sh <test-input>`
3. Run for 24h with severity `warn` to surface false positives before flipping to `block`
4. Log entry to `~/.claude/logs/hook-blocks.log` confirms the rule fires.

## Removing / disabling

- Disable temporarily: rename `R-NNN_name.yaml` → `R-NNN_name.yaml.disabled`
- Remove permanently: `rm R-NNN_name.yaml`
- Both are picked up on next tool call (no restart needed).

## Bypass log

`~/.claude/logs/empirical-first-bypass.log` records every `EMPIRICAL_FIRST_BYPASS=1` use. Audit weekly to detect overuse.
