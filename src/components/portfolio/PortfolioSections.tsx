import { ReactNode } from "react";
import type { ThemeTokens } from "@/lib/portfolio/themes";
import {
  Entry,
  LeadIn,
  parseContact,
  parseEntries,
  parseLeadIns,
  parseSkillGroups,
  lines,
} from "@/lib/portfolio/parse";

/**
 * The pieces a published portfolio is built from.
 *
 * One rule runs through all of them: **a section with no content is not
 * rendered at all.** Not an empty heading, not a "none yet" placeholder — an
 * empty "Certifications" heading with nothing under it reads as a broken page
 * rather than as an honest absence, and these pages are generated from
 * whatever a person happened to fill in. Every section below returns null on
 * empty input, and the page never has to think about it.
 */

interface SectionProps {
  theme: ThemeTokens;
  title: string;
  children: ReactNode;
}

export const Section = ({ theme, title, children }: SectionProps) => (
  <section className="mt-14 first:mt-0 sm:mt-20">
    <h2
      className={theme.shape.heading}
      style={{ color: theme.colors.accent }}
    >
      {title}
    </h2>
    <div className="mt-5">{children}</div>
  </section>
);

// ------------------------------------------------------------------- hero ---

interface HeroProps {
  theme: ThemeTokens;
  fullName: string;
  headline: string;
  contact: string;
}

