/**
 * pi-skill-selector extension — enable/disable skills quickly.
 *
 * Usage:
 *   /skills        → interactive picker of active + inactive skills
 *   /skill-list    → plain text list of all skills
 *   /skill-enable  /skill-disable <name>  → toggle by name
 *   /skill-info <name>                    → show status/scope/description
 *
 * Each picker row shows the scope ([global] or [project/<name>]) and the
 * skill description. Pick a skill, then Enable or Disable it. Changes
 * require /reload (pi caches loaded skills per session).
 *
 * Inactive skills are parked in a dot-prefixed SIBLING folder
 * (e.g. ~/.pi/agent/.skills-inactive) which pi never scans, so a disabled
 * skill is genuinely removed from the model prompt.
 */
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  getAllSkills,
  moveSkill,
  scopeLabel,
  skillPath,
  migrateLegacyDisabled,
  formatSkillList,
  type SkillInfo,
} from "../src/skills.ts";

export default function piSkillSelector(pi: ExtensionAPI): void {
  // One-time migration of legacy ~/.pi/agent/skills/_disabled → .skills-inactive
  const migrated = migrateLegacyDisabled();
  if (migrated > 0) {
    console.error(
      `[pi-skill-selector] Migrated ${migrated} skills from _disabled/ to .skills-inactive (no longer loaded by pi).`,
    );
  }
  pi.registerCommand("skills", {
    description: "Interactively enable/disable Pi skills (global + current project)",
    handler: async (_args, ctx: ExtensionCommandContext) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/skills requires TUI mode", "error");
        return;
      }
      await showMenu(ctx, ctx.cwd);
    },
  });

  pi.registerCommand("skill-list", {
    description: "List all Pi skills (global + project) with enable/disable status",
    handler: async (_args, ctx: ExtensionCommandContext) => {
      const skills = getAllSkills(ctx.cwd);
      const enabled = skills.filter((s) => s.enabled);
      const disabled = skills.filter((s) => !s.enabled);
      let out = "# Pi Skills\n\n";
      out += `**Enabled (${enabled.length}):**\n${formatSkillList(enabled)}\n\n`;
      out += `**Disabled (${disabled.length}):**\n${formatSkillList(disabled)}\n\n`;
      out += `Total: ${skills.length}\n\n`;
      out += "Use `/skills` for the interactive picker, or `/skill-enable <name>` / `/skill-disable <name>`.";
      ctx.ui.notify("Skills listed in the message", "info");
      console.log(out);
    },
  });

  pi.registerCommand("skill-enable", {
    description: "Enable a disabled skill (moves it into pi's scanned skills dir)",
    handler: async (args, ctx: ExtensionCommandContext) => {
      const name = args.trim();
      if (!name) {
        ctx.ui.notify("Usage: /skill-enable <name>", "error");
        return;
      }
      const res = moveSkill(name, true, ctx.cwd);
      ctx.ui.notify(res.message, res.success ? "info" : "error");
    },
  });

  pi.registerCommand("skill-disable", {
    description: "Disable an enabled skill (moves it out of pi's scanned skills dir)",
    handler: async (args, ctx: ExtensionCommandContext) => {
      const name = args.trim();
      if (!name) {
        ctx.ui.notify("Usage: /skill-disable <name>", "error");
        return;
      }
      const res = moveSkill(name, false, ctx.cwd);
      ctx.ui.notify(res.message, res.success ? "info" : "error");
    },
  });

  pi.registerCommand("skill-info", {
    description: "Show where a skill lives, whether it is enabled, and its description",
    handler: async (args, ctx: ExtensionCommandContext) => {
      const name = args.trim();
      if (!name) {
        ctx.ui.notify("Usage: /skill-info <name>", "error");
        return;
      }
      const skills = getAllSkills(ctx.cwd);
      const skill = skills.find((s) => s.name === name);
      if (!skill) {
        ctx.ui.notify(`Skill "${name}" not found.`, "error");
        return;
      }
      ctx.ui.notify(
        `Skill: ${skill.name}\nStatus: ${skill.enabled ? "● ENABLED" : "○ DISABLED"}\nScope: ${scopeLabel(skill)}\nPath: ${skillPath(skill, ctx.cwd)}\nDescription: ${skill.description ?? ""}`,
        "info",
      );
    },
  });
}

async function showMenu(ctx: ExtensionCommandContext, cwd: string): Promise<void> {
  while (true) {
    const skills = getAllSkills(cwd);
    const enabledCount = skills.filter((s) => s.enabled).length;

    // select() takes a flat string list; encode identity + status in the label.
    const entries = new Map<string, SkillInfo>();
    for (const s of skills) {
      const label = `${s.enabled ? "●" : "○"} ${s.name}  [${scopeLabel(s)}]  ${shorten(s.description ?? "")}`;
      entries.set(label, s);
    }

    const options = [...entries.keys()];
    options.push("🔄 Refresh");
    options.push("← Exit");

    const chosen = await ctx.ui.select(
      `Skills (●=enabled ○=disabled) — ${enabledCount}/${skills.length} enabled`,
      options,
    );
    if (!chosen || chosen === "← Exit") return;
    if (chosen === "🔄 Refresh") continue;

    const skill = entries.get(chosen);
    if (!skill) continue;

    await showSkillActions(ctx, cwd, skill);
  }
}

async function showSkillActions(ctx: ExtensionCommandContext, cwd: string, skill: SkillInfo): Promise<void> {
  const action = skill.enabled ? "Disable" : "Enable";
  const choice = await ctx.ui.select(
    `${action} ${skill.name}?`,
    [
      `${action} skill  (${skill.scope === "project" ? `project/${skill.project}` : "global"})`,
      "Back to list",
    ],
  );
  if (!choice || choice.startsWith("Back")) return;

  if (choice.startsWith(action)) {
    const ok = await ctx.ui.confirm(
      `${action} "${skill.name}"?`,
      `Scope: ${scopeLabel(skill)}\nDescription: ${skill.description ?? ""}\n\nRequires /reload to take effect.`,
    );
    if (!ok) return;
    const res = moveSkill(skill.name, !skill.enabled, cwd);
    ctx.ui.notify(res.message, res.success ? "info" : "error");
  }
}

function shorten(s: string, max = 80): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
