import { describe, expect, it } from "vitest";
import {
  initials,
  lines,
  parseContact,
  parseEntries,
  parseLeadIns,
  parseSkillGroups,
  splitLeadIn,
} from "../parse";

/**
 * These pin the portfolio's reading of the draft against the PDF renderer's.
 * Both read the same stored strings, so a difference here does not throw — it
 * quietly publishes a different CV than the one the visitor downloads.
 */

describe("parseEntries", () => {
  it("reads the pipe header, bullets and trailing notes", () => {
    const [entry] = parseEntries(
      "AI Data Engineer Intern | Aptiv | Jun 2026 - Present | Tangier, Morocco\n" +
        "- Built a KPI platform.\n" +
        "- Designed a predictive module.",
    );

    expect(entry.title).toBe("AI Data Engineer Intern");
    expect(entry.org).toBe("Aptiv");
    expect(entry.dates).toBe("Jun 2026 - Present");
    expect(entry.meta).toBe("Tangier, Morocco");
    expect(entry.bullets).toEqual([
      "Built a KPI platform.",
      "Designed a predictive module.",
    ]);
  });

  it("attaches a bare line to the entry above it rather than starting a new one", () => {
    // "Specialization: AI & Data Science" belongs under the degree. Treating
    // it as a new entry is how an education section grows a phantom second
    // qualification with no name.
    const entries = parseEntries(
      "Engineering Degree | EMSI, Casablanca | 2022\nSpecialization: AI & Data Science",
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].notes).toEqual(["Specialization: AI & Data Science"]);
  });

  it("separates several entries", () => {
    const entries = parseEntries(
      "Role A | Org A | 2024\n- did a thing\nRole B | Org B | 2025\n- did another",
    );

    expect(entries.map((entry) => entry.title)).toEqual(["Role A", "Role B"]);
    expect(entries[1].bullets).toEqual(["did another"]);
  });

  it("survives a bullet with no header above it", () => {
    const entries = parseEntries("- an orphan bullet");
    expect(entries).toHaveLength(1);
    expect(entries[0].bullets).toEqual(["an orphan bullet"]);
  });

  it("is empty for empty input, so the section can be skipped entirely", () => {
    expect(parseEntries("")).toEqual([]);
    expect(parseEntries("   \n  ")).toEqual([]);
  });
});

describe("parseSkillGroups", () => {
  it("splits labelled groups into individual items", () => {
    const groups = parseSkillGroups(
      "Languages & Frameworks: Python, Django, FastAPI\nData & ML: pandas, NumPy",
    );

    expect(groups).toEqual([
      { label: "Languages & Frameworks", items: ["Python", "Django", "FastAPI"] },
      { label: "Data & ML", items: ["pandas", "NumPy"] },
    ]);
  });

  it("continues the previous group for a wrapped line with no label", () => {
    // A long list wraps onto a second line in the source CV. That
    // continuation must not become a nameless group of its own.
    const groups = parseSkillGroups("Data: PostgreSQL, Kafka\nETL, Airflow");

    expect(groups).toHaveLength(1);
    expect(groups[0].items).toEqual(["PostgreSQL", "Kafka", "ETL", "Airflow"]);
  });

  it("keeps an unlabelled list rather than dropping it", () => {
    expect(parseSkillGroups("Python, SQL")).toEqual([
      { label: "", items: ["Python", "SQL"] },
    ]);
  });
});

describe("splitLeadIn", () => {
  it("prefers the em dash the renderer normalises to", () => {
    // builder.py rewrites " - " to " — " on the way into the PDF, so a draft
    // may hold either. Matching the hyphen first would cut in the wrong place.
    expect(splitLeadIn("Nexora AI — Call-center SaaS")).toEqual({
      lead: "Nexora AI",
      rest: "Call-center SaaS",
    });
    expect(splitLeadIn("Nexora AI - Call-center SaaS")).toEqual({
      lead: "Nexora AI",
      rest: "Call-center SaaS",
    });
  });

  it("leaves a line with no separator whole", () => {
    expect(splitLeadIn("Just a project name")).toEqual({
      lead: "Just a project name",
      rest: "",
    });
  });

  it("does not split on a hyphen inside a word", () => {
    expect(splitLeadIn("Call-center tooling").lead).toBe("Call-center tooling");
  });

  it("strips bullet markers before splitting", () => {
    expect(parseLeadIns("• Nexora AI — a thing")[0]).toEqual({
      lead: "Nexora AI",
      rest: "a thing",
    });
  });
});

describe("parseContact", () => {
  it("classifies each line so it renders as the right thing", () => {
    const items = parseContact(
      "Casablanca, Morocco\nyassinsinif4@gmail.com\ngithub.com/Inssaya\nhttps://sinif-yassine.vercel.app",
    );

    expect(items.map((item) => item.kind)).toEqual(["text", "email", "link", "link"]);
    expect(items[1].href).toBe("mailto:yassinsinif4@gmail.com");
    expect(items[2].href).toBe("https://github.com/Inssaya");
  });

  it("recognises a phone number as a phone", () => {
    const [item] = parseContact("+212 6 23 84 25 35");
    expect(item.kind).toBe("phone");
    expect(item.href).toBe("tel:+212623842535");
  });

  it("does not mistake a year range for a phone number", () => {
    expect(parseContact("2022-2027")[0].kind).toBe("text");
  });

  it("does not mistake a city for a link", () => {
    expect(parseContact("Casablanca, Morocco")[0].kind).toBe("text");
  });
});

describe("lines", () => {
  it("drops blanks and bullet markers", () => {
    expect(lines("- one\n\n• two\n  * three  ")).toEqual(["one", "two", "three"]);
  });
});

describe("initials", () => {
  it("takes at most two", () => {
    expect(initials("Yassine Sinif")).toBe("YS");
    expect(initials("Yassine Amine Sinif")).toBe("YA");
    expect(initials("Cher")).toBe("C");
    expect(initials("")).toBe("");
  });
});
