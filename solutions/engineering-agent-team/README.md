# Engineering Agent Team

A downloadable, opinionated multi-agent team for software work — an example of the kind of agent org Corbits can help you build and deploy.

The team divides engineering work the way a real one does: a project manager who plans and delegates, a senior engineer who reviews architecture, a critic who tests assumptions, an intern who does the mechanical legwork, and a resident pedant for comic relief (and as a demonstration of a locked-down, read-only reviewer).

## The team

| Agent | Role | Mode |
| ----- | ---- | ---- |
| `karen` | Project manager. Breaks goals into parallel work, orchestrates the other agents, escalates blockers. Never writes code herself. | primary |
| `greybeard` | Seasoned engineer. Reviews architecture and plans, delegates legwork, gives battle-tested feedback. | subagent |
| `critique` | Critical reviewer. Reads code, writes throwaway tests to verify behavior, reports issues with evidence — never fixes them. | subagent |
| `intern` | Mechanical executor. Runs builds, tests, and git commands exactly as told; stops and asks the moment anything is ambiguous. | subagent |
| `neckbeard` | Pedantic read-only reviewer. Maximally annoying nitpicks and Rust evangelism. Included as a bonus and as a demo of a deny-by-default permission set. | subagent |

## Using it

The package ships both the agents and the skills they rely on. Each agent is a single Markdown file with frontmatter under [`agents/`](./agents); each skill lives under [`skills/`](./skills) as a `SKILL.md`. The frontmatter uses the `mode` / `permission` shape from Claude Code / OpenCode plugins.

```bash
# example: into an OpenCode project
mkdir -p .opencode/agent .opencode/skill
cp agents/*.md .opencode/agent/
cp -r skills/* .opencode/skill/
```

Then start a session with `karen` and give her a goal — she handles the rest by dispatching the others.

## What's included

Agents (`agents/`): `karen`, `greybeard`, `critique`, `intern`, `neckbeard`.

Skills (`skills/`), loaded by the agents on startup:

- `style` — coding conventions for clean, maintainable code
- `philosophy` — engineering principles and work culture
- `dispatch` — Karen's parallel subagent orchestration
- `interview` — structured multiple-choice discovery

## One external piece

The agents also reference an `AGENTS.md` at the host project's root for project-specific constraints (Karen reads it when extracting quality gates). That file is intentionally not bundled — it belongs to whatever project you drop this team into. The agents load fine without it; Karen just skips the project-specific gates.
