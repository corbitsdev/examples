---
name: dispatch
argument-hint: "[<name> | dispatch/<name>/ | dispatch/<name>/dispatch.yaml | <spec-file> ]"
description: Orchestrate parallel subagent task runs. Smart input resolution - provide a name, directory, yaml file, or spec file. No argument runs the latest dispatch.
---

# Dispatch

Orchestrate parallel subagent task runs across a dependency graph. Fan out work to subagents, fan in results, validate, critique, verify, fix failures, commit, and repeat until done.

## Terminology

**Important:** Dispatch is a **skill** you load with `skill(name="dispatch")`, not a command to run.

- **"Run"** or **"the run"** = One complete instance of dispatch orchestrating tasks
- **"Loading dispatch"** = Starting the skill (not "invoking" or "executing")
- **"Running tasks"** = When subagents perform work

Avoid "execute dispatch" - use "run dispatch" or "load dispatch skill" instead.

## Input Resolution

Dispatch figures out what to run based on the argument:

**No argument** → Run latest dispatch (newest `dispatch/<name>/` directory by creation time)

**Just a name** (e.g., "auth-fix") → Look for `dispatch/<name>/dispatch.yaml`

**Directory** (e.g., `dispatch/auth-fix/`) → Look for `dispatch.yaml` inside

**File** → Check filename:
- Ends with `dispatch.yaml` → Run it
- Anything else → Treat as spec, plan first, then run

**On checkpoint decline (when planning from spec):**
- Planning artifacts remain in `dispatch/<run-name>/` for review
- Can re-run later with: `dispatch dispatch/<run-name>/dispatch.yaml`

## Phase 1: Planning

This phase runs when dispatch is loaded with a spec.md file as input. The spec should be complete and approved before dispatch is called.

**Prerequisites:**
- Spec file exists with complete requirements
- User has confirmed the spec is ready for implementation

**Input:** The spec file at the provided path

0. **Validate requirements completeness:**
   - Confirm the goal is sufficiently specified to create implementable tasks
   - Verify you have: clear objective, functional requirements, constraints, edge cases
   - **If requirements are vague, incomplete, or contradictory: STOP and return to caller**
   - Do not proceed with task breakdown until requirements are actionable and complete
   - When in doubt, ask: "Can an implementation agent succeed with only this information?"

0b. **Capture baseline build state:**
   - Before creating any tasks, run a full build to establish baseline
   - Consult project build documentation (README.md, CONTRIBUTING.md, Makefile, package.json scripts, etc.) to determine build commands
   - Full build typically includes: generate (if applicable) → lint → build → test
   - Save output to `dispatch/<run-name>/baseline-build.log`
   - This baseline will be compared in Phase 5 to detect regressions

1. Use `explore` agents to understand the codebase and scope of work
2. **Extract quality gates from loaded skills:**
   - From `style`: Per-task build verification, per-task test verification for test tasks, never work around failing builds
   - From `philosophy`: Tests as first-class verification, commits that enable debugging
   - Bugfix tasks use test-first workflow (test must fail before fix, pass after); feature tasks include tests for new behavior
   - From project-specific docs (CONVENTIONS.md, DEV.md, etc.): Project requirements
   - Create a checklist of requirements for this specific plan
3. Break the goal into discrete tasks, each small enough for a single subagent
4. Identify dependencies between tasks (DAG edges)
5. Select the right agent type for each task:
   - `explore` for research and analysis (read-only)
   - `intern` for well-defined implementation tasks (clear requirements, straightforward changes, mechanical work)
   - `general` for complex implementation requiring judgment (architectural decisions, open-ended problems, novel solutions)
6. **Classify each task as `feature` or `bugfix`:**
   - `bugfix`: the task fixes incorrect behavior — something that works wrong today
   - `feature`: everything else (new functionality, refactoring, configuration, tests for existing code)
   - This classification determines the test workflow the subagent must follow (see plan.md template)
   - When unsure, default to `feature` — test-first is only required when there is a known broken behavior to reproduce
7. Detect project verification commands from package.json, Makefile, or similar
8. **Add per-task verification to task plans:**
   - Tasks that produce compiled code (C, Rust, TypeScript, etc.): add build command to verify compilation
   - Tasks that write tests: add test command to verify the tests actually pass
   - Tasks that modify critical paths: add relevant subset of test suite
   - This catches failures early, at the task level, rather than discovering 15 broken tasks at Phase 5
9. **Choose commit strategy:**
   - Use `per-task` when debuggability is critical (enables bisection, isolates failures) - **this is the default**
   - Use `grouped` only when history cleanliness matters AND comprehensive Phase 5 verification will catch all issues
   - Grouped commits make debugging harder: if Phase 5 fails, you can't tell which of 5 bundled tasks broke it
10. **Decide which tasks need critique:**
    - Complex tasks (general agent, complicated objectives) → critique enabled
    - Medium complexity intern tasks → critique enabled
    - Simple intern tasks → critique disabled (trust self-report)
    - When unsure, consult greybeard about complexity
    - Mark in manifest with `critique.enabled: true/false` per task
11. **Verify plan against quality gates checklist** - ensure requirements from loaded skills are satisfied
12. **Present quality gate verification to user** before presenting the full plan (see template below)
    - Include which tasks will be critiqued
    - User can request additional tasks be critiqued if they see something missed
13. Create the dispatch directory structure, manifest, and task files (Phase 2)

### Agent Type Selection Guide

#### Task Agent Types

Use `intern` when:
- The task has a detailed implementation plan with specific file changes
- The approach is clear and mechanical (threading a parameter through a stack, updating all call sites, etc.)
- Success criteria are unambiguous (tests pass, lint passes)
- No architectural decisions are needed

Use `general` when:
- The task requires making technical trade-offs
- The implementation approach is not fully specified
- The task involves designing new abstractions or patterns
- The scope may need adjustment based on what's discovered

Use `explore` when:
- The task is pure research (finding patterns, understanding structure)
- No code changes are required
- The output is findings for downstream tasks to consume

#### Critique Agent Types

Use `critique` (default):
- Specialized code review focused on correctness, completeness, and adherence to requirements
- Verifies objectives are met, checks constraints, and identifies issues without fixing them
- This is the recommended agent type for all critique operations

### Quality Gates Verification Template

Before presenting any dispatch plan to the user, verify it against the loaded skills and present this checklist:

```markdown
## Quality Gate Verification

From `style` skill:
[ ] All code-producing tasks have build verification
[ ] All test-writing tasks verify tests pass
[ ] No workarounds for failing builds

Test workflow:
[ ] All bugfix tasks use test-first workflow (test fails before fix, passes after)
[ ] All feature tasks include tests that verify the new behavior

From `philosophy` skill:
[ ] Tests treated as first-class verification
[ ] Commit strategy enables debugging

From AGENTS.md:
[ ] If Phase 5 fails, can isolate which task caused it
[ ] Plan doesn't require debugging multiple tasks simultaneously
[ ] Fixes happen at the right layer (not symptom-chasing)

From project-specific docs:
[ ] [Project-specific requirements if any]

Status:
✅ [Requirement met]: [evidence from plan]
✅ [Requirement met]: [evidence from plan]
❌ [Gap found]: [how you addressed it]

Commit strategy rationale:
[Explain why per-task vs grouped, referencing debuggability vs history cleanliness]
```

Present this verification to the user BEFORE presenting the full dispatch plan. This ensures quality requirements are addressed proactively, not discovered during the run.

**Why this matters:**

Late failure detection is expensive. If 15 tasks complete and Phase 5 verification fails, you must debug all 15 tasks to find the culprit. Grouped commits hide boundaries, making bisection impossible.

Early failure detection is cheap. If task 3a writes tests and immediately runs them, you know task 3a is broken and fix it in isolation.

The quality gates prevent the expensive scenario.

**After Phase 2 completes:** Proceed to the Presentation Checkpoint (see Checkpoint section below)

## Phase 2: Directory Structure

Create the following structure:

```
dispatch/
  <run-name>/
    dispatch.yaml
    1a-extract_auth_module/
      plan.md
    1b-extract_logging_module/
      plan.md
    2a-integrate_modules/
      plan.md
    2b-update_shared_middleware/
      plan.md
    3a-cleanup_legacy_imports/
      plan.md
```

The `<run-name>` should be a short kebab-case description of the goal (e.g., `migrate-api-routes`, `extract-shared-modules`). The `dispatch/` directory should be added to `.gitignore` to keep orchestration artifacts out of the project's commit history.

### Task directory naming

Task directories are named so a human scanning the directory can immediately understand run order and purpose. The format is:

```
<level><sequence>-<short_description>
```

- **Level number** (1, 2, 3...): Derived from the DAG depth. Tasks with no dependencies are level 1. Tasks whose dependencies are all in level 1 are level 2. The level is the longest path from any root to that task, plus one.
- **Sequence letter** (a, b, c...): Distinguishes tasks within the same level. Tasks at the same level can run in parallel.
- **Separator**: A single hyphen between the prefix and the description.
- **Description**: Short, underscore-separated, human-readable. Derived from the task objective. Underscores (not hyphens) are used so that the single hyphen between the prefix and description is visually unambiguous.

This naming means:
- `1a` and `1b` are obviously parallel (same level)
- `2a` obviously comes after level 1
- The description tells you what each task does without opening the file

The directory name is also the task's `id` in `dispatch.yaml`.

Each task directory is the subagent's scratchpad. It reads its plan from there, does its work, and writes its results there. After running, a task directory looks like:

```
1a-extract_auth_module/
  plan.md              # input: instructions for the subagent
  output.yaml          # output: structured results (source of truth)
  ...                  # scratch: any other files the subagent creates
```

Gate critique verdicts are written at the run level, not the task level:

```
dispatch/<run-name>/
  dispatch.yaml
  baseline-build.log                # full build at dispatch start (compared in Phase 5)
  level1-gate-critique.yaml         # gate verdict for level 1 planned tasks
  level2-gate-critique.yaml         # gate verdict for level 2 planned tasks
  level1-amend-round1-gate-critique.yaml  # gate for first amendment round at level 1
  level1-amend-round2-gate-critique.yaml  # gate for second round (if round 1 amendments still have issues)
  level1-amend-round1-percommit-<sha>.log  # per-commit fast-gate output (Step 3b validation)
  final-build.log                   # Phase 5 final build output
  failure-attribution.md            # Phase 5 mapping of failures to commits
  1a-extract_auth_module/
    plan.md
    output.yaml
    ...
```

An "amendment round" for a level is one pass through the critique-fix-amend loop. Round 1 is the first re-critique after amendments; round 2 is the re-critique after round 1 amendments still had issues; and so on. The round number equals 1 plus the count of existing `level<N>-amend-round*-gate-critique.yaml` files in the dispatch run directory for that level. On resume, stale or malformed gate files from a previously aborted run may inflate the counter by one, causing a gap in the sequence. This is cosmetically imperfect but has no behavioral consequence — gate file names are informational artifacts only and are not used by the execution engine for logic.

