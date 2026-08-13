# pi-skill-selector

![license](https://img.shields.io/badge/license-MIT-blue.svg) ![pi-package](https://img.shields.io/badge/pi-package-00b57a)

A [pi](https://pi.dev) package for quickly **adding and removing skills** from the active set.

Disabling a skill moves it out of pi's scanned skills directory into a **dot-prefixed sibling folder that pi never scans**, so a disabled skill is genuinely removed from the model prompt until re-enabled.

## Features

- **Interactive picker** (`/skills`) —— enable/disable any skill from one list
- **Multi-scope** —— manages both your `global` skills and the **current project's** skills
- **Scope & status at a glance** —— every row shows `●`/`○`, `[global]` / `[project/<name>]`, and the description
- **Genuinely removes** disabled skills from the prompt (parked in a folder pi never scans)
- **One-time migration** of legacy `_disabled/` skills so they stop loading

## Install

As a pi package:

```bash
# From a local path
pi install /path/to/pi-skill-selector

# Once published
pi install npm:@jamiefutch/pi-skill-selector
```

Then run `/reload`.

> **Requirements:** the interactive `/skills` picker needs pi's **TUI mode**. 
> `/skill-list`, `/skill-enable`, `/skill-disable`, and `/skill-info` work in any mode.

## Usage

```
/skills
```

Opens an interactive picker of **all** skills, across two scopes. The header names the package (`pi-skill-selector`) so it's clear which tool you're using:

- `global`   → `~/.pi/agent/skills`
- `project`  → `<cwd>/.pi/skills`

Each row shows `●`/`○` (enabled/disabled), the skill name, its scope (`[global]` or `[project/<name>]`), and its description. Pick a skill, then **Enable** or **Disable** it. Run `/reload` to apply.

```
pi-skill-selector — Skills (●=enabled ○=disabled) — 8/28 enabled
  ● brainstorming   [global]  You MUST use this before any creative work...
  ○ sql-server-table-reconciliation [global]  Compare SQL Server tables...
```

| Command | Description |
|---------|-------------|
| `/skill-list` | Plain-text list of all skills with status + scope |
| `/skill-enable <name>` | Enable a skill by name |
| `/skill-disable <name>` | Disable a skill by name |
| `/skill-info <name>` | Show status, scope, path, and description |
| `/skills` | Interactive enable/disable picker |

## How it works

pi loads skills from two roots (recursively):

- `~/.pi/agent/skills` (user)
- `<cwd>/.pi/skills` (project)

pi skips dot-prefixed entries and `node_modules`, and honors `.gitignore`. This package parks inactive skills in a **dot-prefixed sibling** of each scanned root:

| Scope | Active (scanned) | Inactive (never scanned) |
|-------|-------------------|---------------------------|
| global | `~/.pi/agent/skills` | `~/.pi/agent/.skills-inactive` |
| project | `<cwd>/.pi/skills` | `<cwd>/.pi/.skills-inactive` |

A skill is toggled by moving its folder (`SKILL.md` dir) between the two, which requires a `/reload` to take effect (pi caches loaded skills per session).

> **Legacy migration:** earlier pi-skill-manager versions parked "disabled" skills in `skills/_disabled`, which pi actually **recurses into** (so they were still loaded). On first run this package automatically migrates any `_disabled/` skills into `.skills-inactive` so they're truly disabled.

## Why it's reliable

pi discovers skills by walking the two roots above and loading folders that contain a `SKILL.md`. It **skips** entries whose name starts with a dot (`.`) and anything listed in a `.gitignore`/`.ignore`.

So an inactive skill parked in a **dot-prefixed sibling** (`~/.pi/agent/.skills-inactive`) satisfies both guarantees:

1. It is **outside** the scanned root, so pi never walks into it, and
2. Even if something pointed pi at it, the leading `.` makes pi skip it.

That makes disable a real removal from the model prompt — not just a suggestion.

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest run
```

## Package details

- **Type:** ESM (`"type": "module"`)
- **Extensions:** `extensions/pi-skill-selector.ts` (declared via the `pi` manifest)
- **Core dependency:** `@earendil-works/pi-coding-agent` (peer, `"*"`)
- **Tests:** vitest — exercise listing, enable/disable (global + project), legacy migration, and scope labels using an isolated temp agent root (`PI_AGENT_ROOT`)

## License

MIT
