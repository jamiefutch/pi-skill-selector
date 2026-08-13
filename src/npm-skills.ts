/**
 * npm-package skills support for pi-skill-selector.
 *
 * Some skills ship INSIDE installed pi packages under
 *   ~/.pi/agent/npm/node_modules/<package>/skills/<name>/SKILL.md
 * (e.g. context-mode's ctx-*, pi-loop-police's helpers). Those folders must
 * NOT be moved or deleted — `pi update`/reinstall rewrites the package and
 * would restore them (and a manual move can corrupt the install).
 *
 * Instead we toggle them via pi's PACKAGE FILTERING: an object-form entry in
 * ~/.pi/agent/settings.json "packages" with a `skills` array of `+`/`-`
 * exact paths. Filters "layer on top of the manifest and narrow down what is
 * already allowed", so:
 *   - omit skills/extensions/prompts/themes  → load all of that type
 *   - "+skills/x/SKILL.md" force-includes    (explicitly enabled)
 *   - "-skills/x/SKILL.md" force-excludes    (explicitly disabled)
 *
 * We write a fully-specified `+`/`-` list only for packages that have any
 * disabled skill; packages with all skills enabled stay as plain strings.
 */
import { readdirSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

export interface NpmSkill {
  name: string;
  package: string;
  enabled: boolean;
  description?: string;
}

/** One entry in settings.json "packages": a source string OR an object with a source. */
export type PackageEntry = string | Record<string, unknown>;

export interface SettingsPackages {
  /** Read/write the packages array found in settings.json. */
  load(): PackageEntry[];
  save(packages: PackageEntry[]): void;
}

/** Path to the settings file (allows env override for tests). */
function settingsPath(): string {
  const root = process.env.PI_AGENT_ROOT ? join(process.env.PI_AGENT_ROOT, "agent") : join(process.env.HOME || "", ".pi", "agent");
  return join(root, "settings.json");
}

function defaultIo(): SettingsPackages {
  return {
    load() {
      const p = settingsPath();
      if (!existsSync(p)) return [];
      try {
        const s = JSON.parse(readFileSync(p, "utf8"));
        return Array.isArray(s?.packages) ? (s.packages as PackageEntry[]) : [];
      } catch {
        return [];
      }
    },
    save(packages: PackageEntry[]) {
      const p = settingsPath();
      const data = existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {};
      data.packages = packages;
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf8");
    },
  };
}

/** npm install root where user-installed packages live. */
export function npmPackagesRoot(): string {
  const root = process.env.PI_AGENT_ROOT ? join(process.env.PI_AGENT_ROOT, "agent") : join(process.env.HOME || "", ".pi", "agent");
  return join(root, "npm", "node_modules");
}

/** All npm package directories that contain a skills/ folder. */
function packagesWithSkills(io: SettingsPackages): string[] {
  const root = npmPackagesRoot();
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(root, e.name, "skills")))
    .map((e) => e.name)
    .sort();
}

/**
 * Discover skill dirs inside a package's skills/ folder following pi's rule:
 * a directory containing SKILL.md IS a skill (its path becomes the toggle unit);
 * sibling/reference .md files are NOT skills. Recurses but does not descend
 * into a dir that already contains SKILL.md. Returns rel paths like
 * "skills/context-mode/SKILL.md".
 */
function manifestSkillPaths(pkgRoot: string): string[] {
  const rel: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    if (!existsSync(dir)) return;
    if (existsSync(join(dir, "SKILL.md"))) {
      rel.push(`${prefix}SKILL.md`);
      return; // skill root — do not recurse further (matches pi)
    }
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory() && !e.name.startsWith(".")) {
        walk(join(dir, e.name), `${prefix}${e.name}/`);
      }
    }
  };
  walk(join(pkgRoot, "skills"), "skills/");
  return rel.sort();
}

function readDescription(pkgRoot: string, relPath: string): string {
  const file = join(pkgRoot, relPath);
  if (!existsSync(file)) return "";
  try {
    const content = readFileSync(file, "utf8");
    const fm = content.match(/^---\n([\s\S]*?)\n---/);
    const header = fm ? fm[1] : content;
    const d = header.match(/^description:\s*(.+)$/m);
    return d ? d[1].trim() : "";
  } catch {
    return "";
  }
}

/** Regexes matching paths that are explicitly disabled by `!`/`-` patterns. */
function disabledMatchers(entry: Record<string, unknown>): RegExp[] {
  const skills = entry?.skills;
  if (!Array.isArray(skills)) return [];
  const out: RegExp[] = [];
  for (const s of skills) {
    const str = String(s);
    const m = /^(!|-)(.+)$/.exec(str);
    if (m) out.push(globToRegExp(m[2]));
  }
  return out;
}