### Manifest format

The central manifest is `dispatch.yaml`:

```yaml
goal: "Short description of the overall goal"
status: pending              # see "Run status transitions" below
max-parallel: 5              # default 5; total concurrent subagents including critique agents
created: YYYY-MM-DD          # informational; not used by the execution engine

verify:
  workdir: ""                # working directory for commands; empty or omitted = repo root
  build: "bun run build"     # omit if not applicable
  test: "bun test"           # omit if not applicable
  lint: "bun run lint"       # omit if not applicable
  custom:                    # list of {name, command} objects
    - name: integration-tests
      command: "bun test:integration"

validation:                  # fast gate used by Step 3b per-commit validation and Phase 5 rebase --exec
  fast-gate: "bun run typecheck && bun run lint"
  # Contract: the fast-gate command MUST fail when a commit references a
  # symbol, import, or type defined only in a later commit. That is the
  # bug Phase 5 exists to catch; anything that doesn't catch it is not a
  # gate. The command MUST be a strict subset of the `verify` pipeline
  # above. Stubs (`true`, `echo ok`, no-op wrappers) are forbidden —
  # they silently disable the safety net.
  #
  # If the project genuinely has no faster subset than the full gate,
  # declare it explicitly:
  #   no-fast-gate: true
  #   reason: "Project has no separate type-check step; full gate is the minimum."
  # The full `verify` pipeline is then used at every per-commit
  # validation point, and the cost is accepted honestly.

critique:
  enabled: true              # global default; tasks can override
  agent: critique            # defaults to critique; must be an agent that can write gate-critique.yaml

commits:
  strategy: per-task         # per-task | single | grouped
  approval: ask-once         # ask-once | ask-each | auto
  message-source: objective  # objective (from plan.md) | notes (from output.yaml)

level-boundaries: {}           # populated by Step 3a+; maps level number to the commit SHA immediately before that level's first commit (e.g., {1: "abc123", 2: "def456"}). Used by rebuild logic to know where to `git reset` without walking git log.

backup-branch: ""              # populated at Phase 4 entry: backup-<branch>-pre-dispatch. Primary recovery path for Phase 5 mid-rebase crashes. Deleted on successful Phase 7 completion.

fix-loop:                      # populated by Phase 5 fix loop; cleared on successful exit
  in-progress: false           # true while a Phase 5 rebase-edit iteration is mid-flight
  iteration: 0                 # rounds since this Phase 5 invocation began
  rebase-base: ""              # parent SHA of the earliest affected commit; the rebase replays everything after this
  affected-commits: []         # original SHAs of commits being amended this iteration, topologically ordered

results:                       # populated by Phase 6; empty until then
  commits: []                  # list of {sha, message, files, tasks} objects

unexpected-modifications: ask  # ask | accept

deviation-handling:
  threshold: moderate         # escalate at this severity and above (minor | moderate | major)
  auto-fix: true              # Karen can handle deviations below threshold autonomously
  escalate-to: user           # user | greybeard (who to consult for threshold+ deviations)

tasks:
  - id: 1a-extract_auth_module
    type: feature            # feature | bugfix
    agent: general           # general | intern | explore
    depends-on: []           # task IDs that must complete first
    receives: []             # task IDs whose output to inject (defaults to depends-on)
    status: pending          # pending | dispatched | committed | completed | failed | fixing
    commit-sha: ""           # populated by Step 3a+ after task's work is committed
    fixing-source: ""        # critique | verification; set when status transitions to fixing
    critique:                # optional per-task override
      enabled: true
      agent: critique        # defaults to critique
      prompt: |
        Custom critique instructions for this task.
      validate-fix:          # optional: enable mutation testing validation; uses the task's commit-sha from Step 3a+
        enabled: false       # opt-in; must be explicitly enabled
        test-command: ""     # command to run test(s) for validation
    commit-group: ""         # optional; used with 'grouped' commit strategy

  - id: 2a-integrate_modules
    type: feature
    agent: general
    depends-on: [1a-extract_auth_module, 1b-extract_logging_module]
    receives: [1a-extract_auth_module]  # only needs auth output; depends on logging for ordering only
    status: pending
```

### Run status transitions

| Status | When |
|---|---|
| `pending` | Manifest created, plan not yet validated or approved |
| `in-progress` | Execution has started (entering Phase 4) |
| `completed` | All tasks completed, verification passed, commits done |
| `failed` | Orchestrator cannot continue: unresolvable deadlock, user chose to abort, or all remaining tasks have failed with no fix path |

### Repository root

The repository root is the nearest ancestor directory containing `.git`. The orchestrator determines this once during initialization and uses it for:
- Telling subagents where they are working
- Running verification commands
- Resolving relative paths in `files-modified`

### Task fields

| Field | Required | Description |
|---|---|---|
| `id` | yes | Directory name. Format: `<level><sequence>-<description>`. |
| `type` | yes (except `explore` agents) | Task classification: `feature` or `bugfix`. Determines the test workflow the subagent follows. Omit for `explore` tasks (they do not produce code or tests). |
| `agent` | yes | Subagent type: `general`, `intern`, or `explore` |
| `depends-on` | yes | Task IDs that must reach `completed` before this task starts (empty list if none). |
| `receives` | no | Task IDs whose `output.yaml` to inject as context. Defaults to `depends-on`. Must be a subset of `depends-on`. Use to narrow injection when a task depends on many upstream tasks but only needs context from some. |
| `status` | yes | Current run status |
| `commit-sha` | no | Git commit SHA for this task's changes. Written by the orchestrator during the level fan-in commit step (Step 3a+). Empty until committed. |
| `fixing-source` | no | Set when status transitions to `fixing`. Either `critique` (Step 3b amendment loop) or `verification` (Phase 5 fix loop). Used by the resume logic to know which fix mechanism to re-enter. Empty when status is not `fixing`. |
| `critique` | no | Per-task critique config; overrides the global `critique` setting |
| `commit-group` | no | Group name for the `grouped` commit strategy. |

### Task status values

| Status | Meaning |
|---|---|
| `pending` | Not yet ready to dispatch (dependencies incomplete) |
| `dispatched` | Currently being run by a subagent |
| `committed` | Task ran, self-report passed, and changes have been committed to git (Step 3a+). Awaiting critique (if enabled). Transitions to `completed` after critique passes, or to `fixing` if critique finds blocking issues. Tasks without critique enabled skip straight to `completed`. |
| `completed` | Finished successfully (committed, and critique passed if enabled) |
| `failed` | Failed after dispatch (`output.yaml` reports failure or is missing) |
| `fixing` | The task's committed changes need correction — either critique found blocking issues (Step 3b amendment loop) or Phase 5 verification detected a regression. When setting this status, also set `fixing-source` to `critique` or `verification` so the resume logic knows which mechanism to re-enter. Regular downstream tasks must wait for `completed`. Transitions to `completed` when the fix-and-rebuild cycle passes. |

### Task file format

Each task's `plan.md`. The YAML frontmatter duplicates fields from `dispatch.yaml` for human readability. If they diverge, `dispatch.yaml` is authoritative -- the execution engine never reads `plan.md` frontmatter:

```markdown
---
id: 1a-extract_auth_module
type: feature
depends-on: []
agent: general
---

## Objective

What the subagent should accomplish.

## Requirements Covered

Link to specific requirements this task implements (from spec file or user request):
- Requirement 1: Brief description
- Requirement 2: Brief description

This ensures traceability and verifies all requirements are addressed by the plan.

## Context

Relevant codebase context, file locations, patterns to follow. Refer to
code by file path and symbol name only — no line numbers, no references
to other tasks or dispatch artifacts (see the "Reference discipline"
constraint below for the full rule).

## Files to Modify

- `path/to/file.ts` - what to change

## Constraints

- **Do NOT run any mutating git operations.** No `git add`, `git commit`,
  `git checkout`, `git stash`, or anything that changes repository state.
  The orchestrator handles all git operations after your task completes.
  Multiple tasks run in parallel in the same worktree — git mutations from
  any task will corrupt the tree for all of them.
- **Reference discipline.** Anything you produce — commit messages, code
  comments, documentation, `output.yaml` notes — will be read by people
  and agents who never see this plan or the dispatch directory it lives
  in. Use stable handles only: file paths (no line numbers), symbol
  names (function, class, type, constant), module or package names. The
  following MUST NOT appear in any artifact you produce, even if they
  appear in this plan:
    - Line numbers (`foo.ts:42`) — they shift on the next edit.
    - Cross-references to other tasks in this dispatch (`see task 2a`,
      `as in 1b-extract_auth`) — no reader outside this dispatch can
      resolve them.
    - Paths into the dispatch directory (`dispatch/<run>/...`,
      `plan.md`, `proposal.md`) — no reader outside this dispatch can
      resolve them either.
    - Issue, ticket, or PR identifiers carried in from the plan.
- Rules the subagent must follow
- Files it must NOT touch
- Patterns it must adhere to

## Verification

How you will demonstrate this task is complete and correct.

### Test Workflow

The order of implementation and testing depends on the task type (from the
`type` field in the frontmatter). Follow the repository's existing test
conventions — look at how existing tests are structured, where they live,
what framework they use, and match that style. If the repository has no
existing tests, report failure and ask the orchestrator what test framework
and conventions to use.

**For `bugfix` tasks (test-first):**
1. Write a test that reproduces the bug.
2. Run the test and verify it **fails**. Capture output to `pre-fix-test.log`.
   If the test passes, you do not understand the bug well enough to fix it.
   Refine the test until it demonstrates the broken behavior. If after two
   attempts the test still passes, report failure — do not proceed with a fix
   you cannot prove is necessary.
3. Implement the fix.
4. Run the test again and verify it **passes**. Capture output to
   `verification.log`.

The `pre-fix-test.log` is mandatory evidence. It proves the test actually
catches the bug rather than vacuously passing regardless of the fix.

**For `feature` tasks that introduce new behavior:**
1. Implement the feature.
2. Write a test that exercises the new functionality and asserts on the
   expected behavior. The test should verify that the code works as designed,
   not just that it does not crash.
3. Run the test and verify it **passes**. Capture output to
   `verification.log`.

**For `feature` tasks that do not introduce new behavior** (refactors, config
changes, test-only tasks, documentation): the test workflow above does not
apply — there is no new behavior to write tests for. Use the appropriate
verification level below instead. Refactors in particular must run the
existing test suite after the change to prove nothing broke.

### Verification Level

**Level:** [automated | manual | review]

**Automated:** (for functional changes with testable outcomes)
- Commands: List commands you will run (refer to project build docs for correct commands)
- Expected: What success looks like (e.g., "all tests pass", "builds without errors")
- Evidence: Full command output will be captured to `verification.log`

**Manual:** (for changes requiring demonstration)
- Steps: How you will verify it works (describe the manual process)
- Evidence: Command output, logs, or observations captured to `manual-evidence.log`
- Why manual: Explain why automated verification isn't applicable

**Review:** (for structural changes - refactors, moves, renames)
- Compile check: Command to verify no syntax errors (from project build docs)
- Lint check: Project lint command (from project build docs)
- Unit tests: Run tests for modified files if they exist (from project build docs)
- Evidence: Output captured to `verification.log`
- Notes: What changed and why review level was chosen

**Evidence Requirements:**

Before marking this task complete, you MUST:
1. Follow the test workflow for your task type (above)
2. Execute the verification steps defined above
3. Capture full output to evidence files in your task directory
4. Write summary to output.yaml with references to evidence files

Do NOT claim completion without running verification and capturing evidence.

## Deviation Reporting

**CRITICAL:** You MUST report ANY deviation from this plan, even minor ones.

**Deviations to report:**
- Modified files NOT listed in "Files to Modify"
- Changed implementation approach from what was described
- Scope changes (did more or less than planned)
- Broke constraints (touched forbidden files, violated patterns)
- Changed verification approach
- Any other way you deviated from the plan

**How to report:**
Add `deviations` field to output.yaml:

```yaml
deviations:
  - type: files_not_in_plan | approach_changed | scope_changed | constraint_violation | verification_changed
    description: "Exactly what deviated from the plan and why"
    severity: minor | moderate | major
    justification: "Why the deviation was necessary or beneficial"
