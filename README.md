# pi-skill-selector

A [pi](https://pi.dev) package for quickly **adding and removing skills** from the active set.

Disabling a skill moves it out of pi's scanned skills directory into a **dot-prefixed sibling folder that pi never scans**, so a disabled skill is genuinely removed from the model prompt until re-enabled.

## Install

```bash
# From a local path (or npm once published)
pi install /path/to/pi-skill-selector
```

Then `/reload`.

## Usage

```
/skills
```

Opens an interactive picker of **all** skills, across two scopes:

- `global`   → `~/.pi/agent/skills`
- `project`  → `<cwd>/.pi/skills`

Each row shows `●`/`○` (enabled/disabled), the skill name, its scope (`[global]` or `[project/<name>]`), and its description. Pick a skill, then **Enable** or **Disable** it. Run `/reload` to apply.

### Other commands

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

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest run
```

## License

MIT
