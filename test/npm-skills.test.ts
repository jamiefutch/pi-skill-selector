import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAllNpmSkills, toggleNpmSkill, type SettingsPackages } from "../src/npm-skills";
import { getAllSkills, scopeLabel, moveSkill } from "../src/skills";

function makeIo(path: string): SettingsPackages {
  return {
    load() {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require("node:fs");
      if (!fs.existsSync(path)) return [];
      try {
        const s = JSON.parse(fs.readFileSync(path, "utf8"));
        return Array.isArray(s.packages) ? s.packages : [];
      } catch {
        return [];
      }
    },
    save(packages: unknown[]) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require("node:fs");
      const data = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, "utf8")) : {};
      data.packages = packages;
      fs.writeFileSync(path, JSON.stringify(data, null, 2));
    },
  };
}

function readPackages(path: string): unknown[] {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require("node:fs");
  return JSON.parse(fs.readFileSync(path, "utf8")).packages;
}

describe("npm-skills", () => {
  let base: string;
  let pi: string;
  let agent: string;
  let settingsFile: string;

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), "npmpsk-"));
    pi = join(base, ".pi");
    agent = join(pi, "agent");
    // fake npm package tree under <pi>/agent/npm/node_modules/<pkg>/skills/<name>/SKILL.md
    const pkgSkills = join(agent, "npm", "node_modules", "fakepkg", "skills");
    for (const name of ["alpha", "beta", "gamma"]) {
      mkdirSync(join(pkgSkills, name), { recursive: true });
      writeFileSync(join(pkgSkills, name, "SKILL.md"), `---\ndescription: Skill ${name}\n---\n`);
    }
    settingsFile = join(agent, "settings.json");
    process.env.PI_AGENT_ROOT = pi;
  });

  afterEach(() => {
    delete process.env.PI_AGENT_ROOT;
    rmSync(base, { recursive: true, force: true });
  });

  it("discovers npm skills as enabled when no filter exists", () => {
    writeFileSync(settingsFile, JSON.stringify({ packages: ["npm:fakepkg"] }));
    const all = getAllNpmSkills(makeIo(settingsFile));
    expect(all.map((s) => s.name).sort()).toEqual(["alpha", "beta", "gamma"]);
    expect(all.every((s) => s.enabled)).toBe(true);
  });

  it("disabling a skill writes a fully-specified +/- filter and marks it off", () => {
    writeFileSync(settingsFile, JSON.stringify({ packages: ["npm:fakepkg"] }));
    const io = makeIo(settingsFile);
    expect(toggleNpmSkill("fakepkg", "alpha", false, io).success).toBe(true);
    const entries = readPackages(settingsFile) as Record<string, unknown>[];
    expect(entries[0]).toMatchObject({ source: "npm:fakepkg" });
    const skills = (entries[0] as any).skills as string[];
    expect(skills).toContain("-skills/alpha/SKILL.md");
    const after = getAllNpmSkills(makeIo(settingsFile));
    expect(after.find((s) => s.name === "alpha")!.enabled).toBe(false);
    expect(after.find((s) => s.name === "beta")!.enabled).toBe(true);
  });

  it("re-enabling all skills collapses the entry back to a plain string", () => {
    writeFileSync(
      settingsFile,
      JSON.stringify({ packages: [{ source: "npm:fakepkg", skills: ["-skills/alpha/SKILL.md", "+skills/beta/SKILL.md", "+skills/gamma/SKILL.md"] }] }),
    );
    const io = makeIo(settingsFile);
    expect(toggleNpmSkill("fakepkg", "alpha", true, io).success).toBe(true);
    expect(readPackages(settingsFile)).toEqual(["npm:fakepkg"]);
  });

  it("getAllSkills includes npm skills; moveSkill routes npm toggles via config", () => {
    writeFileSync(settingsFile, JSON.stringify({ packages: ["npm:fakepkg"] }));
    const all = getAllSkills();
    const alpha = all.find((s) => s.name === "alpha");
    expect(alpha).toBeDefined();
    expect(alpha!.scope).toBe("npm");
    expect(alpha!.package).toBe("fakepkg");
    expect(scopeLabel(alpha!)).toBe("npm:fakepkg");

    // toggle via moveSkill
    expect(moveSkill("alpha", false).success).toBe(true);
    const entries = readPackages(settingsFile) as Record<string, unknown>[];
    expect((entries[0] as any).skills).toContain("-skills/alpha/SKILL.md");
    expect(getAllSkills().find((s) => s.name === "alpha")!.enabled).toBe(false);
  });
});
