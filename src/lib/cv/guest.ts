import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

/**
 * Guest sessions: who the visitor is before they sign up, and how they stop
 * being a guest without losing anything.
 *
 * A guest is a real Supabase account created by `signInAnonymously()` — a
 * unique id and a valid JWT, with no email. That matters more than it sounds:
 * every ownership check in this product keys on the id, so a guest's CVs,
 * chat history and drafts are stored and isolated exactly like anyone else's.
 * The only thing they lack is a way back in from another device.
 */

/** True when this account was created anonymously and has not been converted. */
export function isGuest(user: User | null | undefined): boolean {
  if (!user) return false;
  // Supabase sets is_anonymous; the email check covers a project predating it.
  return Boolean(user.is_anonymous ?? !user.email);
}

/**
 * A stable, friendly name for a guest — "Guest 511".
 *
 * Derived from the account id rather than random, so it does not change
 * between renders or reloads, and carries no personal information. Purely a
 * display convenience: nothing keys on it.
 */
export function guestName(user: User | null | undefined): string {
  return guestNameFromId(user?.id ?? "");
}

/**
 * The same name from a bare id — what the admin User Management page has,
 * since it reads rows out of a SECURITY DEFINER function rather than holding
 * a Supabase `User`. Sharing the derivation means the admin sees the same
 * "Guest 511" the visitor does, which is the whole use for it.
 */
export function guestNameFromId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return `Guest ${(hash % 900) + 100}`;
}

export interface ConvertResult {
  ok: boolean;
  /** Set when Supabase is configured to confirm addresses before they work. */
  needsEmailConfirmation?: boolean;
  error?: string;
}

/**
 * Turn the current guest account into a permanent one, keeping everything.
 *
 * `updateUser` attaches an email and password to the account that already
 * exists, so the user id never changes — every CV, session and transcript
 * built as a guest stays attached with nothing to migrate and no "claim your
 * data" step. That property is the whole reason this is built on anonymous
 * auth rather than on a device fingerprint.
 */
export async function convertGuestAccount(
  email: string,
  password: string,
  metadata?: Record<string, unknown>,
): Promise<ConvertResult> {
  if (!supabase) return { ok: false, error: "Accounts aren't available on this deployment." };

  const { data, error } = await supabase.auth.updateUser({
    email: email.trim().toLowerCase(),
    password,
    ...(metadata ? { data: metadata } : {}),
  });

  if (error) return { ok: false, error: messageFor(error.message) };

  // With "Confirm email" on, the address is pending until the link is opened:
  // Supabase reports it under new_email and leaves the account usable
  // meanwhile. Saying so is the difference between "check your inbox" and the
  // visitor assuming it silently failed.
  const pending = Boolean((data.user as { new_email?: string } | null)?.new_email);
  return { ok: true, needsEmailConfirmation: pending };
}

function messageFor(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("already") && (lower.includes("registered") || lower.includes("exists"))) {
    return "An account with that email already exists — sign in to it instead.";
  }
  if (lower.includes("password")) return "Choose a stronger password (at least 6 characters).";
  if (lower.includes("rate") || lower.includes("limit")) {
    return "Too many attempts right now — wait a few minutes and try again.";
  }
  if (lower.includes("network") || lower.includes("fetch")) {
    return "Couldn't reach the server. Try again.";
  }
  return "Couldn't save your account. Please try again.";
}

/**
 * Why guest sign-in failed, in words a *visitor* should read.
 *
 * Nothing here names a dashboard, a provider or a setting. Whoever hits this
 * is trying to write a CV; telling them to go and configure somebody else's
 * Supabase project is noise at best, and at worst it advertises how the site
 * is built. The fix for a misconfiguration belongs to the owner, and the
 * owner has `?debug=1` (below) and the browser console.
 *
 * Order matters here and is not alphabetical. Supabase's rate-limit error for
 * anonymous sign-in has the word "anonymous" in it, so checking "is the
 * provider off" first reports a temporary block as a permanent one — which
 * sends the owner to a setting that is already correct.
 */
export function guestSignInMessage(
  error: string | { message: string; status?: number; code?: string },
  options: { verbose?: boolean } = {},
): string {
  const raw = typeof error === "string" ? error : error.message;
  const code = typeof error === "string" ? undefined : error.code;
  const status = typeof error === "string" ? undefined : error.status;
  // The machine-readable code is the reliable half — the prose gets reworded
  // between releases, `code` does not.
  const lower = `${raw} ${code ?? ""}`.toLowerCase();

  const detail = options.verbose
    ? ` [${[raw, code && `code: ${code}`, status && `status: ${status}`]
        .filter(Boolean)
        .join(" · ")}]`
    : "";

  // First, because it is the one that resolves itself and the one whose
  // message overlaps with every other case.
  if (status === 429 || lower.includes("rate limit") || lower.includes("too many")) {
    return `Too many people started here just now. Wait a minute and try again.${detail}`;
  }
  if (lower.includes("network") || lower.includes("fetch")) {
    return `Couldn't reach the server. Check your connection and try again.${detail}`;
  }
  // Both of these are the owner's to fix and neither is worth explaining to a
  // visitor, so they get the same honest, actionable-for-them sentence.
  if (
    lower.includes("anonymous") ||
    lower.includes("captcha") ||
    lower.includes("signups not allowed")
  ) {
    return `Building without an account isn't available right now — you can create one instead, it takes a moment.${detail}`;
  }
  return `Couldn't start without an account. Please try again, or create one.${detail}`;
}

/**
 * True when the page was opened as /cv-builder/login?debug=1.
 *
 * The escape hatch for diagnosing this from a phone, where there is no
 * console to open. Off for everybody else, so the diagnostic detail never
 * reaches an ordinary visitor.
 */
export function wantsDiagnostics(search: string): boolean {
  return new URLSearchParams(search).get("debug") === "1";
}
