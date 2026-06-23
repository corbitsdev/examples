---
name: style
description: General coding conventions for clean, maintainable code. Always load this skill when writing or reviewing code in any language.
---

# Style

General guidelines for writing clean, maintainable code.

## Git Repository Requirement

Agents must only operate within git repositories. Before performing any work:

1. Verify the current working directory is inside a git repository
2. If not in a git repository, refuse to proceed

Without a git repository, it's too hard to succeed with agents - changes can't be tracked, reviewed, or safely reverted.

## Documentation

### Avoiding Redundant Comments

Code should be self-documenting. Do not add comments that describe what the code obviously does:

```
// Bad - obvious comments
// Base configuration type for all backends
BaseConfigArgs = { level: LogLevel }

// Good - let code speak for itself
BaseConfigArgs = { level: LogLevel }
```

Decorative comment blocks (ASCII art dividers, section headers) add visual noise without providing meaningful information.

**When comments ARE useful:**

- Complex algorithms that aren't immediately obvious
- Non-obvious workarounds or edge cases
- TODO/FIXME/XXX markers for work that is genuinely blocked (see below)
- Business logic that requires explanation

```
// XXX - Temporary workaround until upstream fix
// TODO - Switch to newMethod when minimum version is bumped
result = await legacyMethod()
```

**TODO/FIXME/XXX markers are not a deferral mechanism.** They are reserved for work that is *genuinely blocked* by something outside your control — waiting on an upstream library fix, an unreleased API version, missing access or credentials, a dependency in another team's queue. The marker must name the blocker, so a reader knows what would unblock it.

Do not use these markers for:

- Work you could do now but would prefer not to ("TODO: clean up this function")
- Work you ran out of patience for ("FIXME: this should probably handle the error case")
- Work you're hoping someone else will pick up ("TODO: add tests")
- Decisions you didn't want to make ("TODO: figure out the right default")

If you could do it now, do it now. A TODO is a promise to the reader that the work cannot be done yet; abusing the marker for work you simply chose not to do is dishonest and accumulates as dead weight in the codebase.

### Comments describe the current code

Code comments speak for the commit they appear in. Do not write comments that refer to other commits — neither what an earlier commit changed nor what a planned follow-up commit will do. A comment like `// stub; next commit fills this in` is wrong the moment that follow-up is reordered, dropped, or read by someone who reverted past it. If the code is intentionally a stub now, say *why it is a stub now*, not what is supposed to replace it.

This holds even when you have a multi-commit plan in context — a planned commit does not exist until it lands, and the comment must be accurate for the commit it lives in, standing alone.

## Git Workflow

### Commit Messages

Commits should read like a story, allowing others and future-you to understand why changes were made.

**Commit Organization:**

- Separate refactoring from feature additions (distinct commits)
- Separate formatting/whitespace fixes from logical changes
- Each commit should represent one logical unit of work
- **Amend** (`git commit --amend`) to refine the most recent commit (e.g., critique fixes, wording changes, missed files)
- **Edit-in-place** to fix an earlier unpushed commit when a later review reveals a problem that belongs on that commit, not HEAD. Mark the target `edit` in the rebase todo, make the fix at the stop, amend, and continue. The fix is authored against the target commit's historical tree, which keeps the change intent-correct against the right baseline — downstream commits may still produce a replay conflict if they touch the same lines, but resolving that conflict is straightforward because both sides of it are coherent diffs.

```
git rebase -i origin/main           # substitute your project's base branch
# In the editor, change "pick abc1234 ..." to "edit abc1234 ..."
# git stops with the target commit checked out
# ... make the fix ...
git add <files>
git commit --amend --no-edit
git rebase --continue
```

For more elaborate history surgery — scripted plans, multiple targets, splits, per-commit validation — search your available skills for one whose description covers git rebase or branch-history cleanup, and load it when the simple form above is not enough.

**Message Format:**

- **Summary line**: Max 72 characters, non-empty
- **Blank line**: Required between summary and body (if body exists)
- **Body lines**: Max 72 characters each

**Before drafting a subject, sample the project's existing log:**

```bash
git log origin/main --format='%s' | head -20
```

The existing commits document the project's actual subject convention — verb tense, level of detail, voice, capitalization. Match what is there.