```

**Severity levels:**
- **minor:** Cosmetic changes, logging improvements, documentation fixes, typo corrections
- **moderate:** Different file than planned, slightly different approach, minor scope change
- **major:** Architecture change, violated constraints, significant scope change

**If NO deviations:** Include `deviations: []` to confirm you followed the plan exactly.

**Consequence:** If unreported deviations are detected during Step 3a, your task will be marked FAILED for contract violation.

## Upstream Context

(This section is empty in the plan file on disk. At dispatch time, the
orchestrator injects upstream output.yaml content into the subagent's prompt
directly -- plan.md is not modified.)

## Subagent Responsibility: Read and Understand the Plan

**Before starting work, you MUST:**

1. **Read your plan.md file** from your task directory (the orchestrator will tell you the path)
2. **Confirm you understand:**
   - The objective and what success looks like
   - All requirements covered by this task
   - Which files to modify and what changes to make
   - All constraints (what NOT to do)
   - How to verify the task is complete
3. **If the plan is unclear, contradictory, or missing critical information:**
   - STOP immediately
   - Do NOT attempt to guess or proceed with partial understanding
   - Report failure in output.yaml with a clear description of what is unclear or missing

**Why this matters:** The orchestrator provides a summary in the dispatch prompt, but the plan.md file is the authoritative source of truth. The summary may not include all constraints, edge cases, or detailed requirements. Relying solely on the summary can lead to incorrect implementations and wasted effort.

## Output Contract

Before finishing, you MUST write `output.yaml` to your task directory.
The orchestrator will tell you the repository root and your task directory
path when dispatching you.

Required fields:

- `status`: completed | failed
- `files-modified`: list of files you changed (paths relative to repo root)
- `verification-summary`:
  - `level`: automated | manual | review
  - `evidence-files`: list of evidence files in task directory (e.g., [`verification.log`, `test-results.json`]; bugfix tasks must include `pre-fix-test.log`)
  - `result`: brief summary (e.g., "all 42 tests passed", "server responded with 200")
- `deviations`: list of deviations from plan (empty list `[]` if none)
  - `type`: files_not_in_plan | approach_changed | scope_changed | constraint_violation | verification_changed
  - `description`: what deviated from the plan
  - `severity`: minor | moderate | major
  - `justification`: why the deviation was necessary
- `exports`: structured data downstream tasks may need (object, can be empty)
- `notes`: free-text context for the orchestrator and downstream tasks
- `error`: if status is failed, describe what went wrong; omit or leave empty when status is completed

Example:

    status: completed
    files-modified:
      - src/routes/users/list.ts
      - src/routes/users/create.ts
    verification-summary:
      level: automated
      evidence-files:
        - verification.log
        - test-results.json
      result: "all tests passed (15/15), build successful"
    deviations:
      - type: files_not_in_plan
        description: "Also modified src/utils/validation.ts to add shared validation helper"
        severity: minor
        justification: "Both routes needed the same email validation logic, extracted to avoid duplication"
    exports:
      handler-pattern: defineHandler
      breaking-changes: false
    notes: |
      Migrated both routes. The create route had a custom error
      handler that was refactored into the middleware chain.
      See verification.log for full test output.

This file is the source of truth for task completion. If it does not exist
when you finish, the orchestrator will treat your task as failed.

(For explore agents: the orchestrator writes output.yaml on your behalf.
Return your findings in the Task tool return message instead.

**Explore agent deviation reporting:**
If you examined files not listed in the plan, include in your return:
```
deviations:
  - type: files_examined_not_in_plan
    description: "Examined src/utils/helpers.ts for context"
    severity: minor
    justification: "Found reference to helper functions that affect the routing logic"
```
Or `deviations: []` if you only examined planned files.)
```

### Mandatory boilerplate sections

The following sections from the template above are **protocol sections** — they do not vary per task. You MUST copy them verbatim into every `plan.md` you create. Do not paraphrase, abbreviate, or omit them:

- **Constraints → Do NOT run any mutating git operations** (the full bullet)
- **Constraints → Reference discipline** (the full bullet, including the sub-bullets enumerating what may not appear in artifacts)
- **Deviation Reporting** (the full section including the yaml block, severity levels, and consequence warning)
- **Subagent Responsibility: Read and Understand the Plan** (the full section)
- **Output Contract** (the full section including the example yaml)

These sections define the communication protocol between subagents and the orchestrator. If they are missing or altered, subagents will produce output that violates the contract (e.g., writing `status: success` instead of `status: completed`), causing silent failures or incorrect orchestration behavior.

## Phase 2.5: Plan Critique

After creating the dispatch.yaml and all plan.md files, run a quality critique on the plan itself before presenting to the user. This catches planning gaps, missing requirements, and structural issues before tasks start.

**When to run:** Only on initial dispatch creation (not when resuming). Runs after Phase 2 completes and before Phase 3 validation.

**Process:**

1. **Spawn critique agent** with:
   - The dispatch.yaml manifest
   - All task plan.md files
   - The original spec file (if planning from spec)

2. **Critique scope:**
   - **Manifest level:** All spec requirements covered? DAG valid? Agent types appropriate? Dependencies correct?
   - **Task level:** Objectives clear? Files identified? Constraints realistic? Verification appropriate?
   - **Cross-task level:** No conflicting constraints? Shared resources properly sequenced?

3. **Critique output:** Writes `plan-critique.yaml` to the dispatch directory:

```yaml
verdict: accepted | needs-work
iteration: 1
timestamp: YYYY-MM-DDTHH:MM:SS
issues:
  - severity: blocking | warning | nit
    type: spec | plan  # NEW: distinguishes source of issue
    component: dispatch.yaml | 1a-task_name | specs/...
    description: "Specific issue found"
    suggestion: "How to fix it"
notes: "Overall assessment"
```

### Spec Issues vs Plan Issues

Critique must distinguish between:
- **Spec issues:** Requirements missing, conflicting goals, unclear scope, incomplete constraints
- **Plan issues:** Task breakdown problems, dependency errors, verification gaps

**Spec issue identification:**
When critique finds a spec issue, it tags it in plan-critique.yaml with `type: spec`.

### Spec Issue Resolution Workflow

When spec issues are found (any `type: spec` issues with severity blocking or warning):

1. **Pause planning** - Do not continue with plan fixes until spec is resolved
2. **Present to user:** "Critique found N spec issues that need resolution before planning can continue"
3. **User updates spec** - User edits `specs/<name>-spec.md` directly to address the issues
4. **Reset iteration counter** - Fresh start after spec fix
5. **Restart Phase 1** - Re-plan from updated spec

**Note:** Spec issues take precedence over plan issues. Fix spec first, then plan.

**Iteration policy (same thresholds as critique amendment escalation):**

- **Iterations 1-2:** Calling agent fixes issues (in-place edits to yaml/plan files), re-runs critique
- **Iteration 3:** Warn that plan is proving difficult to validate
- **Iteration 4+:** Ask user via question tool:
  - "Proceed anyway (accept plan with known issues)"
  - "Consult greybeard for architectural guidance"
  - "Abort dispatch and start over"
  - "Manual review needed"

**Spec Issue Exception:**
When spec issues are found and the user updates the spec:
- Reset iteration counter to 0
- Restart Phase 1 with updated spec
- This ensures clean planning from corrected requirements
- Spec fixes take precedence over iteration limits

**Escalation to greybeard:**

If calling agent cannot resolve critique issues, consult greybeard for architectural guidance on how to fix. This is a Task tool consultation, not automatic.

**Blocking behavior:**

- Plan critique is **mandatory** - no bypass option
- Must pass (verdict: accepted) before proceeding to Phase 3
- If critique agent crashes or produces invalid output: Block and ask user for decision

**Artifact persistence:**

Keep `plan-critique.yaml` as dispatch history for audit trail. Do not delete after successful validation.

## Phase 3: Plan Validation

Before running any tasks, validate the plan for correctness and completeness. Do not blindly trust that a plan is ready to run.

### Empty manifest

If the manifest contains zero tasks, the run transitions directly to `completed` after validation. No running, verification, or commit phases are needed. Report this to the user.

### Structural integrity

- The DAG is acyclic (no circular dependencies)
- All `depends-on` and `receives` references point to task IDs that exist in the manifest
- All `receives` entries are a subset of the task's `depends-on`
- Every task in the manifest has a corresponding directory with a `plan.md` file
- No orphaned task directories (directories without a manifest entry)
- Task directory names follow the naming convention

### Completeness

