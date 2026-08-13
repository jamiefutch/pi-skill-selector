/**
 * pi-skill-selector — shared skill discovery/toggling utilities.
 *
 * Skills are moved between an ACTIVE dir (scanned by pi) and an INACTIVE
 * dir (a dot-prefixed SIBLING that pi never scans), so disable genuinely
 * removes a skill from the model prompt.
 *
 * Active   dirs (scanned by pi):
 *   - global :  ~/.pi/agent/skills
 *   - project:  <cwd>/.pi/skills
 * Inactive dirs (dot-prefixed sibling, ignored by pi):
 *   - global :  ~/.pi/agent/.skills-inactive
 *   - project:  <cwd>/.pi/.skills-inactive
 */
import { homedir } from "node:os";
import { join, basename } from "node:path";
import { readdirSync, existsSync, mkdirSync, renameSync, readFileSync } from "node:fs";

/** Compute the agent root. Honours the PI_AGENT_ROOT env var (proxying for
   tests/CI) and otherwise derives it from the user's home. */
function agentRoot(): string {
  const env = process.env.PI_AGENT_ROOT;
  if (env) return join(env, "agent");
  return join(homedir(), ".pi", "agent");
}

/** Active + inactive dir pairs, keyed by scope. */
export type SkillScope = "global" | "project";

export interface ScopeLocation {
  scope: SkillScope;
  project?: string;
  active: string;   // scanned by pi
  inactive: string; // dot-prefixed sibling, NOT scanned by pi
}

/** The "." prefix here is what keeps pi from recursing into the folder. */
export const INACTIVE_DIR_NAME = ".skills-inactive";

/** Helper folders inside a skills dir that are NOT skills and must be ignored. */
const IGNORED_SKILL_DIR_NAMES = new Set([
  ".skills-inactive",
  /* legacy: pi-skill-manager used a non-dot "_disabled" subfolder, which pi
     actually RECURSES INTO and loads, so it must never be shown or toggled. */
  "_disabled",
]);

export interface SkillInfo {
  name: string;
  enabled: boolean;
  scope: SkillScope;
  project?: string;
  description?: string;
}

/**
 * Resolve the active/inactive dir pair for a scope.
 * For "project", `cwd` is the project root whose `.pi/skills` pi loads.
 */
export function resolveScopeLocation(scope: SkillScope, cwd?: string): ScopeLocation {
  if (scope === "project") {
    const project = cwd ?? process.cwd();
    return {
      scope: "project",
      project,
      active: join(project, ".pi", "skills"),
      inactive: join(project, ".pi", INACTIVE_DIR_NAME),
    };
  }
  return {
    scope: "global",
    active: join(agentRoot(), "skills"),
    inactive: join(agentRoot(), INACTIVE_DIR_NAME),
  };
}

/** Convenience: the scope location this extension manages. */
export function managedScopes(cwd?: string): ScopeLocation[] {
  return [
    resolveScopeLocation("global", cwd),
    resolveScopeLocation("project", cwd),
  ];
}

export function ensureScopeDirs(loc: ScopeLocation): void {
  if (loc.scope === "global" && !existsSync(loc.active)) {
    mkdirSync(loc.active, { recursive: true });
  }
  if (!existsSync(loc.inactive)) {
    mkdirSync(loc.inactive, { recursive: true });
  }
}

/**
 * Migrate the legacy ~/.pi/agent/skills/_disabled folder (from pi-skill-manager,
 * which pi erroneously recurses into) into the correct non-scanned sibling
 * ~/.pi/agent/.skills-inactive. Returns the number of skills moved.
 */