The project's log can override the no-prefix rule below, but only when the recent history is **predominantly** prefixed in a single consistent convention — i.e., the prefix is the obvious shape of the last ~20 commits, not a minority pattern visible in a few. Mixed signals fall through to the no-prefix rule; tie goes to no prefix.

**No subject prefixes.** Summary lines are plain English sentences that start with a verb and describe the change directly. Do not prefix the subject with anything — no tag, no scope, no category, no ticket ID, no severity marker. This is a flat rule across every prefix convention, including:

- Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`
- Scope or component prefixes: `Anthropic adapter:`, `mm:`, `[X86]`, `drivers/net:`, `frontend:`
- Ticket IDs: `INTR-79:`, `JIRA-1234:`, `#456:`
- Status or severity tags: `WIP:`, `[urgent]`, `(security):`

Several of these patterns are widespread in well-known projects (Linux kernel, LLVM, Conventional-Commits-adopting projects) and feel idiomatic from sheer exposure. They are still banned here. Familiarity is not a justification.

Summary lines also use no abbreviations and do not end with punctuation.

**Good examples:**

```
Add retry logic for failed network requests
Fix race condition in transaction verification
Document API response format
```

**Bad examples:**

```
feat: add retry logic                  (Conventional Commits prefix)
Anthropic adapter: handle 429s         (component-scope prefix)
INTR-79: add retry logic               (ticket-ID prefix)
[WIP] refactor the parser              (status tag)
Update code                            (too vague)
Fix bug in server.ts                   (filename in subject)
Document INFERENCE.md updates          (filename in subject)
```

**Self-contained:**

A commit message must stand alone. Do not reference:

- File paths or filenames — the diff already lists what changed
- External tracking systems (Linear, Jira, GitHub issues) — they may move, be renamed, or be inaccessible to future readers; the commit must explain *itself*, not point to an explanation elsewhere
- PR review comments, prior conversations, or other ephemeral discussions
- The commit's position in a branch or series, in either direction — neither prior commits ("as discussed in the previous commit") nor upcoming ones ("the next commit wires this up"). A commit describes the state of the repo at that commit, not the branch's trajectory. This holds even when you know exactly which commits are planned to land next: a follow-up commit you intend to write does not yet exist, and a reader landing on this commit (or reverting past the planned one) will not see it.

Someone reading `git log` years from now, with only the repo in hand, should understand the change without leaving the message.

**Body content — what belongs in a commit message:**

**Write for a stranger reading `git log` years from now, not for the person reviewing this PR.** The reviewer has the conversation, the ticket, the prior state of the code; the future reader has only the message and the diff. Most length problems dissolve once the audience is right: anything you would write *because the reviewer would appreciate seeing your reasoning* almost certainly does not belong.

**Most commits do not need a body.** A clear subject and a coherent diff are usually enough. Add a body only when the diff would leave a future reader genuinely unable to answer *why* this change. If you are reaching for a body to demonstrate the change was considered, or to preempt questions from the reviewer, that is not the body's job.

When a body is warranted, it carries one thing: the motivation that would otherwise leave the diff looking arbitrary — why this change, why now, why not the obvious alternative. Information about the *code's behavior*, even non-obvious behavior, does not belong here: future callers do not read `git log`, they read the code, so a comment on the affected function or a line in the relevant documentation file is the right home. Surrounding context — the alternatives explored, the work that led here, the broader trade-off landscape — does not belong either, even when it feels load-bearing in the moment. Before writing a line of body, ask where that information actually lives:

- **Describes what the code does** → the code already says this. Cut.
- **Describes how the system works in general** → belongs in repo documentation. If the docs are wrong, fix them in this commit; don't smuggle the explanation into the message.
- **Describes why a specific line exists, or how a specific block behaves** → if it meets the bar in "Avoiding Redundant Comments," it goes in a code comment at that location, or in the documentation file describing the behavior. Future callers read the code, not the commit log. If it doesn't meet that bar, it goes nowhere.
- **Walks through the diff file-by-file** → cut. The diff is right there.
- **Recaps the conversation, review, retrospective, or planning that led to the change** → cut. This is the single most common source of bloat. That the work was hard, that three alternatives were considered, that the change came out of an incident review, is not load-bearing for the future reader.

