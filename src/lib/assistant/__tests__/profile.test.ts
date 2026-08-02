import { beforeEach, describe, expect, it } from "vitest";
import { buildProfileDigest, buildSystemPrompt } from "../profile";
import { adminData, slugify } from "@/lib/admin-data";

/**
 * These guard the assistant's grounding contract. If the digest silently stops
 * carrying a section, the assistant does not error — it just starts saying
 * "I don't have that information" about things that are plainly on the page,
 * or worse, fills the gap itself. Cheap to assert, expensive to miss.
 */

beforeEach(() => {
  localStorage.clear();
});

describe("buildProfileDigest", () => {
  it("carries every section a recruiter asks about", () => {
    const digest = buildProfileDigest();
    for (const heading of [
      "## Identity",
      "## About",
      "## Experience",
      "## Skills",
      "## Education",
      "## Certifications",
      "## Projects",
    ]) {
      expect(digest).toContain(heading);
    }
  });

  it("includes every project, with the slug the show_project tool needs", () => {
    const digest = buildProfileDigest();
    const projects = adminData.getProjects();

    expect(projects.length).toBeGreaterThan(0);
    for (const project of projects) {
      expect(digest).toContain(project.title);
      expect(digest).toContain(`slug: ${slugify(project.title)}`);
    }
  });

  it("prefers the long description when a project has one", () => {
    const digest = buildProfileDigest();
    const detailed = adminData.getProjects().find((p) => p.longDescription);
    expect(detailed).toBeDefined();
    expect(digest).toContain(detailed!.longDescription!);
  });

  it("includes each experience bullet, since those are the substance", () => {
    const digest = buildProfileDigest();
    for (const role of adminData.getExperience()) {
      expect(digest).toContain(role.company);
      for (const bullet of role.bullets) expect(digest).toContain(bullet);
    }
  });

  it("includes contact details the assistant is told to fall back on", () => {
    const digest = buildProfileDigest();
    const links = adminData.getSocialLinks();
    expect(digest).toContain(links.email);
    expect(digest).toContain(links.github);
  });

  it("omits links that are not configured rather than emitting empty ones", () => {
    // LinkedIn ships empty; an empty label would invite the model to invent one.
    const digest = buildProfileDigest();
    expect(digest).not.toMatch(/LinkedIn:\s*$/m);
  });

  it("reflects edits made through the admin panel", () => {
    adminData.setProjects([
      {
        id: "x",
        title: "Totally New Thing",
        description: "A description that exists nowhere else.",
        tech: ["Rust"],
        status: "Terminé",
        category: "Personnel",
      },
    ]);

    const digest = buildProfileDigest();
    expect(digest).toContain("Totally New Thing");
    expect(digest).toContain("slug: totally-new-thing");
  });
});

describe("buildSystemPrompt", () => {
  it("states the grounding rule and embeds the digest", () => {
    const prompt = buildSystemPrompt("DIGEST-BODY", null);
    expect(prompt).toContain("DIGEST-BODY");
    expect(prompt.toLowerCase()).toContain("only from the profile data");
    expect(prompt.toLowerCase()).toContain("never guess");
  });

  it("adds tour context only when there is some", () => {
    expect(buildSystemPrompt("D", null)).not.toContain("CURRENT CONTEXT");

    const withContext = buildSystemPrompt("D", "They are watching the Aptiv project.");
    expect(withContext).toContain("CURRENT CONTEXT");
    expect(withContext).toContain("Aptiv");
  });

  it("tells the model to use the tool for the CV rather than describing it", () => {
    expect(buildSystemPrompt("D", null)).toContain("send_cv");
  });
});
