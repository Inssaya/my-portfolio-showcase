/**
 * Turning the CV draft's block format into structures a page can render.
 *
 * The draft is stored as flat, line-oriented text — the same strings the PDF
 * renderer parses — so the portfolio is a second reader of one source, not a
 * second copy of the data. That is the whole reason editing a CV edits the
 * live page.
 *
 * This mirrors `parse_entries` / `_skill_groups` / `_lines_of` in
 * `cv-service/app/cv/_cvdesign.py` and `builder.py`. Keep them in step: a
 * difference here does not throw, it quietly renders a different CV than the
 * one the visitor downloads.
 */

export interface Entry {
  title: string;
  org: string;
  dates: string;
  meta: string;
  bullets: string[];
  notes: string[];
}

export interface SkillGroup {
  label: string;
  items: string[];
}

export interface LeadIn {
  /** The bit set in bold — a project name, a certification title. */
  lead: string;
  /** Everything after the separator. May be empty. */
  rest: string;
}

/** Non-empty, trimmed lines with any bullet marker removed. */
export function lines(block: string): string[] {
  return (block || "")
    .split("\n")
    .map((line) => line.trim().replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
}

/**
 * "Role | Employer | Dates | Location" headers, "- " bullets, and anything
 * else attaching to the current entry as a note.
 *
 * A line that is neither a header nor a bullet is a note rather than a new
 * entry, which is how "Specialization: AI & Data Science" sits under a degree
 * without becoming a heading of its own.
 */
export function parseEntries(block: string): Entry[] {
  const entries: Entry[] = [];
  let current: Entry | null = null;

  const blank = (title = ""): Entry => ({
    title,
    org: "",
    dates: "",
    meta: "",
    bullets: [],
    notes: [],
  });

  for (const raw of (block || "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    if (/^[-*•]\s+/.test(line)) {
      if (!current) {
        current = blank();
        entries.push(current);
      }
      current.bullets.push(line.replace(/^[-*•]\s+/, "").trim());
    } else if (line.includes("|")) {
      const parts = line.split("|").map((part) => part.trim());
      current = {
        ...blank(parts[0] ?? ""),
        org: parts[1] ?? "",
        dates: parts[2] ?? "",
        meta: parts[3] ?? "",
      };
      entries.push(current);
    } else if (!current) {
      current = blank(line);
      entries.push(current);
    } else {
      current.notes.push(line);
    }
  }

  return entries;
}

/**
 * "CATEGORY: a, b, c" per line. A bare line with no colon continues the
 * previous group — the CV renderer does the same, because a long list wraps
 * onto a second line and must not become a nameless group of its own.
 */
export function parseSkillGroups(block: string): SkillGroup[] {
  const groups: SkillGroup[] = [];

  for (const line of lines(block)) {
    const at = line.indexOf(":");
    if (at > 0) {
      groups.push({
        label: line.slice(0, at).trim(),
        items: splitItems(line.slice(at + 1)),
      });
    } else if (groups.length) {
      groups[groups.length - 1].items.push(...splitItems(line));
    } else {
      groups.push({ label: "", items: splitItems(line) });
    }
  }

  return groups.filter((group) => group.items.length);
}

function splitItems(text: string): string[] {
  return text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * "Name — what it is" → { lead, rest }.
 *
 * The separators are tried longest-first and the em/en dashes come before the
 * hyphen: `builder.py` normalises " - " to " — " on the way into the PDF, so
 * a draft can hold either, and matching the hyphen first would cut an em-dash
 * line in the wrong place.
 */
export function splitLeadIn(line: string): LeadIn {
  for (const separator of [" — ", " – ", " - ", ": "]) {
    const at = line.indexOf(separator);
    if (at > 0) {
      return {
        lead: line.slice(0, at).trim(),
        rest: line.slice(at + separator.length).trim(),
      };
    }
  }
  return { lead: line.trim(), rest: "" };
}

export function parseLeadIns(block: string): LeadIn[] {
  return lines(block).map(splitLeadIn);
}

export type ContactKind = "email" | "phone" | "link" | "text";

export interface ContactItem {
  kind: ContactKind;
  /** What to show. */
  label: string;
  /** Where it goes, or null for something that is not a link. */
  href: string | null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Anchored on a leading + or 0 like PHONE_RE in extract.py, so a year range
// is never mistaken for a number.
const PHONE = /^\+\d[\d\s.()-]{6,20}\d$|^0\d[\d\s.()-]{6,18}\d$/;
const LINK = /^(https?:\/\/|www\.)|^[\w-]+(\.[\w-]+)+\/\S*$|^(github|linkedin)\.com\//i;

/**
 * Classify each contact line so it can be rendered as the right thing.
 *
 * Note the phone case is still handled here even though the database already
 * strips phone numbers from an unpublished-phone portfolio
 * (`public_portfolio` in supabase/setup.sql). This is presentation, not the
 * privacy rule — the rule is enforced where the data leaves the server, so
 * that it holds for anyone reading the API directly rather than only for
 * people looking at the page.
 */
export function parseContact(block: string): ContactItem[] {
  return lines(block).map((line) => {
    if (EMAIL.test(line)) {
      return { kind: "email" as const, label: line, href: `mailto:${line}` };
    }
    if (PHONE.test(line)) {
      return { kind: "phone" as const, label: line, href: `tel:${line.replace(/[\s.()-]/g, "")}` };
    }
    if (LINK.test(line)) {
      const href = /^https?:\/\//i.test(line) ? line : `https://${line}`;
      return { kind: "link" as const, label: line.replace(/^https?:\/\//i, ""), href };
    }
    return { kind: "text" as const, label: line, href: null };
  });
}

/** Initials for the tab title / share card. Never rendered as an avatar —
 *  see the hero's comment on why a placeholder portrait is worse than none. */
export function initials(fullName: string): string {
  return (fullName || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
