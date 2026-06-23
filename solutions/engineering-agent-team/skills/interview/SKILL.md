---
name: interview
argument-hint: "<topic>[; <context>]"
description: Conduct an iterative multiple-choice interview using AskUserQuestion. Returns the Q&A inline. Use as a utility when a caller needs structured user input on a topic.
tools:
  - AskUserQuestion
---

# Interview

Use this skill to gather user input on a topic by asking multiple-choice questions in batches via `AskUserQuestion`. Return the questions and answers in the conversation. The caller decides what to do with them.

This is a utility, not a planner. It does not decide what to build, write any files, or invoke other skills.

## Argument

`<topic>[; <context>]`

- **Topic** — what the interview is about
- **Context** (optional) — facts already known. Treat each as an answered dimension; do not re-ask things context settles.

If no topic is given, ask for one before proceeding.

## Process

### Identify dimensions to probe

Enumerate the open questions worth asking, drawn from the topic and context. Skip dimensions the context already settles. Add domain-specific ones where relevant. There is no fixed dimension list — the topic determines it.

Probe objective and priorities before details. They shape every later question, so anchoring them early prevents reshuffling halfway through.

### Ask in batches

Each round uses `AskUserQuestion`. Refer to the tool's own documentation for parameter limits and multi-select behavior.

**Quality bar for options:**

- Mutually exclusive and concrete — not "yes / no / maybe"
- Each option a real, defensible choice — not a strawman
- Descriptions surface trade-offs ("simpler but less flexible", "consistent with existing patterns")
- Ground options in the topic and context — do not invent generic options when concrete ones exist
- Multi-select only when the dimension genuinely permits it
- If you have a recommendation, put it first and label it

**Batching:**

- Default 2–4 questions per round, bundling dimensions that do not depend on each other
- Drop to 1 question only when the next question's text or options cannot be authored without this answer
- Referencing a prior answer inside a later question's text is fine

### Decide when to stop

Stop when:

- Every open dimension has been answered or marked out of scope
- Remaining unknowns are details the caller can reasonably decide
- The user has signalled fatigue (declines to choose, short non-substantive "Other" answers, asks to wrap up)
- The topic has shifted into territory outside this interview's scope

There is no fixed round cap. Stop when the marginal value of another round is low. If the caller passed an explicit cap, honour it.

### Handle trouble

- **Contradiction with a prior answer.** Ask one clarifying question that surfaces both choices directly. Record the resolution; do not silently overwrite.
- **"Other" reveals a missing dimension.** Add it to the dimension list and continue.
- **Topic shift.** If the user's answers reframe the topic itself, stop, emit what you have, and tell the caller the topic has changed.
- **No objective to anchor on.** If the user is fundamentally undecided about the topic's objective itself (not just details), stop without a findings list. Tell the caller what you learned, why you stopped, and what they should consider doing instead.

### Return findings

When the interview ends, emit the Q&A inline as a numbered list of question → answer pairs. Format:

```
## Interview findings: <topic>

1. <question>: <answer>
2. <question>: <answer>
3. <question>: <answer (multi-select)> — <answer>
```

If the user declined some questions or punted a dimension, note it in the same list:

```
4. <question>: deferred (user said "you decide")
```

Do not invent a structured summary on top of this. The caller decides what to do with the findings.

After emitting the findings, stop. Do not load other skills, invoke other agents, or write any file.

## Worked example

**Invocation:** `skill(name="interview", arguments="notification system; backend is Node/Postgres, internal users only, must integrate with existing auth")`

**Round 1** (3 questions, bundled because none depends on the others):

```
AskUserQuestion([
  { header: "Goal", question: "What is the primary goal of the notification system?",
    options: [
      { label: "Alert on critical events", description: "Errors, security issues, SLA breaches" },
      { label: "Keep users informed of activity", description: "Mentions, replies, updates" },
      { label: "Drive user re-engagement", description: "Digests, reminders, summaries" } ] },
  { header: "Priorities", question: "If you had to pick one, which matters most?",
    options: [
      { label: "Reliability of delivery", description: "Never miss a notification, even if delayed" },
      { label: "Latency", description: "Real-time, even if some are dropped under load" },
      { label: "User control", description: "Fine-grained per-event opt-in/out" } ] },
  { header: "Channels", question: "Which delivery channels do you want?", multiSelect: true,
    options: [
      { label: "In-app", description: "Notification center in the UI" },
      { label: "Email", description: "Per-event or digest" },
      { label: "Webhook", description: "Outbound HTTP to a user-configured endpoint" } ] }
])
```

**Hypothetical answers:** Alert on critical events; Reliability of delivery; In-app + Email.

**Round 2** builds on round 1 (e.g. email cadence, failure handling). Once no obvious questions remain, emit the findings list and stop.

## Style

- Do not lecture between rounds. A short orientation sentence is fine.
- Do not summarize the user's answers back at them mid-interview.
- Do not ask leading questions.

## Anti-patterns

- **Interviewing yourself.** Filling in answers because they "seem obvious" — stop and ask, or note as assumption.
- **One question per round, ten rounds deep.** Batch related questions.
- **Asking about everything.** Prune dimensions that do not apply.
- **Treating "Other" as failure.** Custom answers are signal.
- **Forgetting context.** Read it. Do not re-ask things the context already settled.
- **Writing files.** This skill never writes a file. The output is conversational.
- **Invoking other skills or agents.** Emit findings and stop.
