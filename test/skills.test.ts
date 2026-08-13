import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getAllSkills,
  moveSkill,
  migrateLegacyDisabled,
  scopeLabel,
  type SkillInfo,
} from "../src/skills";

describe("pi-skill-selector core logic", () => {
  let home: string;
  let proj: string;

  function writeSkill(skillDir: string, description: string) {
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), `---\ndescription: ${description}\n---\n# ${description}\n`);
  }

  function setupSkill(opts: { scope: "global" | "project"; name: string; active: boolean; desc?: string; project?: string }) {
    const root = opts.scope === "global" ? join(home, ".pi", "agent") : join(opts.project ?? proj, ".pi");
    const dir = opts.active ? join(root, "skills", opts.name) : join(root, ".skills-inactive", opts.name);
    writeSkill(dir, opts.desc ?? opts.name);
  }

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "psel-"));
    proj = mkdtempSync(join(tmpdir(), "pselproj-"));
    // The module reads PI_AGENT_ROOT (env) before homedir(), so point it at
    // the temp agent root to isolate tests from the real ~/.pi.
    process.env.PI_AGENT_ROOT = join(home, ".pi");
  });

  afterEach(() => {
    delete process.env.PI_AGENT_ROOT;
    rmSync(home, { recursive: true, force: true });
    rmSync(proj, { recursive: true, force: true });
  });

  it("lists active skills across global and project scope", () => {
    setupSkill({ scope: "global", name: "alpha", active: true });
    setupSkill({ scope: "project", name: "gamma", active: true, project: proj });
    const skills = getAllSkills(proj);
    const names = skills.map((s) => s.name).sort();
    expect(names).toEqual(["alpha", "gamma"]);
    expect(skills.every((s) => s.enabled)).toBe(true);
  });

  it("splits active and inactive skills in the same scope", () => {
    setupSkill({ scope: "global", name: "alpha", active: true });
    setupSkill({ scope: "global", name: "beta", active: false });
    const skills = getAllSkills(proj);
    const alpha = skills.find((s) => s.name === "alpha")!;
    const beta = skills.find((s) => s.name === "beta")!;
    expect(alpha.enabled).toBe(true);
    expect(beta.enabled).toBe(false);
    expect(alpha.scope).toBe("global");
    expect(beta.scope).toBe("global");
  });

  it("disables and re-enables a global skill by moving folders", () => {
    setupSkill({ scope: "global", name: "alpha", active: true });
    expect(moveSkill("alpha", false).success).toBe(true);
    let skills = getAllSkills(proj);
    expect(skills.find((s) => s.name === "alpha")!.enabled).toBe(false);
    // folder moved to the dot-prefixed inactive sibling
    const inactiveDir = join(home, ".pi", "agent", ".skills-inactive", "alpha");
    try {
      expect(readdirSync(join(home, ".pi", "agent", "skills"))).not.toContain("alpha");
    } catch { /* skills dir now empty */ }
    expect(readdirSync(inactiveDir)).toContain("SKILL.md");

    expect(moveSkill("alpha", true).success).toBe(true);
    skills = getAllSkills(proj);
    expect(skills.find((s) => s.name === "alpha")!.enabled).toBe(true);
  });

  it("disables and re-enables a project skill", () => {
    setupSkill({ scope: "project", name: "gamma", active: true, project: proj });
    expect(moveSkill("gamma", false, proj).success).toBe(true);
    let skills = getAllSkills(proj);
    expect(skills.find((s) => s.name === "gamma")!.enabled).toBe(false);
    expect(moveSkill("gamma", true, proj).success).toBe(true);
    skills = getAllSkills(proj);
    expect(skills.find((s) => s.name === "gamma")!.enabled).toBe(true);
  });

  it("migrates legacy _disabled folder into .skills-inactive", () => {
    writeSkill(join(home, ".pi", "agent", "skills", "_disabled", "stale"), "stale");
    const migrated = migrateLegacyDisabled();
    expect(migrated).toBe(1);
    const inactive = readdirSync(join(home, ".pi", "agent", ".skills-inactive"));
    expect(inactive).toContain("stale");
    // and it no longer surfaces as a skill
    const skills = getAllSkills(proj);
    expect(skills.some((s) => s.name === "stale" && s.enabled)).toBe(false);
  });

  it("does not list the _disabled helper folder as a skill", () => {
    writeSkill(join(home, ".pi", "agent", "skills", "_disabled", "stale"), "stale");
    const skills: SkillInfo[] = getAllSkills(proj);
    expect(skills.some((s) => s.name === "_disabled")).toBe(false);
  });

  it("renders a friendly scope label", () => {
    expect(scopeLabel({ scope: "global" })).toBe("global");
    expect(scopeLabel({ scope: "project", project: "/Users/me/myrepo" })).toBe("project/myrepo");
  });
});