What remains is the body. It should be short — typically one short paragraph, rarely more than two. If your draft is materially longer, you are almost certainly violating one of the bullets above (most often the conversation-recap one). The fix is to cut, not to justify.

**Good body:**

```
Switch retries to exponential backoff with full jitter.

Fixed-interval retries were producing synchronized thundering
herds against the upstream rate limiter during partial outages,
making recovery slower than no retries at all. Full jitter is the
AWS-recommended variant and the only one that decorrelates retries
across clients without losing the backoff guarantee.
```

**Bad body (same change):**

```
Switch retries to exponential backoff with full jitter.

The original retry implementation used a fixed interval. After
last quarter's rate-limiter incident we spent a few sessions
working through the right replacement. We discussed whether to
gate the change behind a feature flag and decided against it
since the new behavior is strictly better. Full jitter
decorrelates retries across clients without losing the backoff
guarantee. Unit tests have been updated. See the PR discussion
for the full reasoning.
```

The bad version is not paraphrasing the diff — it is recapping the work session: the history of the prior code, the incident-and-session framing, the feature-flag discussion, the existence of tests, the pointer to the PR. None of it is load-bearing for a future reader; it is the agent demonstrating to the immediate reviewer that the change was carefully considered. Strip it and the substantive sentence — "full jitter decorrelates retries across clients without losing the backoff guarantee" — is what survives. That is what the good version already says.

## Naming

### Acronyms

Acronyms are not words. Do not reshape them to fit camelCase or PascalCase word boundaries. Preserve the acronym's natural capitalization regardless of position in the name.

```
// Good
JSONSchema, HTTPClient, parseJSON, requestURL

// Bad - treating acronyms as regular words
JsonSchema, HttpClient, parseJson, requestUrl
```

## Documentation Maintenance

When making changes to code, check whether related documentation needs updating:

- README files that reference changed functionality
- API documentation for modified interfaces
- Inline comments that describe changed behavior
- Configuration examples that no longer apply

Update documentation in the same commit as the code change, not as a separate task.

## Scope Discipline

Only touch code that is directly related to the task at hand. Do not make drive-by changes to surrounding code, even if they look like improvements. Common violations:

- Reformatting lines you didn't otherwise need to change
- Adding or removing comments on unrelated code
- Renaming variables or functions outside the scope of your task
- Adjusting whitespace, import order, or style in files you're passing through
- "While I'm here" refactors that aren't part of the assignment

These changes pollute diffs, make review harder, and risk introducing unintended breakage.

### Scope is not "the narrowest possible reading of the task"

Scope discipline exists to prevent unrelated drive-bys, not to license deferral of work that is genuinely part of the task you accepted. If you read the task narrowly enough, almost anything can be called "out of scope" — that is a failure mode, not a virtue.

A change is **in scope** if it is:

- Part of what the task or issue explicitly asked for
- Required to make the requested change correct, safe, or coherent
- Necessary follow-through to the change you just made (updating callers of a renamed function, adjusting tests that now fail, updating docs that now lie)

A change is **out of scope** only if it has no causal relationship to the work you are doing — a tangential improvement you noticed while passing through.

### Deferral has a cost. Do the work now when you can.

When something is in scope but inconvenient — a refactor your change makes obvious, a test you should add, a docstring that's now wrong, a helper that should be extracted — the default is to **do it now, in a properly-scoped commit on this branch**. Not a TODO. Not a follow-up ticket. Not a "we should clean this up someday." Those mechanisms exist for genuinely blocked work; using them as a release valve for work you'd rather not do creates debt the team has to carry.

If you genuinely cannot do it on this branch, "raise it as a separate piece of work" means one of:

1. A separate commit on the same branch, with a clear message explaining why it stands alone.
2. A follow-up PR that you commit to opening in this same working session, not "later".
3. A tracked issue with concrete acceptance criteria and a named owner — not a vague reminder.

If none of those are happening, you are not deferring the work, you are dropping it. Don't pretend otherwise.

## Code Reuse and Refactoring

Do not reimplement functionality that already exists in the codebase. Before writing new code:

1. Search for existing implementations that could serve the same purpose
2. If similar functionality exists, prefer refactoring it to meet the new requirements
3. Look for unexported functions in other packages that could be promoted to a shared location

