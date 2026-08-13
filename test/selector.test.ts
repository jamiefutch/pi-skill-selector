import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SkillSelector, type SkillSelectorResult } from "../src/selector";
import { getAllSkills } from "../src/skills";

const UP = "\u001b[A";
const DOWN = "\u001b[B";
const SPACE = " ";
const ENTER = "\r";
const ESCAPE = "\u001b";

function writeSkill(dir: string, desc: string) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\ndescription: ${desc}\n---\n# ${desc}\n`);
}

describe("SkillSelector (space-toggle component)", () => {
  let home: string;
  let proj: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "pselui-"));
    proj = mkdtempSync(join(tmpdir(), "pselproj-"));
    process.env.PI_AGENT_ROOT = join(home, ".pi");
    // two global skills: alpha active, beta inactive
    writeSkill(join(home, ".pi", "agent", "skills", "alpha"), "Alpha skill");
    writeSkill(join(home, ".pi", "agent", ".skills-inactive", "beta"), "Beta skill");
  });

  afterEach(() => {
    delete process.env.PI_AGENT_ROOT;
    rmSync(home, { recursive: true, force: true });
    rmSync(proj, { recursive: true, force: true });
  });

  it("renders active and inactive rows with the pi-skill-selector title", () => {
    const s = new SkillSelector(proj);
    const lines = s.render(80);
    expect(lines[0]).toContain("pi-skill-selector — Skills");
    expect(lines.join("\n")).toContain("● alpha");
    expect(lines.join("\n")).toContain("○ beta");
  });

  it("moves the highlight with up/down", () => {
    const s = new SkillSelector(proj);
    // sort: alpha, beta (alphabetical), highlight starts at 0 (alpha)
    s.handleInput(DOWN);
    const lines = s.render(80);
    // beta now highlighted (→ marker before ○ beta)
    expect(lines.join("\n")).toContain("→ ○ beta");
  });

  it("toggles the highlighted skill with SPACE", () => {
    const s = new SkillSelector(proj);
    // highlight is alpha (enabled) — pressing space should disable it
    s.handleInput(SPACE);
    const after = getAllSkills(proj);
    expect(after.find((x) => x.name === "alpha")!.enabled).toBe(false);
    expect(after.find((x) => x.name === "beta")!.enabled).toBe(false);
    // render reflects the change immediately
    expect(s.render(80).join("\n")).toContain("○ alpha");
  });

  it("collects a summary of changes and closes on Enter", () => {
    const s = new SkillSelector(proj);
    let result: SkillSelectorResult | undefined;
    s.onClose = (r) => { result = r; };
    s.handleInput(SPACE); // disable alpha
    s.handleInput(ENTER); // close
    expect(result).toBeDefined();
    expect(result!.changes.length).toBe(1);
    expect(result!.changes[0]).toMatch(/Disabled skill: alpha/);
  });
});