export function migrateLegacyDisabled(): number {
  const legacy = join(agentRoot(), "skills", "_disabled");
  const targetRoot = join(agentRoot(), INACTIVE_DIR_NAME);
  if (!existsSync(legacy)) return 0;
  mkdirSync(targetRoot, { recursive: true });
  let count = 0;
  for (const entry of readdirSync(legacy, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;
    const from = join(legacy, entry.name);
    const to = join(targetRoot, entry.name);
    if (existsSync(to)) continue;
    try {
      renameSync(from, to);
      count++;
    } catch { /* skip unreadable */ }
  }
  return count;
}

function readSkillDescription(skillPath: string): string {
  const skillMd = join(skillPath, "SKILL.md");
  if (existsSync(skillMd)) {
    const content = readFileSync(skillMd, "utf8");
    // description may be in frontmatter (?--- ... ---) or top of file
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    const header = fmMatch ? fmMatch[1] : content;
    const descMatch = header.match(/^description:\s*(.+)$/m);
    if (descMatch) return descMatch[1].trim();
  }
  return "";
}

function collectDirSkills(dir: string, enabled: boolean, loc: ScopeLocation): SkillInfo[] {
  const out: SkillInfo[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      // never surface hidden helper dirs
      // skip the legacy "_disabled" helper folder and any dot-prefixed dir
      if (IGNORED_SKILL_DIR_NAMES.has(entry.name)) continue;
      if (entry.name.startsWith(".")) continue;
      out.push({
        name: entry.name,
        enabled,
        scope: loc.scope,
        ...(loc.project ? { project: loc.project } : {}),
        description: readSkillDescription(join(dir, entry.name)),
      });
    }
  }
  return out;
}

export function getAllSkills(cwd?: string): SkillInfo[] {
  const skills: SkillInfo[] = [];
  for (const loc of managedScopes(cwd)) {
    ensureScopeDirs(loc);
    skills.push(...collectDirSkills(loc.active, true, loc));
    skills.push(...collectDirSkills(loc.inactive, false, loc));
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

/** Build the {active,inactive} pair for a given skill's scope. */
function skillDirs(skill: Pick<SkillInfo, "name" | "scope" | "project">, cwd?: string): { active: string; inactive: string } {
  const loc = resolveScopeLocation(skill.scope, skill.project ?? cwd);
  return { active: join(loc.active, skill.name), inactive: join(loc.inactive, skill.name) };
}

/**
 * Toggle a skill. Returns a structured result so the caller can notify.
 */
export function moveSkill(
  name: string,
  enable: boolean,
  cwd?: string,
): { success: boolean; message: string } {
  const skills = getAllSkills(cwd);
  const skill = skills.find(
    (s) => s.name === name && s.enabled !== enable,
  );

  if (!skill) {
    return {
      success: false,
      message: `Skill "${name}" not found or already ${enable ? "enabled" : "disabled"}.`,
    };
  }

  const dirs = skillDirs(skill, cwd);
  const from = enable ? dirs.inactive : dirs.active;
  const to = enable ? dirs.active : dirs.inactive;

  if (!existsSync(from)) {
    return { success: false, message: `Skill "${name}" is already ${enable ? "active" : "inactive"}.` };
  }

  try {
    if (!existsSync(join(to, ".."))) mkdirSync(join(to, ".."), { recursive: true });
    renameSync(from, to);
    const scope = skill.scope === "project" ? `project/${skill.project}` : "global";
    return {
      success: true,
      message: `${enable ? "Enabled" : "Disabled"} skill: ${name} (${scope}) — run /reload to apply.`,
    };
  } catch (e) {
    const action = enable ? "enable" : "disable";
    return { success: false, message: `Failed to ${action} skill: ${e}` };
  }
}

/** Human-readable one-line description of a skill's scope (for the list). */
export function scopeLabel(skill: Pick<SkillInfo, "scope" | "project">): string {
  if (skill.scope === "project") {
    const name = basename(skill.project ?? "");
    return name ? `project/${name}` : "project";
  }
  return "global";
}

export function formatSkillList(skills: SkillInfo[]): string {
  if (skills.length === 0) return "  (none)";
  return skills
    .map((s) => `  ${s.enabled ? "●" : "○"} ${s.name}  [${scopeLabel(s)}]  ${s.description ?? ""}`.trimEnd())
    .join("\n");
}

/** Absolute on-disk path of where a skill currently lives. */
export function skillPath(skill: SkillInfo, cwd?: string): string {
  const loc = resolveScopeLocation(skill.scope, skill.project ?? cwd);
  const base = skill.enabled ? loc.active : loc.inactive;
  return join(base, skill.name);
}