- Each task's `plan.md` has a clear, specific objective (not vague or underspecified)
- Tasks that modify files specify which files they will touch
- The union of all tasks' work plausibly covers the stated goal -- look for obvious gaps
- **Requirements coverage**: Every requirement from the spec (or user request) is addressed by at least one task
  - Check the "Requirements Covered" section in each task's `plan.md`
  - Verify no requirements are orphaned (no task covers them)
  - Verify no tasks are orphaned (don't cover any requirement)
- Verification commands in the manifest actually exist in the project

### Coherence

- No two tasks at the same level plan to modify the same file. If they do, they must be either merged into one task or serialized via `depends-on`. Merge when the work is closely related and shares context; serialize when the tasks have different concerns that happen to touch the same file and each needs its own context to function correctly.
- Tasks that `receive` upstream context actually need it -- the upstream task's described output is relevant to the downstream task's objective
- The DAG ordering makes sense -- tasks do not depend on unrelated tasks purely for serialization
- Constraints across tasks do not contradict each other

### Parallelization Constraints

**Tasks that share mutable state cannot run in parallel.** When tasks operate within the same worktree/repository and affect shared resources, they MUST be serialized via `depends-on` edges, even if they don't directly depend on each other's outputs. Common examples:

- **Mutating git operations**: Subagents must not run any mutating git operations (`git commit`, `git add`, `git checkout`, `git stash`, etc.). All git mutations are handled by the orchestrator at the level fan-in (Step 3a+). Read-only operations (`git status`, `git log`, `git diff`) are safe.
- **Build systems**: Tasks running `make`, `npm run build`, or similar must be serialized if they write to shared build artifacts, caches, or output directories.
- **File writes**: Tasks at the same level writing to the same file must be merged or serialized (caught as a blocking issue in the Coherence check). Tasks at different levels are already serialized by the DAG and do not conflict.
- **Test databases**: Tasks that reset or mutate shared test databases must be serialized.

**The rule**: If two tasks would interfere with each other when run simultaneously in the same repository, add a `depends-on` edge to enforce ordering. Do not rely on timing or assume "it will probably be fine."

### Feasibility

- Referenced files actually exist in the codebase, or are explicitly created by this task, or are explicitly created by an upstream dependency (as stated in that task's plan)
- The agent type assigned to each task is appropriate -- `explore` agents cannot write files, so implementation tasks must not use them
- The scope of each task is reasonable for a single subagent

### Validation block

The `validation.fast-gate` (or `validation.no-fast-gate: true` + `validation.reason`) must be declared. Validation:

- Exactly one of `fast-gate` or `no-fast-gate: true` is set.
- If `fast-gate` is set, the command must not be a stub. Reject as blocking: `true`, `:`, `echo` with no side effect, anything wrapping these. The check is best-effort string match — a contrived bypass is the caller's problem, but the obvious cases must fail validation.
- If `no-fast-gate: true` is set, `reason` must be a non-empty string. This forces the caller to justify accepting the per-commit cost of the full gate.
- The `fast-gate` command (when set) must reference commands that exist in `verify` or in the project's documented build scripts. The fast gate is a subset of the full gate, not an unrelated command.

This block gates Phase 5: if validation is missing or malformed when Phase 5 would fire, the run halts with a clear error. Do not silently substitute a default.

### Validation outcome

| Outcome | Action |
|---|---|
| **Valid** | Proceed to running tasks. Report validation results to user. |
| **Warnings** | Present warnings (e.g., "tasks A and B depend on each other's outputs but the dependency edge is missing"). Ask whether to proceed or adjust. |
| **Blocking issues** | Present issues (e.g., "circular dependency between X and Y", "task Z references non-existent file", "tasks A and B are at the same level and both modify `config.ts`"). Do not proceed until resolved. |

For same-file same-level conflicts, merge the tasks if they share context and concerns; add a `depends-on` edge to serialize them if they are independent work that happens to touch the same file. Fix the plan and propose the resolution to the user. For ambiguous issues, ask.

On resume, re-validate the remaining (non-completed) portion of the DAG before continuing.

## Checkpoint: Validation, Presentation, and Confirmation

This is the convergence point for both input types (existing dispatch.yaml or new spec.md). All flows pass through here before tasks start.

**Prerequisites:**
- Phase 2.5 (Plan Critique) completed with verdict `accepted`
- No unresolved `type: spec` issues (spec must be solid before planning)
- Plan reflects current spec state

For new dispatches created from spec, this ensures both the spec and plan have been reviewed for completeness and correctness.

### Step 1: Validate

Run Phase 3 validation on the dispatch:

- **Structural integrity**: DAG acyclicity, valid task references, required fields present
- **Completeness**: All tasks have clear objectives, files specified, requirements covered
- **Coherence**: No conflicting constraints, parallelization constraints respected
- **Feasibility**: Referenced files exist or will be created, appropriate agent types

**Validation outcomes:**
- **Valid**: Proceed to presentation
- **Warnings**: Present warnings, ask whether to proceed or adjust
- **Blocking issues**: Present issues, do not proceed until resolved

### Step 2: Present

Display the current state to the user before requesting confirmation.

**For Existing Dispatch (dispatch.yaml input):**
```
Dispatch: <run-name>
Status: <pending|in-progress>

Task Summary:
- Completed: X tasks
- Pending: Y tasks
- Failed: Z tasks
- In Progress: W tasks

Pending/Failed Tasks:
- 2a-<task>: Status: pending, Depends on: [1a, 1b]
- 3b-<task>: Status: failed, Error: <brief-error>

Ready to Resume: <true/false> (based on ready set availability)
```

**For New Dispatch (spec.md input):**
```
New Dispatch: <run-name>
Goal: <goal-description>
Spec: specs/<run-name>-spec.md

Quality Gate Verification:
✅ All code-producing tasks have build verification
✅ All test-writing tasks verify tests pass
✅ Commit strategy enables debugging (per-task)

Task DAG (X tasks total):
Level 1 (can run in parallel):
- 1a-<task>: <agent-type> - <description>
- 1b-<task>: <agent-type> - <description>

Level 2:
- 2a-<task>: depends on [1a] - <description>
- 2b-<task>: depends on [1b] - <description>

Level 3:
- 3a-<task>: depends on [2a, 2b] - <description>

Verification Commands:
- Build: <command>
- Test: <command>
- Lint: <command>

Critique Enabled: <yes/no> (X of Y tasks)
Commit Strategy: <per-task|grouped|single>

Dispatch files created at: dispatch/<run-name>/
```

### Step 3: Confirm

Use the question tool to ask the user whether to proceed. The question should offer "Proceed" and "Abort" as options.

**If user selects "Proceed":**
- Update `dispatch.yaml` status to `in-progress`
- Proceed to Phase 4 (Execution Engine)
- Execution proceeds linearly without returning to planning

**If user selects "Abort":**
- Exit cleanly without starting the run
- Dispatch files remain intact for manual review
- User can edit files directly, then re-run with: `dispatch dispatch/<run-name>/dispatch.yaml`

**If user wants modifications:**
The skill does NOT modify the plan interactively. The user must:
1. Edit the relevant files (`dispatch.yaml`, `plan.md` files)
2. Re-run with: `dispatch dispatch/<run-name>/dispatch.yaml`

This maintains the non-reentrant property - once a plan is confirmed and the run begins, it proceeds to completion.

### Why This Checkpoint Matters

1. **Visibility**: User sees exactly what will run before it starts
2. **Control**: User can abort or modify before any changes are made to the codebase
3. **Safety**: No accidental running of incomplete or incorrect plans
4. **Debugging**: User can review the plan offline before committing to the run

## Phase 4: Execution Engine

Update `dispatch.yaml` status to `in-progress` when entering this phase for the first time.

Before dispatching any tasks, verify the git working tree is clean (no uncommitted changes outside the `dispatch/` directory). If there are uncommitted changes, warn the user and ask how to proceed -- Step 3a+ commits could otherwise include unrelated modifications.

**Create the pre-dispatch backup branch.** Before any commits or history surgery:

1. `current_branch=$(git rev-parse --abbrev-ref HEAD)`
2. `git branch backup-${current_branch}-pre-dispatch`
3. Write the branch name to `dispatch.yaml` under `backup-branch`.

This is the primary recovery path if Phase 5's rebase-edit machinery becomes wedged. Reflog entries expire (default 90 days reachable, 30 unreachable); a branch ref does not. The backup is deleted in Phase 7 only after the run completes successfully.

**On resume:** if `backup-branch` is already populated in `dispatch.yaml`, do NOT recreate it — recreating against current HEAD would overwrite the original pre-dispatch snapshot with partially-rewritten history. Verify the existing backup branch still exists in `git branch --list`; if it has been deleted externally, abort the resume and report the issue.

### Step 1: Resolve ready set

Read `dispatch.yaml`. Find all tasks where:

- Status is `pending`
- All tasks in `depends-on` are satisfied

A dependency is satisfied when its status is `completed`. Tasks in `fixing` status do not satisfy dependencies — downstream tasks must wait until the fix-and-rebuild cycle completes and the task transitions back to `completed`.

These are the "ready set."

If the ready set is empty and non-completed tasks remain, there is a deadlock (circular dependency) or all remaining tasks depend on failed tasks. Report this to the user and ask how to proceed.

### Step 2: Batch and fan out

Take up to `max-parallel` tasks from the ready set, accounting for any currently dispatched tasks or running critique agents (total concurrent subagents must not exceed `max-parallel`).

**Critical**: Ensure all tasks in the batch can safely run in parallel. Tasks that share mutable state (git operations, build commands, writing the same files) must not be in the same batch - they should have been serialized via `depends-on` edges during planning (see "Parallelization Constraints" in Phase 3).

For each task:

1. Read the task's `plan.md`
2. If `receives` (or `depends-on` when `receives` is omitted) references upstream tasks, read their `output.yaml` files and inject the content into the subagent's prompt as upstream context. Do not mutate `plan.md` on disk -- the upstream context is only included in the prompt sent to the subagent.
3. Tell the subagent the repository root path and the relative path to its task directory. Example: "Repository root: /home/user/project. Your task directory: dispatch/migrate-routes/1a-extract_auth_module/. Write output.yaml to your task directory."
4. **Explicitly instruct the subagent to read its plan.md file.** Include text in the prompt such as: "You MUST read your complete plan.md file from your task directory before proceeding. The summary provided here is for context only. If any part of the plan is unclear, contradictory, or you cannot understand what is being asked, STOP and report failure."
5. **Explicitly prohibit git mutations.** Include text in the prompt such as: "Do NOT run git add, git commit, git checkout, git stash, or any command that mutates git state. Leave your changes uncommitted. The orchestrator commits after all tasks in your level complete."
6. Update the task's status to `dispatched` in `dispatch.yaml`
7. Dispatch via the Task tool using the `agent` type from the manifest

For `explore` agents (read-only): the orchestrator reads the Task tool return message as the task's output and writes `output.yaml` on the agent's behalf, since explore agents cannot write files.

**What the orchestrator writes for explore agents:**
- `status`: completed | failed
- `files-modified`: [] (explore agents are read-only)
- `notes`: Task tool return message
- `exports`: any structured data extracted from the return (empty object if none)
- `deviations`: extracted from the return message if present (empty list if none)

**Extracting deviations:**
- Parse the return message for a `deviations:` section
- If found: extract and include in output.yaml
- If not found: write `deviations: []`

If the explore agent's return indicates failure, set `status: failed` and populate `error`.

Dispatch all tasks in the batch as parallel Task tool calls in a single message.

### Step 3: Fan in

Collect results from all dispatched tasks:

1. **Check `output.yaml`** (source of truth):
   - Exists with `status: completed`: proceed to self-report check (Step 3a)
   - Exists with `status: failed`: mark task `failed` in manifest
   - Does not exist: mark task `failed` (contract violation)

2. **Read the Task tool return message** (advisory):
   - Use for diagnostic context if the task failed
   - Sanity check against `output.yaml` -- if they conflict, log a warning and trust `output.yaml`

3. **Process deviations**:
   - Check `deviations` field exists in output.yaml (missing = task FAILED)
   - For each deviation in the list:
     * If severity >= configured threshold: escalate to user immediately
     * If severity < threshold: Karen evaluates and decides:
       - Accept deviation and continue
       - Mark task failed for re-dispatch
       - Consult greybeard if technical judgment needed
   - Karen has authority to handle minor/moderate deviations autonomously
   - Major deviations or uncertainty → escalate to user

### Step 3a: Check Task Self-Report

Tasks self-report their verification status. Check that the report is complete:

1. **Check output.yaml exists** and has required fields including `verification-summary`
2. **Check evidence files exist** in the task directory:
   - For automated: `verification.log`, potentially `test-results.json`
   - For bugfix tasks: `pre-fix-test.log` (proves the test failed before the fix)
   - For manual: `manual-evidence.log`
   - For review: `verification.log`
3. **Check evidence is not empty** - files have content, not just placeholder text

If evidence is missing or empty:
- Mark task as `failed` (the task did not fulfill its output contract)
- Do not commit or critique this task
- The orchestrator may re-dispatch it in the next iteration of Step 1 if the user chooses to retry failed tasks

If evidence exists and looks reasonable:
- **Check for unreported modifications** (unless `unexpected-modifications: accept` in manifest): compare the task's `files-modified` (from `output.yaml`) against the files listed in its `plan.md` under "Files to Modify" (best-effort extraction of backtick-quoted file paths). If files were modified outside the plan AND the deviation was NOT reported in `output.yaml`, mark the task `failed` for contract violation ("Task modified [files] without reporting deviation"). If multiple tasks modified the same file and either didn't report the deviation, both are `failed`.
- Hold the task in an internal `self-report-passed` state (in-memory only; not written to `dispatch.yaml`)
- Once all tasks in the current level have reached `self-report-passed` or `failed`, proceed to Step 3a+ (level commit)

### Step 3a+: Level Commit

Once all tasks in a level have been collected (Step 3a complete), the orchestrator commits `self-report-passed` tasks' changes. This is the fan-in point — tasks ran in parallel, but git operations are serialized here.

**Why commit before critique:** Without commits, work accumulates uncommitted across levels and fix rounds, making it hard to isolate, review, or revert individual tasks. Committing at the fan-in point gives critique a real diff to review (`git show <sha>`) and gives the orchestrator clean rollback points. This mirrors the implement skill's discipline: build gate passes, commit, critique, amend.

**Process:**

1. **Record the pre-level boundary:** Save the current HEAD SHA in `level-boundaries` under this level's number. This is the commit immediately before this level's work. Rebuild logic uses this to know where to `git reset` without walking git log.
2. Group `self-report-passed` tasks into commit units:
   - Tasks sharing the same `commit-group` value form a single commit unit
   - Tasks with no `commit-group` (or a unique value) each form their own commit unit
   - Tasks marked `failed` in Step 3a are excluded
3. Sort commit units in topological order (break ties alphabetically). For grouped units, use the earliest task in the group for ordering.
4. For each commit unit, in order:
   a. `git add` the files listed in `files-modified` from all tasks in the unit
   b. Generate a commit message based on the manifest's `message-source` setting:
      - `message-source: objective` (default): derive from the task's `plan.md` objective
      - `message-source: notes`: derive from the task's `output.yaml` notes
      - For grouped units: synthesize from the objectives/notes of all tasks in the group
      - Follow `style` skill conventions
   c. `git commit`
   d. Record the commit SHA in `commit-sha` for every task in the unit (all tasks in a group share the same SHA)
   e. Update each task's status to `committed` in `dispatch.yaml`

**Explore tasks and other zero-file commit units:** When a commit unit would contain zero files (e.g., explore tasks with empty `files-modified`), skip the commit but still update each task's status to `committed` with an empty `commit-sha`. This ensures explore tasks enter the critique gate input set in Step 3b.

**Shared file attribution:** When multiple tasks at the same level list the same file in `files-modified`, the file is attributed to the last task in topological order. Earlier tasks' commits skip that file. If a commit unit would contain zero files after attribution, skip it entirely. This same rule applies during the Step 3b amendment loop's reset-and-rebuild — attribution is re-computed from scratch using the current `files-modified` lists and the topological rule. If a fix agent added a file to task A's `files-modified` that is also listed in task B's `files-modified` (where B is later in topological order), the file goes to B's commit.

The Phase 5 rebase-edit fix loop does NOT use `files-modified` attribution for the amend itself — it amends each commit's tree in place at the rebase `edit` stop, so the file set is whatever the fix agent actually staged. Fix agents in Phase 5 should still keep `files-modified` accurate in `output.yaml` for postmortem and downstream tooling, but the file is informational there rather than load-bearing.

After all commit units are created, proceed to Step 3b.

### Step 3b: Level Gate Critique (if enabled)

Once all tasks in the current level have been committed (Step 3a+) or marked `failed`, determine which tasks need critique. Per-task setting takes precedence over global. The global `critique.enabled` defaults to `true` when the `critique.enabled` key is absent — whether the entire `critique` block is omitted or the block exists but lacks the `enabled` key.

| Global `critique.enabled` | Per-task `critique.enabled` | Needs critique? |
|---|---|---|
| `true` (or key absent) | absent | yes |
| `true` (or key absent) | `true` | yes |
| `true` (or key absent) | `false` | no |
| `false` | absent | no |
| `false` | `true` | yes |
| `false` | `false` | no |

Tasks that do not need critique are marked `completed` immediately. Tasks that need critique form the gate input set. If the gate input set is empty, skip the gate entirely.

The gate input set is restricted to tasks in `committed` state — tasks marked `failed` (due to Step 3a evidence or contract failures) are excluded.

If the gate input set is non-empty, spawn a single gate critique agent:

1. Spawn one critique agent. Agent type is selected as follows:
   - If all gate-input tasks share the same per-task `critique.agent` type → use that type
   - Otherwise (tasks have different per-task agent types, or no per-task override) → use the global `critique.agent`, defaulting to `critique`
   - Note: when tasks have heterogeneous per-task agent types, both custom preferences are discarded in favor of the global default. If this is unacceptable for a level, the tasks should be split into separate levels or given a shared per-task agent type.

   The critique agent receives:
   - For each task in the gate input set: the committed diff (`git show <commit-sha>` using the task's `commit-sha`), its `plan.md`, its `output.yaml`, and the evidence files listed in its `verification-summary`
   - The repository root and task directory paths for each task
   - A prompt selected by applying these rules in order:
     1. If all gate-input tasks have a per-task `critique.prompt` and they are all identical → use that prompt
     2. Otherwise (some tasks have no per-task prompt, or prompts differ) → use the global `critique.prompt` if present
     3. Otherwise → if any gate-input task has `validate-fix.enabled: true`, use the validation gate prompt
     4. Otherwise → if all gate-input tasks are `explore` agents, use the explore gate prompt; else use the standard gate prompt
     - Same trade-off as agent type: heterogeneous or partial per-task prompts are discarded in favor of the global default
     - **Warning:** If a per-task or global `critique.prompt` is selected (rules 1 or 2) and any gate-input task has `validate-fix.enabled: true`, the custom prompt will be used as-is — mutation testing instructions are not automatically injected. Log a warning that validate-fix tasks are present but the custom prompt was used; mutation testing will not run unless the custom prompt includes those instructions.
2. The critique agent writes one `gate-critique.yaml` to `dispatch/<run-name>/`. For planned tasks the file is named `level<N>-gate-critique.yaml` (e.g., `level1-gate-critique.yaml`). For amendment rounds it is named `level<N>-amend-round<R>-gate-critique.yaml` where R is the amendment round number.
3. Based on the verdict:
   - Tasks with no blocking issues → mark `completed`
   - Tasks referenced by blocking issues → mark `fixing` in `dispatch.yaml` with `fixing-source: critique`, then enter the **amendment loop** (see below). Setting `fixing` status and source is required for resumability.

**Single-task levels** follow the same path. When a level has only one task, the gate input set contains that one task and the gate runs as normal.

If the critique agent fails to produce a valid `gate-critique.yaml` (crashes, times out, or writes a malformed file), treat the gate as `accepted` for all tasks in the gate input set and mark them `completed`. Log a warning that critique was skipped due to infrastructure failure.

Critique agents count toward `max-parallel`.

#### Amendment loop

When critique finds blocking issues in committed tasks, the orchestrator fixes and amends those commits rather than creating separate fix tasks. This mirrors the implement skill's critique loop: fix, rebuild, amend, re-critique.

Amendments are processed per commit unit (see Step 3a+). Tasks that share a `commit-group` share a commit — their issues are fixed together and the shared commit is amended once. Tasks with individual commits are amended independently.

**Why reset-and-rebuild here, not rebase-edit?** The `git-rebase` skill's Pattern 4 (edit-in-place) can amend non-HEAD commits via `git rebase -i` with `edit` actions, and Phase 5 does exactly that. Step 3b deliberately uses reset-and-rebuild instead for three reasons:

1. **No downstream commits exist at this point.** Step 3b runs at end-of-level. The level's commits are the only ones the rebuild needs to recreate; there are no later commits whose replay could conflict.
2. **Commit units within a level are independent.** They were planned as parallel work — no ordering dependency between them. The churn-between-target-and-HEAD failure mode that motivates Pattern 4 does not exist within a single level.
3. **Parallel fix agents share the working tree.** Reset-and-rebuild lets multiple fix agents accumulate changes in one working tree before the orchestrator does the commit surgery; Pattern 4's per-commit stop-and-fix would serialize fix agents across commit units.

Per-commit validation (added below, step 3) catches the one residual risk: a fix agent that crosses commit-unit boundaries and references content from a peer unit. Phase 5 is the loop where rebase-edit is needed; this one is not.

**Process:**

1. **Fix phase** — for each commit unit with blocking issues (serialized — fix agents operate in the same working tree and may need to modify shared files):
   a. Spawn a fix agent (same agent type as the original task, or `general` for grouped units) with:
      - The blocking issues from `gate-critique.yaml` for this commit unit
      - The `plan.md` files for all tasks in the unit (original objectives for context)
      - The committed diff (`git show <commit-sha>`)
      - Instruction: fix only the specific issues identified by critique, do not expand scope
      - Instruction: do not run any mutating git operations — leave changes uncommitted for the orchestrator to rebuild
   b. The fix agent updates the task's `files-modified` in `output.yaml` if it modified files not already listed (the rebuild step uses `files-modified` to know which files to commit)
   c. Re-run the build gate (full pipeline: format, lint, build, test)
      - If the build fails, the fix agent must resolve before proceeding

2. **Rebuild level commits** — after all fix agents for this round complete:
   a. **Re-mark all non-failed tasks in the level as `committed`** in `dispatch.yaml`, clearing `fixing-source` for any tasks that were in `fixing` status. This includes tasks that previously passed critique (`completed`) — their commits are about to be destroyed and recreated. This is critical for resumability: if a crash occurs during the rebuild, the resume logic handles `committed` tasks by checking whether their `commit-sha` exists in git log.
   b. `git reset` (mixed, the default) to the pre-level boundary SHA from `level-boundaries` for this level. This moves HEAD back and resets the index, but preserves the working tree with all fixes applied. Using mixed reset (not `--soft`) is critical — `--soft` would leave all files staged in the index, causing the first `git add` + `git commit` to absorb files from all commit units.
   c. Re-create all commit units for this level in topological order, following the same process as Step 3a+ (git add files, commit, record SHA). Commit messages are preserved from the original commits.
   d. Update `commit-sha` for all tasks in the level to their new SHAs.
   e. Since downstream levels have not started yet, no later commits depend on the old SHAs.

3. **Validate per rebuilt commit:** Run the fast gate at each newly created commit in topological order. This catches the failure mode where a fix agent referenced content from a peer commit unit at end-of-level state — the recreated commit then no longer has access to that content.
   a. Resolve the fast gate command: `validation.fast-gate` from `dispatch.yaml`, or the full `verify` pipeline if `validation.no-fast-gate: true`. If neither is set, fail the run with a clear message — do not silently skip per-commit validation.
   b. For each new SHA in topological order: `git checkout <sha>` (detached), run the fast gate, capture output to `dispatch/<run-name>/level<N>-amend-round<R>-percommit-<sha>.log`.
   c. On failure: a rebuilt commit doesn't build in isolation. Re-enter the fix phase (step 1) with the attributed commit unit and the captured failure log. Treat this as another amendment round — increment the round counter.
   d. On success across all rebuilt commits: `git checkout <branch-name>` to re-attach HEAD to the branch at the level's final commit, then proceed to step 4.

4. **Re-run critique** on the rebuilt commits:
   - Spawn critique with the new diffs (`git show <new-sha>` for each commit unit)
   - Include the original intent from `plan.md` and what was fixed since last pass
   - Critique evaluates ALL commit units in the level (not just the ones that had issues), since commits were rebuilt
   - Critique writes a new gate file: `level<N>-amend-round<R>-gate-critique.yaml`
   - Note: re-critiquing previously-approved tasks may surface new issues due to non-determinism in critique evaluation. This is expected — escalation (below) handles the case where critique flip-flops across rounds.

5. **Repeat** until critique passes or escalation triggers:
   - Round 1-2: Fix silently
   - Round 3: Notify user that a task is proving difficult
   - Round 4+: Ask user for guidance (proceed, consult greybeard, abort)

6. When critique passes: mark all non-failed tasks in the level `completed`

**New test files from critique:** If `gate-critique.yaml` contains `new-tests` entries for a task, add those files to the task's `files-modified` in `output.yaml`. They will be picked up during the level rebuild (step 2b) along with other fix changes.

**Handling validation results:**

If `validate-fix` was enabled for a task, the critique agent can perform mutation testing directly against the task's commit (using the `commit-sha`):
1. Check whether `gate-critique.yaml` contains a `skipped-validation` entry where `task-id` matches the task. If present:
   - `type: structural`: log the reason and treat as if mutation testing passed. Do not block.
   - `type: anomaly`: log as a **warning** and treat as if mutation testing passed.
2. Otherwise, check for a `validation` entry. If absent (and no `skipped-validation`), treat as blocking — mutation testing was required but not performed.
3. If present, verify `without-fix.status` is "failed" and `with-fix.status` is "passed"
4. Any deviation is blocking for that task
5. Evidence files (mutation-test-*.log) remain in the task directory

**Explore agents:** The gate critique verifies findings against the actual codebase rather than reviewing file changes. The gate agent independently checks key claims from each explore task's output.yaml: file existence, pattern identification, function signatures, module structure, etc. For a `needs-work` verdict on an explore task, a fix agent (also `explore`) re-investigates with the critique issues as context. The orchestrator writes a new `output.yaml` on the fix agent's behalf. Explore tasks have no commits to amend, so the amendment loop does not apply — instead, the re-investigation produces corrected findings and the orchestrator updates `output.yaml`.

#### gate-critique.yaml format

```yaml
tasks: [1a-task, 1b-task]     # all task IDs in scope for this gate run
verdict: accepted | needs-work
issues:
  - task-id: 1b-task           # which task this issue belongs to
    severity: blocking | warning | nit
    file: src/routes/users/create.ts
    description: "Error handler swallows the original error message"
validation:                    # present only if validate-fix was enabled for a task
  - task-id: 1a-task
    mutation-test:
      fix-commit: abc123
      without-fix:
        status: failed
        evidence-file: mutation-test-without-fix.log
      with-fix:
        status: passed
        evidence-file: mutation-test-with-fix.log
skipped-validation:            # present only if validate-fix was enabled but mutation testing was skipped
  - task-id: 1a-task
    type: structural | anomaly   # structural = expected config incompatibility; anomaly = runtime detection failure
    reason: "files-modified is empty; no commit to revert"
new-tests:                     # files critique created that should be committed
  - task-id: 1a-task
    file: src/tests/range-field.spec.ts
notes: |
  Overall approach is sound.
  Task 1b has two issues that need addressing.
```

Only `blocking` issues result in a `needs-work` verdict for the referenced task. Validation failures (test passes without fix or fails with fix) are blocking. Warnings and nits are recorded but do not block completion.

The critique agent must not modify source files. If it does, treat this as a bug and discard those changes. To detect this, the orchestrator should snapshot modified files (via `git status` or equivalent) before dispatching the critique agent and revert any newly modified files outside the task directories afterward.

#### Default gate prompt

When no custom `critique.prompt` is provided, no `validate-fix` tasks are present, and the level is not exclusively `explore` agents:

```
You are reviewing the committed work of a group of agents that ran in parallel.
For each task in the level, you have:

1. The committed diff (git show <commit-sha>)
2. The task's plan.md (what was asked)
3. The task's output.yaml (what the agent claims it did)
4. The evidence files listed in the task's verification-summary

For each non-explore task, evaluate whether:
- The committed diff matches the objective in plan.md
- The changes are correct, complete, and well-structured
- Constraints from the plan were respected
- Verification was actually performed:
  - For automated: Check verification.log shows tests/builds were run
  - For bugfix tasks (type: bugfix): Check pre-fix-test.log exists and shows
    the test actually failing before the fix was applied. A pre-fix-test.log
    that shows tests passing is invalid — it means the test does not catch the
    bug.
  - For manual: Check manual-evidence.log demonstrates the task works
  - For review: Check verification.log shows compile/lint/tests were run
- Verification evidence matches the summary in output.yaml

For each explore task (agent: explore), evaluate whether:
- Referenced files and directories actually exist
- Function signatures, type definitions, and exports match what was reported
- Patterns described are accurate (spot-check against actual codebase)
- Important files or patterns were not missed
- The conclusions follow from the evidence in the codebase
- Check the deviations field in output.yaml; if the agent examined files not
  in the plan, a deviation is reasonable if the file was contextually necessary
  to answer the task's question (e.g., following an import chain); flag as
  blocking if the agent examined files that are unrelated to the objective

Important: Issues that must be marked as blocking:
- Objective not met
- Committed changes do not match what the plan described
- Verification not performed (missing or fake evidence)
- Verification evidence contradicts the summary
- Build/test/lint failures in evidence
- A finding that downstream tasks will rely on being wrong (explore tasks)

Write gate-critique.yaml to the dispatch run directory. Include:
- tasks: list of all task IDs you reviewed (e.g., [1a-task, 1b-task])
- verdict: accepted | needs-work
- issues: list of specific issues with task-id and severity (blocking | warning | nit)
- new-tests: entries (task-id + file) for any test files you created during review (omit if none)
- notes: optional free-text observations for the orchestrator
Only blocking issues should result in a needs-work verdict for a task.
```

#### Default gate prompt with validation

When no custom `critique.prompt` is provided and `validate-fix` is enabled for one or more tasks in the level:

```
You are reviewing the work of a group of agents with MUTATION TESTING enabled
for some tasks.

Follow the standard gate critique process for all tasks, then perform mutation
testing for each task that has validate-fix enabled:

MUTATION TESTING PROCEDURE (per task with validate-fix):
Each task's commit SHA is provided via the task's `commit-sha` field. Use this
SHA directly — do not attempt to discover it via git log.

1. If `files-modified` is empty, add a `skipped-validation` entry with `type: structural` and reason "files-modified is empty" — do not attempt mutation testing.
2. Use the task's `commit-sha` to identify the commit to revert.
3. Revert the fix: git revert --no-commit <commit-sha>
   If the revert produces conflicts (because later commits in the level depend on
   this task's changes), add a `skipped-validation` entry with `type: anomaly`
   and reason "revert produced conflicts with later commits in level", run
   `git revert --abort`, and skip mutation testing for this task.
4. Run the test command: <test-command from validate-fix config>
5. Capture full output to: mutation-test-without-fix.log (in that task's directory)
6. Restore the fix: git revert --abort (aborts the in-progress revert; restores the working tree to HEAD in both clean and conflict cases; does not touch untracked new test files)
7. Run the test command again
8. Capture full output to: mutation-test-with-fix.log (in that task's directory)

VALIDATION CRITERIA:
- Test MUST fail when fix is reverted (without-fix status: failed)
- Test MUST pass when fix is present (with-fix status: passed)
- Any deviation is a BLOCKING issue for that task

WORKING TREE REQUIREMENTS:
- DO NOT make any git commits
- Working tree must be clean when finished (back to original state)
- Exception: new test files you create should remain

OUTPUT:
Write gate-critique.yaml to the dispatch run directory. Include:
- tasks: list of all task IDs you reviewed
- verdict: accepted | needs-work
- issues: list of specific issues with task-id and severity (blocking | warning | nit)
- validation: a list, one entry per task where mutation testing ran; each entry has task-id and mutation-test subfields (see gate-critique.yaml format)
- skipped-validation: a list, one entry per task where mutation testing was skipped; each entry has task-id, type (structural | anomaly), and reason (omit if none skipped)
- new-tests: entries (task-id + file) for any test files you created (omit if none)
- notes: optional free-text observations for the orchestrator
```

#### Default explore gate prompt

When all tasks in the gate input set are `explore` agents, no custom `critique.prompt` is provided, and no `validate-fix` tasks are present:

```
You are verifying the research findings of a group of explore agents that ran
in parallel. You have, for each task:

1. The task's plan.md (what was asked)
2. The task's output.yaml (the agent's findings)

Your job is to independently verify key claims against the actual codebase.
Do NOT take findings at face value.

For each task, check whether:
- Referenced files and directories actually exist
- Function signatures, type definitions, and exports match what was reported
- Patterns described (e.g., "all routes use X middleware") are accurate
- Important files or patterns were not missed
- The conclusions follow from the evidence in the codebase
- Check the deviations field in output.yaml; if the agent examined files not
  in the plan, a deviation is reasonable if the file was contextually necessary
  to answer the task's question (e.g., following an import chain); flag as
  blocking if the agent examined files unrelated to the objective

Write gate-critique.yaml to the dispatch run directory. Include:
- tasks: list of all task IDs you reviewed
- verdict: accepted | needs-work
- issues: list of specific issues with task-id and severity (blocking | warning | nit)
- notes: optional free-text observations for the orchestrator
Only blocking issues should result in a needs-work verdict for a task.
A finding that downstream tasks will rely on being wrong is blocking.
```

### Step 3c: Level completion

After the level gate critique completes (including any amendment rounds), all non-failed tasks in the level are `completed`. This unblocks downstream tasks: downstream tasks `depends-on` the original task IDs, and when a task reaches `completed`, its dependents enter the ready set in the next iteration of Step 1.

### Step 4: Update and repeat

Update `dispatch.yaml` with all status changes. Return to Step 1.

Continue until all tasks have status `completed` or `failed`.

If all tasks have status `failed`, skip Phases 5/6/7. Set the run status to `failed` and report a failure summary to the user: which tasks failed, what errors occurred, and what was attempted.

## Escalation

### Critique Amendment Escalation

The amendment loop in Step 3b tracks rounds per task. Escalation thresholds:

- Round 1-2: Fix silently, amend the commit
- Round 3: Notify user that a task is proving difficult, explain what critique keeps finding
- Round 4+: Ask user for guidance before continuing. Present the issues, what has been tried, and options

### Verification Fix Escalation

The orchestrator tracks fix rounds for Phase 5 verification failures. One round = one complete pass through the fix loop (steps 1 through 7 in "Attribution and Fix Loop", with step 8 being the loop control), regardless of how many commits were amended or how many internal critique re-runs occurred within that pass. `fix-loop.iteration` in `dispatch.yaml` reflects the current round.

- Round 1-2: Fix silently
- Round 3: Notify user that verification is proving difficult, explain what is failing
- Round 4+: Ask user for guidance before continuing. Present the error, what has been tried, and options

There is no hard retry limit. Escalation ensures the user is involved when things are not converging.

### Plan Critique Escalation (Pre-Execution)

Plan critique iterations follow the same escalation pattern:

- **Iterations 1-2:** Calling agent fixes issues in-place, re-runs critique
- **Iteration 3:** Notify user that plan validation is proving difficult
- **Iteration 4+:** Ask user for guidance via question tool:
  - Proceed anyway (accept plan with known issues)
  - Consult greybeard for architectural guidance
  - Abort dispatch and start over
  - Manual review needed

**Spec Issue Exception:**
When spec issues (`type: spec`) are found:
- Pause and have user update the spec directly
- Reset iteration counter to 0 after spec update
- Restart Phase 1 with updated spec
- This takes precedence over the iteration escalation above

**Note:** If the critique agent crashes or produces invalid output at any iteration, block immediately and ask user for decision. Do not proceed with invalid critique results.

## Phase 5: Full Build Verification

After all tasks are completed (and critiques passed, if enabled):

If no tasks modified any files (`files-modified` is empty across all completed tasks at the time Phase 5 begins), skip to Phase 7.

### Run Full Build

Consult project build documentation to determine the complete verification suite. A full build typically includes:
- **Generate** (if applicable): Code generation step
- **Lint**: Project-wide linting
- **Build**: Full compilation/build
- **Test**: Complete test suite

Run the commands identified from project documentation (README.md, CONTRIBUTING.md, Makefile, package.json scripts, etc.)

Save output to `dispatch/<run-name>/final-build.log`

### Compare to Baseline

Compare final build results to `baseline-build.log` (captured at dispatch start):

1. **If final build passes and baseline passed**: Success, proceed to Phase 6 (commit consolidation)
2. **If final build fails and baseline failed with same errors**: No regression introduced, proceed to Phase 6
3. **If final build has NEW failures not in baseline**: Regression introduced, enter fix loop

### Attribution and Fix Loop

When regressions are detected, the orchestrator attributes failures to the affected commits, then uses `git rebase -i` with `edit` actions on those commits to amend them at their historical state. This applies the `git-rebase` skill's Pattern 4 (edit-in-place) paired with Pattern 7 (`--exec`) for per-commit fast-gate validation, and uses Pattern 2 (`GIT_SEQUENCE_EDITOR` script) to drive the plan non-interactively.

**Why rebase-edit, not the reset-and-rebuild approach used by Step 3b?** Phase 5 fires after every level has committed. Affected commits may sit at any level, with downstream commits already in place. Reset-and-rebuild would have fix agents author against HEAD's end-of-run tree, then re-attribute changes backward to earlier commits — the failure mode where a fix references symbols added by a later commit, producing a history where intermediate commits don't build in isolation. Pattern 4 prevents this by construction: each fix is authored against the historical tree of the commit being amended.

**Pre-rebase setup:**

- Verify `backup-branch` is set in `dispatch.yaml` and the branch ref still exists. If not, abort and ask the user before proceeding — the backup is the recovery path if the rebase wedges.
- Resolve the fast-gate command from `validation.fast-gate` (or use the full `verify` pipeline if `validation.no-fast-gate: true`). If neither is declared, fail the run with a clear message — do not proceed with a no-op gate.

**Process:**

1. **Attribute failures to commits**: Launch a subagent (general or explore) to:
   - Read `dispatch/<run-name>/final-build.log`
   - Identify which files have errors
   - Map errors to responsible commits (using each task's `commit-sha` and `files-modified`)
   - Save attribution to `dispatch/<run-name>/failure-attribution.md`. The output must list the affected `commit-sha` values explicitly, not only task IDs.

2. **Record fix-loop state**: For each task whose commit was attributed:
   - Transition status from `completed` to `fixing` with `fixing-source: verification`.
   - Update `dispatch.yaml`:
     - `fix-loop.in-progress: true`
     - `fix-loop.iteration: <n>` (increment)
     - `fix-loop.affected-commits: [<sha>, ...]` (topologically ordered)
     - `fix-loop.rebase-base: <sha>` (parent of the earliest affected commit)
   - This state is required for resumability — the resume logic uses it to detect mid-rebase crashes.

3. **Run the rebase:**
   a. Build a rebase plan via a `GIT_SEQUENCE_EDITOR` script (per `git-rebase` skill Pattern 2). For each commit between `fix-loop.rebase-base` and HEAD: `pick` if not in `fix-loop.affected-commits`, `edit` if it is. Use explicit `drop` lines for any commits intentionally being removed (none in this loop, but the rule keeps `rebase.missingCommitsCheck` happy and is good hygiene).
   b. Start the rebase:
      ```
      GIT_SEQUENCE_EDITOR=<plan-script> git rebase -i --exec '<fast-gate>' <fix-loop.rebase-base>
      ```
      `--exec '<fast-gate>'` runs the fast gate after every replayed commit. The fast gate's contract (see the `validation` block in dispatch.yaml schema): it MUST fail when a commit references a symbol, import, or type defined only in a later commit. Stub commands (`true`, `echo ok`) are forbidden by the schema and must not be plugged in here.

4. **At each `edit` stop:**
   a. The rebase pauses with HEAD pointing at the original SHA, working tree at that commit's historical state.
   b. Identify which commit this is by inspecting `git rev-parse HEAD` against `fix-loop.affected-commits` and matching to a commit unit (use the commit message subject to locate the originating tasks).
   c. Spawn a fix agent (same agent type as the original task, or `general` for grouped units) with:
      - The failures attributed to *this specific commit* from `failure-attribution.md`
      - The `plan.md` for each task in the commit unit
      - The committed diff (`git show HEAD`)
      - **Cross-commit context (orchestrator-injected)**: for each *other* commit in `fix-loop.affected-commits`, include `git show <sha>` output from the original history in the prompt. The fix agent sees only the historical tree on disk but receives downstream context as prompt data, preserving the Pattern 4 invariant while giving the agent enough context to reason about cross-commit interactions.
      - Instruction: fix only the failures attributed to this commit. Do NOT run any mutating git operations — leave changes uncommitted for the orchestrator to amend.
   d. Run the full gate (the `verify` pipeline) at this stop. The full gate runs at every `edit` stop; the fast gate runs via `--exec` between stops. Full gate failure at a stop means the fix is incomplete — the fix agent must resolve before proceeding.
   e. `git add` the changed files (use the working tree, not `files-modified` — the rebase-edit model amends the in-place commit's tree directly).
   f. `git commit --amend --no-edit` (or `--amend -F <message-file>` if the fix requires a message change).
   g. `git rebase --continue`. The `--exec` fast-gate fires on this commit immediately, and on each subsequent replayed commit.

5. **After the rebase completes:**
   a. **Zombie-rebase check** (per `git-rebase` skill, "Safety first"): verify neither `.git/rebase-merge/` nor `.git/rebase-apply/` exists. If either is present, the rebase was paused, not completed — investigate. Do not trust `git rebase`'s exit code alone.
   b. **Content sanity check**: `git diff <backup-branch> HEAD --stat`. The diff should reflect only the intended fixes. A large unexpected diff means the rebase replayed something incorrectly — abort and recover from backup.
   c. Walk `<fix-loop.rebase-base>..HEAD` and update `commit-sha` in `dispatch.yaml` for every task whose commit was replayed. Picked (non-amended) commits get new SHAs too as a consequence of preceding amends; match commit subjects to tasks to re-attribute.
   d. Update `level-boundaries` for all levels whose first-commit SHA changed.
   e. Re-mark affected tasks as `committed`.

6. **Re-run critique** for each rebuilt level that has critique enabled. If critique finds blocking issues, the new findings feed back into the same rebase-edit machinery:
   - Identify the commits with blocking issues using each task's updated `commit-sha`.
   - Add them to `fix-loop.affected-commits`, recompute `fix-loop.rebase-base` (parent of the earliest newly-affected commit, which may move earlier in history than the previous iteration), increment `fix-loop.iteration`.
   - Goto step 3 with the expanded affected set.

   This unifies critique-driven and regression-driven fixes under one rebase-edit mechanism. Counts toward critique amendment escalation, not verification fix escalation. Multiple iterations against the same task across normal execution and Phase 5 critique rebuilds accumulate toward the round 3 notify / round 4+ ask threshold.

7. **Re-verify**: Run the full build, compare to baseline.
   - If matches baseline: clear `fix-loop` in `dispatch.yaml` (set `in-progress: false`, leave iteration/affected-commits for postmortem), exit loop, proceed to Phase 6.
   - If new failures remain: return to step 1 with the new failure set.

8. **Repeat** until verification passes or verification fix escalation triggers user intervention.

**Rebase failure modes and recovery:**

- **`--exec` fails on a picked (non-affected) commit:** the fast gate caught a commit that doesn't build in isolation — the precise pathology this loop exists to detect. `git rebase --abort`, add the failing commit to `fix-loop.affected-commits`, return to step 3 with the expanded set. The picked-then-failed commit becomes an `edit` action next iteration.
- **Conflict during replay of a picked commit:** a previous amend changed code that the picked commit also modifies. `git rebase --abort`, add the conflicting commit to `fix-loop.affected-commits`, return to step 3. Letting it amend at its historical state surfaces the interaction explicitly.
- **Fix agent fails at an `edit` stop** (cannot produce a working fix): report to user. Offer to abort the rebase and restart the fix loop from a fresh attribution, or escalate.
- **Any unrecoverable state:** `git rebase --abort`, `git reset --hard <backup-branch>`, clear `fix-loop` from `dispatch.yaml`, report to user. The user can choose to restart Phase 5 from scratch or abandon the run.

## Fix Approach

Two fix mechanisms operate at different scopes:

- **Step 3b amendment loop (within-level)**: Reset-and-rebuild. Fix agents author at end-of-level state, the orchestrator resets to the pre-level boundary, and rebuilds the level's commits using `files-modified` attribution. Correct here because commit units within a level are independent and there are no downstream commits to conflict with. Per-commit fast-gate validation after rebuild catches the residual cross-unit-boundary risk.
- **Phase 5 fix loop (across-level)**: Rebase-edit. The orchestrator uses `git rebase -i` with `edit` actions on affected commits and `--exec '<fast-gate>'` for per-commit validation (per `git-rebase` skill Patterns 4 and 7). Fix agents author at the historical tree of each affected commit. Downstream commits replay naturally; only affected commits change. Required here because reset-and-rebuild would let fixes reference symbols added by downstream commits and produce a history where intermediate commits don't build.

Neither mechanism creates separate "fix tasks" in the manifest — fixes are amendments to existing tasks' commits, not new entries in the DAG.

This means the manifest's task list only contains planned tasks. Fix work is tracked through:
- The task's status (`fixing` → `committed` → `completed` after rebuild)
- Amendment round gate files (`level<N>-amend-round<R>-gate-critique.yaml`)
- Per-commit validation logs (`level<N>-amend-round<R>-percommit-<sha>.log`)
- Phase 5 fix loop artifacts (`failure-attribution.md`, `final-build.log`, the `fix-loop` block in `dispatch.yaml`)

## Phase 6: Commit Consolidation

Commits are created incrementally during execution (Step 3a+ commits each task or commit-group's work at the level fan-in). By the time Phase 6 runs, every completed task already has a commit with its SHA recorded in `commit-sha`.

### Commit strategies

| Strategy | Behavior |
|---|---|
| `per-task` (default) | No action needed — each task has its own commit from Step 3a+. Record final commit list in `results.commits`. |
| `grouped` | No action needed — tasks sharing a `commit-group` were already committed together in Step 3a+. Record final commit list in `results.commits`. |
| `single` | Squash all existing commits into one. Derive message from the `goal` field in the manifest, using `message-source` as guidance for tone. Record SHA in `results.commits`. |

### Approval modes

| Mode | Behavior |
|---|---|
| `ask-once` (default) | For `per-task`/`grouped`: present the commit list for review before proceeding. For `single`: present the squash plan, wait for approval before squashing. |
| `ask-each` | Present each final commit individually for review before proceeding. |
| `auto` | Proceed without user interaction. |

For `per-task`/`grouped`, commits already exist — approval is a review gate, not a creation gate. If the user objects to a commit, they can request manual intervention (revert, amend, reorder) outside of dispatch. For `single`, the squash has not happened yet, so the user can abort before it occurs.

### Consolidation steps

1. Read commit strategy and approval mode from manifest
2. **`per-task` / `grouped`**: Collect all distinct `commit-sha` values from completed tasks in topological order. Present to user per approval mode. Record in `results.commits`.
3. **`single`**: Squash all commits into one using `git reset --soft` to the pre-dispatch baseline (`level-boundaries[1]`, the SHA before the first level's commits) followed by a single `git commit`. Present squash plan per approval mode. Record SHA in `results.commits`.

### Resume during Phase 6

If the process is interrupted during Phase 6:
- **`per-task` / `grouped`**: Phase 6 is idempotent (just records existing SHAs). Re-run it.
- **`single`**: Check the number of commits since the pre-dispatch baseline. If only one commit exists, the squash completed — record it and proceed. If multiple per-task commits still exist, the squash was not started or was interrupted — restart the squash.

## Phase 7: Completion

When all tasks are completed, verification passes, and commit consolidation is done:

1. Update `dispatch.yaml` status to `completed`
2. Report a summary:
   - Total tasks run
   - Fix rounds needed (if any)
   - Critique rounds (if any)
   - Files modified across all tasks
   - Commits created
   - Verification results
3. Delete the pre-dispatch backup branch: `git branch -D <backup-branch>` using the name recorded in `dispatch.yaml`. The run completed successfully; the backup is no longer load-bearing.
4. Ask the user whether to keep or clean up the `dispatch/` directory

## Resumability

This section describes how to resume a dispatch run. **Note:** This logic is invoked AFTER the Checkpoint (presentation + confirmation) when resuming from an existing dispatch.yaml.

### When `$ARGUMENTS` points to an existing `dispatch.yaml`:

**First, run existing dispatch flow:**
1. Load and validate the dispatch
2. Analyze current state
3. Present status to user
4. Wait for confirmation

**Then, based on run status:**

**If status is `completed`:**
- Report previous results
- Exit (no further action needed)

**If status is `failed`:**
- Present failure summary at the Checkpoint
- Ask user whether to:
  - Retry failed tasks (reset to `pending`, set status to `in-progress`, proceed to Phase 4)
  - Abort (exit, leave dispatch as-is)

**If status is `pending`:**
- Re-run Phase 3 validation
- Present at Checkpoint
- Ask for approval to proceed
- If approved: set status to `in-progress`, proceed to Phase 4
- This handles interruption between plan creation and the run

**If status is `in-progress`:**
1. Re-validate remaining DAG (Phase 3)
2. Handle interrupted tasks based on status:
   - `completed`: skip
   - `dispatched`: check for `output.yaml`. If exists, process it; else reset to `pending`
   - `committed`: task was committed but critique hasn't run (or was interrupted). Check if `commit-sha` exists in git log. If yes, proceed to Step 3b (critique). If commit is missing, reset to `pending`.
   - `failed`: present at Checkpoint, ask to retry or skip
   - `fixing`: the fix-and-rebuild cycle was interrupted. Check `fixing-source` to determine which mechanism to re-enter:
     - `critique`: the Step 3b amendment loop was interrupted. Check if `commit-sha` exists in git log. If yes, rebuild the level's commits and re-enter the amendment loop (Step 3b). If the commit is missing, reset the task and all tasks at its level to `pending`.
     - `verification`: the Phase 5 rebase-edit fix loop was interrupted. Mid-rebase state has too many partial-fix-agent-output edge cases to recover reliably. Abort and restart cleanly:
       1. If `.git/rebase-merge/` or `.git/rebase-apply/` exists: `git rebase --abort` (releases the in-flight rebase).
       2. Verify `backup-branch` is set in `dispatch.yaml` and the branch still exists. If missing, halt and ask the user — recovery without the backup requires manual reflog work.
       3. `git reset --hard <backup-branch>` to restore the pre-dispatch state.
       4. Replay completed levels' commits up to the start of Phase 5 by re-running Step 3a+ for each level in order (the orchestrator already has each task's `files-modified` and the level-boundaries; recreating commits is deterministic). This restores history to the post-execution / pre-verification state.
       5. Clear the `fix-loop` block in `dispatch.yaml` (set `in-progress: false`, reset iteration/affected-commits/rebase-base).
       6. Re-enter Phase 5 from the start: re-run the full build, re-attribute failures (which may differ from the interrupted iteration), restart the rebase from a fresh plan. Fix agent work from the interrupted iteration is lost — this is the accepted cost of clean recovery. The `git-rebase` skill recommends abort-and-restart as the safe default for the same reason.
   - `pending`: proceed normally
3. After handling interrupted tasks, proceed from Phase 4, Step 1

### Clean Resume Requirements

For a clean resume, ensure:
- Working tree has no unrelated modifications
- All `output.yaml` files in `dispatched` tasks are valid
- No external changes to task directories

The orchestrator does not detect external changes between interruption and resume. Phase 5 verification will catch build/test/lint issues, but unrelated modifications may be silently included in commits.

## Source of Truth Contract

The orchestrator and subagents agree on the following:

| Artifact | Role | Who writes | Who reads |
|---|---|---|---|
| `plan.md` | Task instructions | Orchestrator | Subagent |
| `output.yaml` | Task results (source of truth) | Subagent (Orchestrator for `explore` agents) | Orchestrator |
| `level<N>-gate-critique.yaml` | Gate verdict for planned tasks at level N | Critique agent | Orchestrator |
| `level<N>-amend-round<R>-gate-critique.yaml` | Gate verdict for amendment round R at level N | Critique agent | Orchestrator |
| `level<N>-amend-round<R>-percommit-<sha>.log` | Per-commit fast-gate output for Step 3b validation | Orchestrator | Human (postmortem) |
| `failure-attribution.md` | Phase 5 failure-to-commit mapping | Attribution agent | Orchestrator |
| `final-build.log` | Phase 5 final verification output | Orchestrator | Orchestrator + attribution agent |
| Task tool return | Diagnostic supplement (advisory) | Subagent | Orchestrator (diagnostics only) |
| `dispatch.yaml` | Run state and DAG | Orchestrator | Orchestrator |
| `mutation-test-*.log` (in task dir) | Mutation testing evidence | Critique agent | Human (paths stored in gate-critique.yaml for reference; orchestrator never reads directly) |
| Other files in task dir | Scratch space | Subagent | Nobody (unless referenced in exports) |

**`output.yaml` is the source of truth for task completion.** The Task tool return message is advisory -- used for diagnostics when things fail and as a sanity check against `output.yaml`. If they conflict, `output.yaml` wins.

If `output.yaml` does not exist when a subagent finishes, the task is treated as failed regardless of what the Task tool return says.

Exception: for `explore` agents, the orchestrator writes `output.yaml` on the agent's behalf using the Task tool return message, since explore agents cannot write files.

## Guiding Principles

From the philosophy skill:

- **Pragmatic over idealistic** -- Do not over-plan. A single task with no dependencies is a valid dispatch.
- **Simple is usually harder than easy** -- The DAG should reflect real dependencies, not imagined ones. Do not serialize tasks that can run in parallel.
- **Do no harm** -- Verify before declaring victory. Verification commands exist for a reason. The style skill says "do not work around a failing build" -- dispatch's fix loop is not a workaround; it is an active attempt to resolve the failure. If the fix loop cannot converge, escalation ensures the user is involved.
- **Constraint ownership** -- Each subagent owns its task directory. The orchestrator owns the manifest. Do not cross boundaries.

### Parallelization Safety

**Not all tasks can run in parallel.** Tasks sharing mutable state within the same repository must be serialized:

- **Git operations** — subagents must not run mutating git commands. The orchestrator owns all git state. Read-only git operations (status, log, diff) are safe.
- Build systems write to shared output directories and caches
- File operations targeting the same paths create race conditions

When in doubt, add a `depends-on` edge. Parallelism is an optimization; correctness is mandatory. A conservative DAG that serializes potentially conflicting tasks is better than a corrupted repository state.
