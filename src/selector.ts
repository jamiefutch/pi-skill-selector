/**
 * Interactive skill selector for pi-skill-selector.
 *
 * Renders a live list of skills (active + inactive) and lets the user
 * toggle the highlighted skill with the SPACEBAR without leaving the list.
 *
 * Keys:
 *   ↑ / ↓        move the highlight
 *   Space        toggle the highlighted skill (enable ⇄ disable)
 *   Enter / Esc  close the picker
 *
 * All changes take effect after `/reload` (pi caches loaded skills per
 * session), but toggling updates the on-screen ●/○ immediately so the user
 * sees what they've staged.
 */
import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, Key, truncateToWidth } from "@earendil-works/pi-tui";
import { getAllSkills, moveSkill, scopeLabel, type SkillInfo } from "./skills.ts";

export interface SkillSelectorResult {
  /** One summary line per toggle performed. */
  changes: string[];
  dismissed: boolean;
}

/**
 * Custom TUI component. Wired into `ctx.ui.custom()` — see `runSkillSelector`.
 */
export class SkillSelector {
  private cwd: string;
  private skills: SkillInfo[] = [];
  private highlight = 0;

  /** One notification line per toggle, e.g. "Enabled test-driven-development (global)". */
  private changes: string[] = [];

  public onClose?: (result: SkillSelectorResult) => void;

  constructor(cwd: string) {
    this.cwd = cwd;
    this.refresh();
  }

  /** Re-read skills from disk, keeping the highlight pinned to the same skill. */
  private refresh(): void {
    const pinnedName = this.skills[this.highlight]?.name;
    this.skills = getAllSkills(this.cwd);
    if (pinnedName) {
      const idx = this.skills.findIndex((s) => s.name === pinnedName);
      this.highlight = idx >= 0 ? idx : 0;
    } else {
      this.highlight = 0;
    }
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.up)) {
      if (this.highlight > 0) this.highlight--;
    } else if (matchesKey(data, Key.down)) {
      if (this.highlight < this.skills.length - 1) this.highlight++;
    } else if (matchesKey(data, Key.space)) {
      this.toggleHighlighted();
    } else if (matchesKey(data, Key.enter) || matchesKey(data, Key.escape)) {
      this.onClose?.(this.result());
    }
  }

  private toggleHighlighted(): void {
    const skill = this.skills[this.highlight];
    if (!skill) return;
    const res = moveSkill(skill.name, !skill.enabled, this.cwd);
    if (res.success) {
      this.changes.push(res.message);
    }
    this.refresh();
  }

  private result(): SkillSelectorResult {
    return { changes: [...this.changes], dismissed: true };
  }

  render(width: number): string[] {
    const enabledCount = this.skills.filter((s) => s.enabled).length;
    const heading = `pi-skill-selector — Skills (●=enabled ○=disabled) — ${enabledCount}/${this.skills.length} enabled`;
    const body = this.skills.map((s, i) => {
      const sel = i === this.highlight ? "→" : " ";
      const status = s.scope === "npm" ? (s.enabled ? "✓" : "✗") : s.enabled ? "●" : "○";
      const tag = s.scope === "npm" ? `📦 ${scopeLabel(s)}` : scopeLabel(s);
      const row = `${sel} ${status} ${s.name}  [${tag}]  ${truncateDesc(s.description)}`;
      return truncateToWidth(row, width);
    });
    const footer = "  ↑/↓ select · SPACE toggle · Enter/Esc close";
    return [truncateToWidth(heading, width), "", ...body, "", truncateToWidth(footer + "   📦 = npm-managed (config-filtered)", width)];
  }

  invalidate(): void {
    this.refresh();
  }
}

/**
 * Open the interactive selector via `ctx.ui.custom` and return staged changes.
 * (Requires TUI mode — the caller should guard with `ctx.mode !== "tui"`.)
 */
export function runSkillSelector(
  ui: ExtensionUIContext,
  cwd: string,
): Promise<SkillSelectorResult> {
  return ui.custom<SkillSelectorResult>((_tui, _theme, _keybindings, done) => {
    const selector = new SkillSelector(cwd);
    selector.onClose = done;
    return {
      render: (width) => selector.render(width),
      handleInput: (data) => {
        selector.handleInput(data);
      },
      invalidate: () => selector.invalidate(),
      dispose: () => {},
    };
  });
}

function truncateDesc(s: string | undefined, max = 80): string {
  if (!s) return "";
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