When a refactor might be necessary, prompt the user with specific options:

- Refactor the existing implementation
- Promote an unexported function to a shared package
- Create a new implementation

Allow the user to provide their own answer if none of the options fit.

## Removing Dead Code

When refactoring replaces an old implementation, delete the old one. Do not leave backwards-compatibility shims, re-exports, renamed `_unused` variables, or `// removed` comments for code that no longer serves a purpose. If all callers are internal and have been updated, the old path should not survive. See the `philosophy` skill for the reasoning behind this.

## External Code Attribution

Any code from outside the organization requires careful attribution and licensing compliance:

1. **License verification**: Check that the license is compatible with your project
2. **Isolated commit**: Place external code in its own commit without any modifications
3. **Complete attribution**: Include in the commit message:
   - Original source URL or reference
   - Author/copyright information
   - License type
   - Date retrieved
   - Any other details required for audit compliance

If modifications to external code are needed, make them in a separate follow-up commit with clear explanation of what changed and why.

## Data Validation

Never trust data from outside the program. All external input — user submissions, API responses, file contents, environment variables, query parameters, message payloads — must be validated at the boundary where it enters the system. Parse it, check it, and reject it if it's wrong. Once data has crossed the boundary and been validated, internal code can trust it without re-checking.

This means validation logic lives at the edge: HTTP handlers, CLI argument parsers, message consumers, file readers, and configuration loaders. It does not live deep inside business logic, scattered across internal functions, or deferred until the data happens to cause a failure somewhere downstream.

If invalid data can travel through multiple layers before something finally breaks, the validation boundary is in the wrong place.

## Defaults

Defaults live at the edge, alongside validation. The boundary that accepts user input — CLI argument parser, config loader, HTTP handler, public API entry point — is the one layer that knows what was supplied and what was omitted. That layer resolves omissions into concrete values and hands a fully-populated argument inward. Internal code receives required parameters and acts on them; it does not invent values the caller did not supply. This is "Constraint Ownership" from the `philosophy` skill applied to a specific question: who decides what an absent value means.

The rule targets **read-site defaults** — code that asks "did I get a value?" and silently substitutes one when the answer is no. Concretely: no `getattr(obj, "key", default)`, no `dict.get(k, default)`, no `value || fallback` or `value ?? fallback` scattered through business logic. Each of these is a defaulting decision smuggled into a layer that does not own the input contract, and each colludes with swallowed errors — a missing value that should have raised at the boundary instead becomes a silent fallback three layers deep, indistinguishable from a value the user actually passed.

Default parameter values on a function signature are a different shape and are fine *when the function is itself a boundary*: a config loader, a dataclass constructor that receives values crossing from edge to interior, the entry point of a recursion (its own first call is the edge for the accumulator). What is not fine is an internal helper deep in the call graph that papers over a caller forgetting to pass something. Optional configuration fields get resolved once, at load time, into a concrete config object with no optionals; inner code sees a fully-specified value and trusts it.

To locate the edge in a multi-layer system, ask which single function or file decides what an absent value means. That layer is the edge. Anything deeper that re-decides is wrong. The exception is genuinely public library code where no single layer owns the contract — every caller is the edge. "Public" here means consumed across organization or API boundaries, not "shared across two internal modules"; the latter still has an edge, and the rule still applies one layer in.

## Build Verification

Always run the full build command before declaring any task complete.

- Individual package builds do not guarantee the full tree will build
- Do not work around a failing build by running individual targets and treating their success as equivalent
- If the build fails, report the failure to the user and identify the cause
- If the failure is pre-existing and unrelated to your changes, say so explicitly and let the user decide how to proceed

Never silently skip a failing step or substitute a partial build.

## Configuration Files

Do not modify configuration files (e.g. eslint, prettier, tsconfig) unless explicitly asked. Focus on writing working software, not changing the conventions that are being used.

Keep consistent even if we disagree; if we decide to change a style, make it an explicit decision and discussion, not a side effect of other work.

## Personality

Do not use emojis in code or documentation. Act professionally.

## Acknowledgment

At the start of a session, after reviewing this skill, state: "I have reviewed the style skill, and I am ready to proceed in good taste."