export const Hero = ({ theme, fullName, headline, contact }: HeroProps) => {
  const items = parseContact(contact);

  return (
    <header>
      {/* Text-only, with no portrait and no placeholder standing in for one.
          Portrait bytes are never persisted (see supabase/setup.sql), so a
          published page has no photo to show — and a generic silhouette or an
          initials disc in the space where a face should be reads as a
          failed image, which is worse for the person than simply not having
          one. The layout is designed around its absence rather than
          apologising for it. */}
      <h1
        className="text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl"
        style={{ fontFamily: theme.fonts.heading, color: theme.colors.text }}
      >
        {fullName}
      </h1>

      {headline && (
        <p
          className="mt-3 max-w-2xl text-lg font-semibold sm:text-xl"
          style={{ color: theme.colors.accent }}
        >
          {headline}
        </p>
      )}

      {items.length > 0 && (
        <ul className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          {items.map((item, index) => (
            <li key={`${item.label}-${index}`} className="max-w-full">
              {item.href ? (
                <a
                  href={item.href}
                  // Portfolio links point at the person's own profiles; noopener
                  // is still correct, and nofollow keeps a generated page from
                  // being an SEO gift to anything they linked.
                  rel="noopener noreferrer nofollow"
                  target={item.kind === "link" ? "_blank" : undefined}
                  className="break-all underline-offset-4 transition-opacity hover:opacity-70 hover:underline focus-visible:underline focus-visible:outline-none"
                  style={{ color: theme.colors.muted }}
                >
                  {item.label}
                </a>
              ) : (
                <span className="break-words" style={{ color: theme.colors.muted }}>
                  {item.label}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </header>
  );
};

// ---------------------------------------------------------------- profile ---

export const Profile = ({ theme, text }: { theme: ThemeTokens; text: string }) => {
  const body = (text || "").trim();
  if (!body) return null;

  return (
    <Section theme={theme} title="About">
      {/* Capped in ch, not px: the constraint that matters for reading is
          characters per line, and it holds whatever the font size ends up. */}
      <p
        className="max-w-[65ch] text-[15px] leading-relaxed sm:text-base"
        style={{ color: theme.colors.text }}
      >
        {body}
      </p>
    </Section>
  );
};

// ------------------------------------------------------------- experience ---

const EntryBlock = ({ theme, entry }: { theme: ThemeTokens; entry: Entry }) => (
  <>
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h3
        className="break-words text-base font-semibold"
        style={{ color: theme.colors.text, fontFamily: theme.fonts.heading }}
      >
        {entry.title}
        {entry.org && (
          <span style={{ color: theme.colors.accent }}> — {entry.org}</span>
        )}
      </h3>
      {entry.dates && (
        <span className="shrink-0 text-xs" style={{ color: theme.colors.muted }}>
          {entry.dates}
        </span>
      )}
    </div>

    {entry.meta && (
      <p className="mt-1 text-xs" style={{ color: theme.colors.muted }}>
        {entry.meta}
      </p>
    )}

    {entry.notes.map((note, index) => (
      <p key={`${note}-${index}`} className="mt-2 max-w-[65ch] text-sm" style={{ color: theme.colors.text }}>
        {note}
      </p>
    ))}

    {entry.bullets.length > 0 && (
      <ul className="mt-3 space-y-2">
        {entry.bullets.map((bullet, index) => (
          <li
            key={`${bullet}-${index}`}
            className="flex max-w-[68ch] gap-3 text-sm leading-relaxed"
            style={{ color: theme.colors.text }}
          >
            <span
              aria-hidden
              className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full"
              style={{ background: theme.colors.accent }}
            />
            <span className="break-words">{bullet}</span>
          </li>
        ))}
      </ul>
    )}
  </>
);

interface EntriesProps {
  theme: ThemeTokens;
  title: string;
  block: string;
}

export const Entries = ({ theme, title, block }: EntriesProps) => {
  const entries = parseEntries(block).filter(
    (entry) => entry.title || entry.org || entry.bullets.length || entry.notes.length,
  );
  if (!entries.length) return null;

  return (
    <Section theme={theme} title={title}>
      {/* A rail down the left on desktop, plain stacked blocks on mobile: the
          dotted timeline is the first thing to get cramped on a narrow screen,
          so it is an enhancement rather than the structure. */}
      <ul
        className="space-y-10 sm:space-y-12 sm:border-l sm:pl-7"
        style={{ borderColor: theme.colors.border }}
      >
        {entries.map((entry, index) => (
          <li key={`${entry.title}-${index}`} className="relative">
            <span
              aria-hidden
              className="absolute -left-[33px] top-2 hidden h-2 w-2 rounded-full sm:block"
              style={{ background: theme.colors.accent }}
            />
            <EntryBlock theme={theme} entry={entry} />
          </li>
        ))}
      </ul>
    </Section>
  );
};

// --------------------------------------------------------------- projects ---

export const Projects = ({ theme, block }: { theme: ThemeTokens; block: string }) => {
  const items: LeadIn[] = parseLeadIns(block);
  if (!items.length) return null;

  // A lone project stretched across a three-column grid looks like a mistake,
  // so the grid only widens once there is enough to fill it.
  const columns =
    items.length === 1
      ? "grid-cols-1 max-w-xl"
      : items.length === 2
        ? "grid-cols-1 sm:grid-cols-2"
        : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";

  return (
    <Section theme={theme} title="Projects">
      <div className={`grid gap-4 ${columns}`}>
        {items.map((item, index) => (
          <article
            key={`${item.lead}-${index}`}
            className={`${theme.shape.card} ${theme.shape.radius} p-4`}
            style={{
              borderColor: theme.colors.border,
              background: theme.colors.surface,
            }}
          >
            <h3
              className="break-words text-sm font-semibold"
              style={{ color: theme.colors.text, fontFamily: theme.fonts.heading }}
            >
              {item.lead}
            </h3>
            {item.rest && (
              <p
                className="mt-2 text-sm leading-relaxed"
                style={{ color: theme.colors.muted }}
              >
                {item.rest}
              </p>
            )}
          </article>
        ))}
      </div>
    </Section>
  );
};

// ----------------------------------------------------------------- skills ---

export const Skills = ({ theme, block }: { theme: ThemeTokens; block: string }) => {
  const groups = parseSkillGroups(block);
  if (!groups.length) return null;

  return (
    <Section theme={theme} title="Skills">
      <div className="space-y-5">
        {groups.map((group, index) => (
          <div key={`${group.label}-${index}`}>
            {group.label && (
              <p
                className="mb-2 text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: theme.colors.muted }}
              >
                {group.label}
              </p>
            )}
            {/* Chips, never proficiency bars. A bar puts a number on something
                nobody measured, and reads as invented precision. */}
            <ul className="flex flex-wrap gap-2">
              {group.items.map((item, index) => (
                <li
                  key={`${item}-${index}`}
                  className={`${theme.shape.radius} px-2.5 py-1 text-xs`}
                  style={{
                    background: theme.colors.surface,
                    color: theme.colors.text,
                    border: `1px solid ${theme.colors.border}`,
                  }}
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
};

// --------------------------------------------------- simple listed sections ---

interface ListProps {
  theme: ThemeTokens;
  title: string;
  block: string;
}

/** Certifications, interests, languages — structurally the same shape, so
 *  they share one component rather than three that drift apart. */
export const LeadInList = ({ theme, title, block }: ListProps) => {
  const items = parseLeadIns(block);
  if (!items.length) return null;

  return (
    <Section theme={theme} title={title}>
      <ul className="space-y-3">
        {items.map((item, index) => (
          <li key={`${item.lead}-${index}`} className="max-w-[65ch] text-sm">
            <span className="break-words font-medium" style={{ color: theme.colors.text }}>
              {item.lead}
            </span>
            {item.rest && (
              <span className="break-words" style={{ color: theme.colors.muted }}>
                {" — "}
                {item.rest}
              </span>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
};

export const PlainList = ({ theme, title, block }: ListProps) => {
  const items = lines(block);
  if (!items.length) return null;

  return (
    <Section theme={theme} title={title}>
      <ul className="flex flex-wrap gap-2">
        {items.map((item, index) => (
          <li
            key={`${item}-${index}`}
            className={`${theme.shape.radius} px-2.5 py-1 text-xs`}
            style={{
              background: theme.colors.surface,
              color: theme.colors.text,
              border: `1px solid ${theme.colors.border}`,
            }}
          >
            {item}
          </li>
        ))}
      </ul>
    </Section>
  );
};
