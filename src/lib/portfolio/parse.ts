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

/** builder.py's MAX_TITLE_CHARS. */
const MAX_TITLE_CHARS = 70;

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

/**
 * Values the PDF renderer discards, and this must too.
 *
 * A model handed a four-column entry format and only three facts fills the
 * fourth with the column's own name — printing "Manager — Company Name" above
 * a location line reading "Location". `builder.py` strips these at render
 * time (`_PLACEHOLDERS`), so the PDF never shows them; the portfolio did,
 * because it read the same draft without the same scrub. Somebody's public
 * page announced they worked at "Company Name".
 *
 * Deliberately a copy of the Python set rather than something cleverer: these
 * two lists have to agree, and the only way that stays true is if a change to
 * one is an obvious change to the other. Not covered by the ingest-time
 * scrubber in `cv/verify.py` — that catches "your company" and "lorem ipsum",
 * and leaves the bare column names precisely because `builder.py` handles
 * them.
 */
const PLACEHOLDERS = new Set([
  "company name", "company", "employer", "employer name", "organisation",
  "organization", "location", "city", "city, country", "address",
  "job title", "role", "position", "title", "your name", "full name",
  "school", "school name", "university", "institution", "degree",
  "n/a", "na", "tbd", "tba", "unknown", "none", "-", "--", "...",
  "xxx", "xx", "date", "dates", "year", "years",
]);

/** Mirrors `_is_placeholder`: bracket-stripped, and anything left with no
 *  letter or digit at all counts too (a stray "." left behind by the ingest
 *  scrubber is as empty as an empty string). */
export function isPlaceholder(text: string): boolean {
  const cleaned = (text || "").trim().replace(/^[[({<]+|[\])}>]+$/g, "").trim().toLowerCase();
  if (PLACEHOLDERS.has(cleaned)) return true;
  return !/[\p{L}\p{N}]/u.test(cleaned);
}

function dropPlaceholder(text: string): string {
  return isPlaceholder(text) ? "" : text || "";
}

/**
 * Pipes and loose hyphens become the em dash the PDF prints.
 *
 * `_as_pair` in builder.py, and it exists for a failure its own docstring
 * describes: a pipe is the column delimiter for an *entry*, so in a flat
 * one-per-line field it is only ever a separator the model reached for by
 * analogy — and without this it reaches the page verbatim, printing
 * "Certificate | Issuer | 2026" where the PDF prints "Certificate — Issuer".
 */
function asPair(text: string): string {
  return (text || "").replace(/\|/g, "—").replace(/\s+[-–—]\s+/g, " — ");
}

/** `_as_range`: the first loose separator in a date span is an en dash, and
 *  any further one is a mid dot — "2024 - 2025 - 1 month" → "2024 – 2025 · 1
 *  month". Split-and-rejoin, not two passes, because a second pass would
 *  rewrite the dash the first one just inserted. */
function asRange(text: string): string {
  const parts = (text || "").split(/\s+[-–—]\s+/);
  if (parts.length < 2) return text || "";
  return [`${parts[0]} – ${parts[1]}`, ...parts.slice(2)].join(" · ");
}

/**
 * Non-empty, trimmed lines with bullet markers removed and placeholders
 * dropped. `_lines_of` in builder.py, including its `lstrip("-*• ")` — a run
 * of markers, not just one.
 */
export function lines(block: string): string[] {
  return (block || "")
    .split("\n")
    .map((line) => line.trim().replace(/^[-*•\s]+/, "").trim())
    .filter((line) => line && !isPlaceholder(line));
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

  // `_polish_entries`: drop the column names a model fills empty slots with,
  // normalise the separators, and demote an absurdly long "title" into a
  // note. Without this the page shows "Manager — Company Name" over a meta
  // line reading "Location" while the PDF, from the same draft, shows
  // "Manager".
  for (const entry of entries) {
    entry.title = dropPlaceholder(entry.title);
    entry.org = dropPlaceholder(entry.org);
    entry.dates = asRange(dropPlaceholder(entry.dates));
    // `_as_peers`: rejoin the surviving parts with ", " exactly as the Python
    // does, and only then turn a loose hyphen into a mid dot. Joining with
    // the dot directly rewrote "Tangier, Morocco" into "Tangier · Morocco".
    entry.meta = dropPlaceholder(entry.meta)
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part && !isPlaceholder(part))
      .join(", ")
      .replace(/\s+[-–—]\s+/g, " · ");
    entry.bullets = entry.bullets.filter((bullet) => !isPlaceholder(bullet));
    entry.notes = entry.notes.filter((note) => !isPlaceholder(note));

    // A title is drawn on one line in the PDF; anything past this is not a
    // title but a collapsed block, and notes wrap where a title does not.
    if (entry.title.length > MAX_TITLE_CHARS) {
      entry.notes = [entry.title, ...entry.notes];
      entry.title = "";
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
  // `_split_lead`'s list, in its order: a bare em dash (not a spaced one),
  // then " - ", then ": ". The en dash is ours — builder.py's `_as_range`
  // emits one, so a draft round-tripped through a rebuild can contain it —
  // and it goes after the em dash so the orders still agree where they
  // overlap.
  for (const separator of ["—", " – ", " - ", ": "]) {
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

/**
 * Certifications and languages, which the PDF passes through `_as_pair`
 * first: pipes and loose hyphens become em dashes.
 *
 * Returned as whole lines rather than lead/rest pairs because that is what
 * the PDF does with them — `builder.py` passes `(text, "")`, so the renderer
 * takes its unbolded branch. The comment there says why: "the issuer is not a
 * headline the way a project name is, so nothing here is set in bold."
 * Splitting them would contradict a documented decision, and would have
 * emboldened half of every certification on the published page.
 */
export function parsePairLines(block: string): string[] {
  return lines(block).map(asPair);
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
