import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  fetchPublicPortfolio,
  type PortfolioLoad,
  type PublicPortfolio as Portfolio,
} from "@/lib/portfolio/api";
import { THEMES, fontHref, resolveTheme } from "@/lib/portfolio/themes";
import {
  Entries,
  Hero,
  LeadInList,
  PlainList,
  Profile,
  Projects,
  Skills,
} from "@/components/portfolio/PortfolioSections";

/**
 * Somebody's published portfolio, at /p/<session id>.
 *
 * Deliberately outside every shell the rest of the app has: no CvAppShell, no
 * portfolio-owner navigation, no theme provider. This page belongs to the
 * person who published it, and a stranger opening the link should see their
 * page — not our product with their name in it. That is also why it paints
 * its own background over the viewport rather than inheriting the site's.
 *
 * It reads straight from Postgres (see lib/portfolio/api.ts), so it does not
 * wait on cv-service and cannot be slowed by a cold start.
 */
const PublicPortfolio = () => {
  const { id = "" } = useParams();
  const [state, setState] = useState<PortfolioLoad | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchPublicPortfolio(id).then((result) => {
      if (!cancelled) setState(result);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const portfolio = state?.status === "ok" ? state.portfolio : null;
  const themeKey = resolveTheme(portfolio?.theme);
  const theme = THEMES[themeKey];

  // Title and webfont are side effects on the document itself, which is
  // correct here: this route owns the whole page rather than sitting inside
  // the app's chrome.
  useEffect(() => {
    if (!portfolio) return;
    const previous = document.title;
    const name = portfolio.full_name.trim();
    document.title = name
      ? `${name}${portfolio.headline ? ` — ${portfolio.headline}` : ""}`
      : "Portfolio";
    return () => {
      document.title = previous;
    };
  }, [portfolio]);

  useEffect(() => {
    const href = portfolio ? fontHref(themeKey) : null;
    if (!href) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
    return () => {
      link.remove();
    };
  }, [portfolio, themeKey]);

  if (state === null) {
    // Blank rather than a spinner: the fetch is a single indexed lookup and
    // is normally done within a frame or two, and a spinner that flashes for
    // 80ms is worse than nothing.
    return <div className="min-h-[100svh] bg-white" />;
  }

  if (state.status !== "ok" || !portfolio) {
    return <NotAvailable unreachable={state.status === "error"} />;
  }

  const name = portfolio.full_name.trim() || "Portfolio";

  return (
    <div
      className="min-h-[100svh] antialiased"
      style={{
        background: theme.colors.bg,
        color: theme.colors.text,
        fontFamily: theme.fonts.body,
      }}
    >
      {/* A dark theme printed on white paper wastes ink and looks broken, and
          "save as PDF" is exactly what someone does with a portfolio they
          like. Print gets forced back to black on white, and link targets are
          written out so a printed page is not full of dead "here"s. */}
      <style>{`
        @media print {
          :root { color-scheme: light; }
          .portfolio-root, .portfolio-root * {
            background: #fff !important;
            color: #000 !important;
            border-color: #bbb !important;
          }
          .portfolio-root a[href^="http"]::after { content: " (" attr(href) ")"; font-size: 0.85em; }
          .portfolio-print-hide { display: none !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .portfolio-root * { animation: none !important; transition: none !important; }
        }
      `}</style>

      <main className="portfolio-root mx-auto w-full max-w-3xl px-5 py-14 sm:px-8 sm:py-24">
        <Hero
          theme={theme}
          fullName={name}
          headline={portfolio.headline}
          contact={portfolio.contact}
        />

        <Profile theme={theme} text={portfolio.profile} />
        <Entries theme={theme} title="Experience" block={portfolio.experience} />
        <Entries theme={theme} title="Internships" block={portfolio.internships} />
        <Projects theme={theme} block={portfolio.projects} />
        <Skills theme={theme} block={portfolio.skills} />
        <Entries theme={theme} title="Education" block={portfolio.education} />
        <LeadInList theme={theme} title="Certifications" block={portfolio.certifications} />
        <PlainList theme={theme} title="Languages" block={portfolio.languages} />
        <PlainList theme={theme} title="Interests" block={portfolio.interests} />

        <footer
          className="mt-20 border-t pt-6 text-xs"
          style={{ borderColor: theme.colors.border, color: theme.colors.muted }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              © {new Date().getFullYear()} {name}
            </span>
            <Link
              to="/cv-builder"
              className="portfolio-print-hide underline-offset-4 hover:underline"
              style={{ color: theme.colors.muted }}
            >
              Built with the CV Builder
            </Link>
          </div>
        </footer>
      </main>
    </div>
  );
};

/**
 * One page for "no such portfolio" and for "we could not reach the database".
 *
 * The two are told apart only by the wording of the second line, and never by
 * saying whether the id exists: `public_portfolio` returns published rows
 * only, so an unpublished draft and a wrong id are the same answer by design.
 * Distinguishing them here would hand back a way to test whether a given
 * session id is real.
 */
const NotAvailable = ({ unreachable }: { unreachable: boolean }) => (
  <div className="flex min-h-[100svh] items-center justify-center bg-neutral-950 px-6">
    <div className="max-w-sm text-center">
      <h1 className="font-sora text-xl font-bold text-neutral-100">
        This portfolio isn't available
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-neutral-400">
        {unreachable
          ? "We couldn't load it just now. Try again in a moment."
          : "The link may be wrong, or the page may have been unpublished by its owner."}
      </p>
      <Link
        to="/"
        className="mt-6 inline-block rounded-full border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-500"
      >
        Go to the homepage
      </Link>
    </div>
  </div>
);

export default PublicPortfolio;
