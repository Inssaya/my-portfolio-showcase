/**
 * The looks a visitor can put their portfolio in.
 *
 * Chosen from a picker, never assigned. There is no inference from the
 * person's name, and nothing here is gendered: someone who wants the soft
 * rose palette picks it, and so does anyone else. Guessing would be wrong
 * often enough to be embarrassing — the same name reads male in one country
 * and female in another — and asking would be a strange question for a
 * professional tool to put to somebody.
 *
 * Palettes carry their own text colours rather than inheriting the site's,
 * because a published page is not part of the app's chrome: it belongs to the
 * person who published it and has to look deliberate on its own. Every body
 * colour below clears WCAG AA against its background.
 */

export type PortfolioTheme =
  | "obsidian"
  | "rosewood"
  | "editorial"
  | "brutalist"
  | "sunfield";

export const DEFAULT_THEME: PortfolioTheme = "obsidian";

export interface ThemeTokens {
  name: string;
  /** One line for the picker — what this theme is *for*. */
  blurb: string;
  colors: {
    bg: string;
    surface: string;
    text: string;
    muted: string;
    accent: string;
    /** Readable *on* the accent — several accents are light and need dark ink. */
    onAccent: string;
    border: string;
  };
  fonts: {
    /** CSS font-family stacks, with real fallbacks: a page must not depend on
     *  a webfont arriving to be readable. */
    heading: string;
    body: string;
  };
  /** Google Fonts families to request, or [] for a system-font theme. */
  webfonts: string[];
  shape: {
    /** Tailwind radius class used for cards and chips. */
    radius: string;
    /** Card treatment — themes differ more in this than in colour. */
    card: string;
    /** Section heading treatment. */
    heading: string;
  };
}

const INTER = '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

export const THEMES: Record<PortfolioTheme, ThemeTokens> = {
  obsidian: {
    name: "Obsidian",
    blurb: "Dark, technical, high contrast.",
    colors: {
      bg: "#0B0D10",
      surface: "#15181D",
      text: "#F4F6F8",
      muted: "#9AA3AD",
      accent: "#5EEAD4",
      onAccent: "#04201C",
      border: "rgba(255,255,255,0.10)",
    },
    fonts: {
      heading: '"Space Grotesk", ui-sans-serif, system-ui, sans-serif',
      body: '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif',
    },
    webfonts: ["Space+Grotesk:wght@500;700", "IBM+Plex+Sans:wght@400;600"],
    shape: {
      radius: "rounded-xl",
      card: "border",
      heading: "text-xs font-mono uppercase tracking-[0.2em]",
    },
  },

  rosewood: {
    name: "Rosewood",
    blurb: "Warm and elegant, printed-invitation feel.",
    colors: {
      bg: "#FBF4EF",
      surface: "#F3E4DC",
      text: "#3A2620",
      muted: "#7A6259",
      accent: "#B5484F",
      onAccent: "#FFFFFF",
      border: "rgba(58,38,32,0.14)",
    },
    fonts: {
      heading: '"Fraunces", Georgia, "Times New Roman", serif',
      body: INTER,
    },
    webfonts: ["Fraunces:opsz,wght@9..144,400;9..144,600", "Inter:wght@400;600"],
    shape: {
      radius: "rounded-2xl",
      card: "border",
      heading: "text-xs uppercase tracking-[0.18em] font-semibold",
    },
  },

  editorial: {
    name: "Editorial",
    blurb: "Restrained and typographic. Lets the work speak.",
    colors: {
      bg: "#FFFFFF",
      surface: "#F5F5F4",
      text: "#18181B",
      muted: "#6B6B6B",
      accent: "#1D4ED8",
      onAccent: "#FFFFFF",
      border: "rgba(24,24,27,0.12)",
    },
    fonts: {
      heading: '"Libre Caslon Text", Georgia, serif',
      body: INTER,
    },
    webfonts: ["Libre+Caslon+Text:wght@400;700", "Inter:wght@400;600"],
    shape: {
      radius: "rounded-none",
      // No shadows anywhere: rules and whitespace only. The restraint is the
      // theme, so this one deliberately has no card fill at all.
      card: "border-t",
      heading: "text-xs uppercase tracking-[0.18em] font-semibold",
    },
  },

  brutalist: {
    name: "Brutalist",
    blurb: "Hard edges, heavy borders, unmissable.",
    colors: {
      bg: "#FFFDF5",
      surface: "#FFFFFF",
      text: "#111111",
      muted: "#555555",
      accent: "#FF5A1F",
      onAccent: "#111111",
      border: "#111111",
    },
    fonts: {
      heading: '"Archivo Black", Impact, sans-serif',
      body: INTER,
    },
    webfonts: ["Archivo+Black", "Inter:wght@400;600"],
    shape: {
      radius: "rounded-none",
      card: "border-2",
      heading: "text-xs uppercase tracking-[0.2em] font-bold",
    },
  },

  sunfield: {
    name: "Sunfield",
    blurb: "Rounded and friendly, without being childish.",
    colors: {
      bg: "#FFFFFF",
      surface: "#F0F7F4",
      text: "#1F2A24",
      muted: "#5B6B62",
      accent: "#F5A623",
      onAccent: "#1F2A24",
      border: "rgba(31,42,36,0.12)",
    },
    fonts: {
      heading: '"Poppins", ui-sans-serif, system-ui, sans-serif',
      body: '"Nunito Sans", ui-sans-serif, system-ui, sans-serif',
    },
    webfonts: ["Poppins:wght@500;700", "Nunito+Sans:wght@400;600"],
    shape: {
      radius: "rounded-2xl",
      card: "border",
      heading: "text-xs uppercase tracking-[0.14em] font-bold",
    },
  },
};

export const THEME_KEYS = Object.keys(THEMES) as PortfolioTheme[];

/** Unknown values fall back rather than rendering an unstyled page — the
 *  database deliberately does not constrain this column. */
export function resolveTheme(value: string | null | undefined): PortfolioTheme {
  return value && value in THEMES ? (value as PortfolioTheme) : DEFAULT_THEME;
}

/**
 * The Google Fonts stylesheet for one theme, or null for none.
 *
 * Only the chosen theme's faces are requested — loading all five would be
 * most of a megabyte for four looks nobody is seeing. `display=swap` so the
 * text is readable in the fallback face while the webfont arrives rather than
 * the page sitting blank.
 */
export function fontHref(theme: PortfolioTheme): string | null {
  const families = THEMES[theme].webfonts;
  if (!families.length) return null;
  return `https://fonts.googleapis.com/css2?${families
    .map((family) => `family=${family}`)
    .join("&")}&display=swap`;
}
