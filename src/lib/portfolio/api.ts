import { supabase } from "@/lib/supabase";
import type { PortfolioTheme } from "./themes";

/**
 * Reading and publishing portfolios.
 *
 * Both go straight to Postgres through SECURITY DEFINER functions rather than
 * through cv-service, for two reasons that are worth keeping in view:
 *
 * 1. **Column control.** RLS grants whole rows, and a cv_sessions row holds
 *    the phone number and street address. `public_portfolio` returns a
 *    chosen set of columns with the phone already filtered, so the privacy
 *    rule holds for anyone reading the API — not just for people looking at
 *    our page.
 * 2. **Speed.** cv-service is on Render's free tier and can take up to a
 *    minute to wake. A portfolio link is shared with strangers and put on a
 *    CV; it cannot open with a cold start in front of it. This answers in
 *    milliseconds regardless of whether the CV builder is awake.
 */

export interface PublicPortfolio {
  full_name: string;
  headline: string;
  profile: string;
  contact: string;
  experience: string;
  internships: string;
  education: string;
  skills: string;
  languages: string;
  interests: string;
  projects: string;
  certifications: string;
  theme: string;
  updated_at: string | null;
}

export type PortfolioLoad =
  | { status: "ok"; portfolio: PublicPortfolio }
  | { status: "not-found" }
  | { status: "error" };

/**
 * Fetch a published portfolio.
 *
 * "Not published" and "does not exist" deliberately come back the same way:
 * the function only ever returns published rows, so an unpublished draft is
 * indistinguishable from a wrong id. Distinguishing them would turn this into
 * a way to test whether a given session id is real.
 */
export async function fetchPublicPortfolio(id: string): Promise<PortfolioLoad> {
  if (!supabase) return { status: "error" };

  // A malformed id would make Postgres raise on the uuid cast, which surfaces
  // as "we couldn't load it" rather than the "not found" page a typo should
  // get. The real uuid shape, not a loose character-class-and-length check —
  // that admitted 36 dashes and 35 hex digits, both of which reached the RPC
  // and raised.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return { status: "not-found" };
  }

  const { data, error } = await supabase.rpc("public_portfolio", { pid: id });

  if (error) return { status: "error" };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { status: "not-found" };
  return { status: "ok", portfolio: row as PublicPortfolio };
}

export interface PublishState {
  published: boolean;
  theme: PortfolioTheme;
  showPhone: boolean;
}

/**
 * What this session's portfolio settings currently are, for the owner.
 *
 * Without this the publish panel opens claiming nothing is published, because
 * its state started empty — so somebody who published, closed it and came
 * back would be told their live page was offline, and shown a Publish button
 * for a page that already exists.
 *
 * Read straight from the row rather than through `public_portfolio`: the
 * owner is allowed to see their own settings whether or not the page is live,
 * and the public function deliberately returns nothing for an unpublished
 * one. The existing "own sessions" RLS policy is what authorises this.
 *
 * Returns null rather than throwing when the columns are not there yet — the
 * schema is applied by a workflow on push, so the frontend can be live for a
 * few minutes before the migration has run.
 */
export async function fetchPublishState(
  sessionId: string,
): Promise<PublishState | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("cv_sessions")
      .select("published, theme, show_phone")
      .eq("id", sessionId)
      .maybeSingle();

    if (error || !data) return null;
    return {
      published: Boolean(data.published),
      theme: (data.theme ?? "") as PortfolioTheme,
      showPhone: Boolean(data.show_phone),
    };
  } catch {
    return null;
  }
}

/**
 * Publish, unpublish, or restyle a portfolio.
 *
 * Returns false when the row was not the caller's, and throws only for a
 * refusal worth showing — publishing as a guest. That refusal is enforced in
 * the database, not here: `authenticated` includes anonymous guests, so the
 * UI hiding the button would not actually be a rule.
 */
export async function setPublished(
  sessionId: string,
  state: Partial<PublishState> & { published: boolean },
): Promise<boolean> {
  if (!supabase) return false;

  const { data, error } = await supabase.rpc("set_portfolio_published", {
    pid: sessionId,
    make_public: state.published,
    pick_theme: state.theme ?? null,
    publish_phone: state.showPhone ?? null,
  });

  if (error) throw new Error(error.message);
  return Boolean(data);
}

/** The public URL for a portfolio, absolute so it can be copied and shared. */
export function portfolioUrl(sessionId: string): string {
  return `${window.location.origin}/p/${sessionId}`;
}
