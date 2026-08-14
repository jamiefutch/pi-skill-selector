/**
 * pi-skill-selector extension — enable/disable skills quickly.
 *
 * Usage: /skills → interactive picker; SPACE toggles the highlighted skill.
 *
 * The picker is a custom TUI component rendered via ctx.ui.custom(). Row shows
 * the scope ([global] / [project/<name>] / [npm:<package>]) and description.
 * Move with ↑/↓ and press SPACE to enable/disable the highlighted skill — the
 * ●/○ (or ✓/✗ for npm) updates live. Changes require /reload (pi caches loaded
 * skills per session).
 *
 * Folder skills are parked in dot-prefixed SIBLING dirs (e.g.
 * ~/.pi/agent/.skills-inactive) which pi never scans, so a disabled skill is
 * genuinely removed from the model prompt. npm-package skills are toggled via
 * pi package filtering in settings.json.
 */
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { migrateLegacyDisabled } from "../src/skills.js";
import { runSkillSelector } from "../src/selector.js";

export default function piSkillSelector(pi: ExtensionAPI): void {
  // One-time migration of legacy ~/.pi/agent/skills/_disabled → .skills-inactive
  const migrated = migrateLegacyDisabled();
  if (migrated > 0) {
    console.error(
      `[pi-skill-selector] Migrated ${migrated} skills from _disabled/ to .skills-inactive (no longer loaded by pi).`,
    );
  }

  pi.registerCommand("skills", {
    description: "Interactively enable/disable Pi skills — SPACE toggles the highlighted skill",
    handler: async (_args, ctx: ExtensionCommandContext) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/skills requires TUI mode", "error");
        return;
      }
      const result = await runSkillSelector(ctx.ui, ctx.cwd);
      if (result.changes.length === 0) {
        return;
      }
      const summary = result.changes.join("\n");
      ctx.ui.notify(`${summary}\n\nRun /reload to apply.`, "info");
    },
  });
}
