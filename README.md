# pi-skill-selector

![license](https://img.shields.io/badge/license-MIT-blue.svg) ![pi-package](https://img.shields.io/badge/pi-package-00b57a)

A [pi](https://pi.dev) package for quickly **adding and removing skills** from the active set.

Disabling a skill moves it out of pi's scanned skills directory into a **dot-prefixed sibling folder that pi never scans**, so a disabled skill is genuinely removed from the model prompt until re-enabled.

## Features

- **Interactive picker** (`/skills`) — navigate with ↑/↓ and **toggle the highlighted skill with the SPACEBAR**
- **Multi-scope** — manages your `global` skills, the **current project's** skills, and **npm-package** skills
- **Scope & status at a glance** — every row shows `●`/`○` (or `✓`/`✗` for npm), `[global]` / `[project/<name>]` / `[npm:<package>]`, and the description
- **Live feedback** — toggling updates the status on-screen immediately; a summary lists every change
- **npm-managed skills** — skills shipped inside installed pi packages (e.g. context-mode's `ctx-*`, loop-police helpers) can also be toggled, via pi's package filtering in `settings.json` (marked with 📦)
- **Genuinely removes** disabled skills from the prompt (folder skills parked in a dir pi never scans; npm skills filtered at config level)
- **One-time migration** of legacy `_disabled/` skills so they stop loading

## Install

As a pi package:

```bash
# From a local path
pi install /path/to/pi-skill-selector

# From git (no build step needed)
pi install git:github.com/jamiefutch/pi-skill-selector

# Once published
pi install npm:@jamiefutch/pi-skill-selector
```

Then run `/reload`.

> The package ships its **TypeScript source** — the `pi` manifest points at
> `extensions/`, which pi compiles on load (no `dist` build required, so git
> installs work out of the box).

> **Requirements:** the `/skills` picker is interactive and needs pi's **TUI mode**.

## Usage

```
/skills
```

Opens an interactive picker of **all** skills, across two scopes. The header names the package (`pi-skill-selector`) so it's clear which tool you're using:

- `global`   → `~/.pi/agent/skills`
- `project`  → `<cwd>/.pi/skills`

Each row shows `●`/`○` (enabled/disabled), the skill name, its scope (`[global]` or `[project/<name>]`), and its description. Move the highlight with `↑`/`↓` and press **`SPACE`** to toggle the highlighted skill — the `●`/`○` updates live. Press `Enter`/`Esc` to close; you'll get a summary of every toggle. Run `/reload` to apply.

```
pi-skill-selector — Skills (●=enabled ○=disabled) — 8/28 enabled
 → ● brainstorming   [global]  You MUST use this before any creative work...
   ○ sql-server-table-reconciliation [global]  Compare SQL Server tables...
   ↑/↓ select · SPACE toggle · Enter/Esc close
```

> Pressing **SPACE** toggles the highlighted skill immediately (the `●`/`○` flips in-place) but does **not** require you to exit the list — keep selecting. When you close the picker with `Enter`/`Esc`, a summary of all your toggles appears. Run `/reload` once to apply everything.

pi-skill-selector exposes a single command:

| Command | Description |
|---------|-------------|
| `/skills` | Interactive enable/disable picker (↑/↓ select · SPACE toggle) |

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

### npm-package skills

Some skills ship **inside installed pi packages** rather than in a skills folder you own. Those must not be moved or deleted — `pi update`/reinstall would restore them, and a manual move can corrupt the install. Instead, pi-skill-selector toggles them via pi's **package filtering**: it rewrites the package's entry in `~/.pi/agent/settings.json` with explicit `+`/`-` patterns. These are picked up on the next `/reload` and survive package updates.

npm-managed skills are shown with a 📦 marker and `✓`/`✗` status:
```
pi-skill-selector — Skills (●=enabled ○=disabled · 📦=npm) — 8/28 enabled
 → ✓ ctx-search   [📦 npm:context-mode]  Search the context-mode knowledge base...
   ✗ ctx-purge    [📦 npm:context-mode]  Purge the context-mode knowledge base...
   ↑/↓ select · SPACE toggle · Enter/Esc close   📦 = npm-managed (config-filtered)
```

> The `/skills` header shows `●`/`○` for folder skills and `✓`/`✗` for npm-managed ones. Toggling either works the same way with SPACE.

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
- **Core dependencies (peer):** `@earendil-works/pi-coding-agent` (`*`), `@earendil-works/pi-tui` (`*`)
- **Tests:** vitest — exercise listing, enable/disable (global + project), legacy migration, scope labels, and the space-bar selector, using an isolated temp agent root (`PI_AGENT_ROOT`)

## License

MIT
