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