function globToRegExp(glob: string): RegExp {
  // Convert our skill paths: "skills/ctx-search/SKILL.md"
  // Only special chars we care about are "*" and "**". Escape the rest.
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "__DOUBLE__").replace(/\*/g, "[^/]*").replace(/__DOUBLE__/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function isPathDisabled(entry: Record<string, unknown>, relPath: string): boolean {
  const skills = entry?.skills;
  if (!Array.isArray(skills)) return false; // no filter → load all (enabled)
  if (skills.length === 0) return true;      // [] → load none (disabled)

  // Explicit +/- paths → decide by this path's own entry (default on).
  const hasPlus = skills.some((s) => String(s).startsWith("+"));
  const hasExplicit = skills.some((s) => /^[+\-!]/.test(String(s)));
  if (hasPlus) {
    // Fully-specified list: enabled iff this path is listed with "+" and not "-".
    const entryFor = skills.filter((s) => String(s).endsWith(relPath));
    if (entryFor.length === 0) return false; // not mentioned → default on (safe)
    return entryFor.some((s) => /^[-!]/.test(String(s)));
  }
  if (hasExplicit) {
    // Only negatives present → exclude matches, keep the rest.
    return disabledMatchers(entry).some((m) => m.test(relPath));
  }
  // Bare positive list → enabled only if listed exactly.
  const positives = skills.map(String);
  return !positives.includes(relPath);
}

/**
 * Discover npm-package skills and their enabled state from settings config.
 */
export function getAllNpmSkills(io: SettingsPackages = defaultIo()): NpmSkill[] {
  const packages = io.load();
  const bySource = new Map<string, Record<string, unknown>>();
  for (const p of packages) {
    if (typeof p === "object" && p !== null && typeof p.source === "string") {
      bySource.set(p.source, p);
    }
  }
  const results: NpmSkill[] = [];
  for (const pkg of packagesWithSkills(io)) {
    const pkgRoot = join(npmPackagesRoot(), pkg);
    const source = `npm:${pkg}`;
    const entry = bySource.get(source);
    for (const rel of manifestSkillPaths(pkgRoot)) {
      const name = rel.replace(/^skills\//, "").replace(/\/SKILL\.md$/, "");
      if (!name) continue;
      const enabled = !entry || !isPathDisabled(entry, rel);
      results.push({
        name,
        package: pkg,
        enabled,
        description: readDescription(pkgRoot, rel),
      });
    }
  }
  return results.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Toggle an npm-package skill by rewriting the settings.json packages entry.
 * Returns a structured result.
 */
export function toggleNpmSkill(
  pkg: string,
  skillName: string,
  enable: boolean,
  io: SettingsPackages = defaultIo(),
): { success: boolean; message: string } {
  const packages = io.load();
  const source = `npm:${pkg}`;
  const pkgRoot = join(npmPackagesRoot(), pkg);
  const relPaths = manifestSkillPaths(pkgRoot);
  const targetRel = relPaths.find((r) => r.replace(/^skills\//, "").replace(/\/SKILL\.md$/, "") === skillName);
  if (!targetRel) {
    return { success: false, message: `NPM skill "${skillName}" (${pkg}) not found.` };
  }

  // Find existing entry for this package.
  const idx = packages.findIndex((p) => (typeof p === "object" && p.source === source) || p === source);
  const existing = idx >= 0 ? packages[idx] : null;

  // Build the fully-specified +/- pattern list for every skill in the package.
  const planning = relPaths.map((rel) => {
    const name = rel.replace(/^skills\//, "").replace(/\/SKILL\.md$/, "");
    const isOn = enable && name === skillName ? true : !(name === skillName) && currentEnabled(existing, rel);
    return { rel, isOn };
  });
  const patterns = planning.map((p) => `${p.isOn ? "+" : "-"}${p.rel}`);

  // If every skill is enabled, collapse back to a plain string.
  if (patterns.every((p) => p.startsWith("+"))) {
    const next = packages.slice();
    if (idx >= 0) next[idx] = source;
    else next.push(source);
    io.save(next);
    return {
      success: true,
      message: `Enabled NPM skill: ${skillName} (${source}) — run /reload to apply.`,
    };
  }

  // Otherwise write the object form (omit extensions/prompts/themes → load all).
  const entry: Record<string, unknown> = { source, skills: patterns };
  const next = packages.slice();
  if (idx >= 0) next[idx] = entry;
  else next.push(entry);
  io.save(next);
  const label = enable ? "Enabled" : "Disabled";
  return {
    success: true,
    message: `${label} NPM skill: ${skillName} (${source}) — run /reload to apply.`,
  };
}

/** Whether a given relPath is enabled in the existing package entry. */
function currentEnabled(existing: unknown, relPath: string): boolean {
  if (typeof existing !== "object" || existing === null) return true;
  return !isPathDisabled(existing as Record<string, unknown>, relPath);
}
